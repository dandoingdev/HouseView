// Registry of overviews, plus validation and normalisation of the carousel's `screensaver` block.
// registerOverview also registers the derived card-mode widget and the overview's strings, so the generated
// src/overviews/index.js stays a plain "register each module" file like src/widgets/index.js.
import {DEFAULT_IDLE_SECONDS} from './idle.js';
import {checkEntity, checkOptions, resolveOptions} from './define-overview.js';
import {registerWidget} from './registry.js';
import {registerStrings} from './i18n.js';
import screensaverStrings from './screensaver-strings.js';

export const MIN_IDLE_SECONDS = 5;
export const MAX_IDLE_SECONDS = 86400;

/** @type {Map<string, Object>} type -> defineOverview module */
const overviews = new Map();
registerStrings(screensaverStrings);

/**
 * Add an overview. Registers its derived widget (card mode, picker, standalone element) with the widget
 * registry and its strings with the translator. Throws on a duplicate type or order; nothing is added then.
 * @param {Object} overview   the result of defineOverview
 */
export function registerOverview(overview) {
  if (overviews.has(overview.type)) throw new Error(`Duplicate overview: ${overview.type}`);
  if ([...overviews.values()].some((o) => o.order === overview.order)) {
    throw new Error(`Duplicate overview order: ${overview.order}`);
  }
  // Card mode and the standalone card go through the ordinary widget registry. It can still refuse (a duplicate
  // tag, say), so it goes first: a refused overview must not stay registered half way.
  registerWidget(overview.widget);
  overviews.set(overview.type, overview);
  registerStrings(overview.strings);
  return overview;
}

export const getOverview = (type) => overviews.get(type);
export const overviewList = () => [...overviews.values()].sort((a, b) => a.order - b.order);
export const overviewTypes = () => overviewList().map((o) => o.type);
export const overviewLabels = () =>
  Object.fromEntries(overviewList().map((o) => [o.type, o.label]));

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const checkBoolean = (value, key) => {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(`Screensaver ${key} must be true or false.`);
  }
};

function checkIdleTimeout(seconds) {
  if (seconds === undefined) return;
  const valid =
    typeof seconds === 'number' &&
    (seconds === 0 || (seconds >= MIN_IDLE_SECONDS && seconds <= MAX_IDLE_SECONDS));
  if (!valid) {
    throw new Error(
      `Screensaver idle_timeout must be 0 or a number of seconds from ${MIN_IDLE_SECONDS} to ${MAX_IDLE_SECONDS}.`
    );
  }
}

/**
 * The automatic displays: overviews that the dashboard's own widgets switch on, without a `screensaver` entry
 * (docs/overview-api.md). `key` is the card option (true by default, false = off, a list of entity ids replaces the
 * widget-derived list), `widget` the widget type whose entities seed the list, `overview` the overview each one shows.
 */
export const AUTOMATIC_DISPLAYS = Object.freeze([
  {key: 'timer_display', overview: 'timer', widget: 'timer', domain: 'timer'},
  {key: 'music_screensaver', overview: 'cover_art', widget: 'media_player', domain: 'media_player'}
]);

const isEntityOf = (domain) => (id) => typeof id === 'string' && id.startsWith(`${domain}.`);

/** `timer_display` / `music_screensaver`: true, false or a list of entities of the display's domain. */
function validateAutomaticDisplays(config) {
  for (const {key, domain} of AUTOMATIC_DISPLAYS) {
    const value = config[key];
    if (value === undefined || typeof value === 'boolean') continue;
    if (!Array.isArray(value) || !value.every(isEntityOf(domain))) {
      throw new Error(`${key} must be true, false or a list of ${domain} entities.`);
    }
  }
}

/** `doorbell`: {entity, camera, duration}, an extra feature rather than a screensaver. Checked with the doorbell overview's own rules. */
function validateDoorbell(config) {
  const raw = config.doorbell;
  if (raw === undefined) return;
  const overview = overviews.get('doorbell');
  if (!overview) return;
  if (!isObject(raw)) throw new Error('doorbell must be an object with an entity and a camera.');
  checkEntity(overview, raw.entity, 'doorbell');
  checkOptions(overview, resolveOptions(overview, raw));
}

/**
 * Validate `config.screensaver` (an object or a list) and the automatic display options. Throws the exact messages
 * listed in docs/overview-api.md. Runs LAST in setConfig, after every other check, so the precedence of existing error
 * messages is unchanged. `config.widgets` already exists here: `cards:` has been converted.
 * @param {Object} config
 */
export function validateScreensaver(config) {
  validateScreensaverBlock(config);
  validateAutomaticDisplays(config);
  validateDoorbell(config);
}

function validateScreensaverBlock(config) {
  const raw = config.screensaver;
  if (raw === undefined) return;
  if (Array.isArray(raw) && !raw.length) {
    throw new Error('Screensaver list needs at least one entry.');
  }
  for (const entry of Array.isArray(raw) ? raw : [raw]) {
    if (!isObject(entry)) throw new Error('Screensaver must be an object or a list of objects.');
    if (!entry.type) throw new Error('Screensaver needs a type.');
    const overview = overviews.get(entry.type);
    if (!overview) throw new Error(`Unsupported screensaver: ${entry.type}`);
    checkBoolean(entry.enabled, 'enabled');
    checkBoolean(entry.start_in_edit_mode, 'start_in_edit_mode');
    checkBoolean(entry.preview, 'preview');
    checkIdleTimeout(entry.idle_timeout);
    checkEntity(overview, entry.entity, 'screensaver');
    checkOptions(overview, resolveOptions(overview, entry));
  }
}

/**
 * @typedef {Object} ScreensaverEntry
 * @property {number} index
 * @property {string} type
 * @property {Object} overview          the defineOverview module
 * @property {boolean} enabled          default true
 * @property {number} idleTimeout       seconds; default 120; 0 = never start by itself
 * @property {boolean} startInEditMode  default false
 * @property {boolean} preview          default false
 * @property {boolean} event            true for an `activation: 'event'` overview: never started by idle time,
 *                                      left out of the round robin, started by the overview's autoShow instead
 * @property {number} priority          the overview's priority (default 0): the highest eligible idle entry wins an activation
 * @property {boolean} implicit         true for an entry the framework added for a widget (timer_display, music_screensaver),
 *                                      false for one the user wrote in `screensaver:`. An implicit entry has no timeout of its own
 * @property {Object} options           resolved options incl. entity and name
 */

/**
 * Validated config -> entries the controller runs: the explicit `screensaver` entries in order, then the implicit ones
 * (docs/overview-api.md). [] when there is neither. Never throws.
 * @param {Object} config
 * @returns {ScreensaverEntry[]}
 */
export function normalizeScreensaver(config) {
  const raw = config.screensaver;
  const entries = [];
  if (raw !== undefined) {
    (Array.isArray(raw) ? raw : [raw]).forEach((entry, index) => {
      const overview = isObject(entry) ? overviews.get(entry.type) : undefined;
      if (!overview) return; // unreachable after validateScreensaver; never throw from here
      entries.push({
        index,
        type: entry.type,
        overview,
        enabled: entry.enabled !== false,
        idleTimeout: entry.idle_timeout ?? DEFAULT_IDLE_SECONDS,
        startInEditMode: entry.start_in_edit_mode === true,
        preview: entry.preview === true,
        event: overview.activation === 'event',
        priority: overview.priority ?? 0,
        implicit: false,
        options: resolveOptions(overview, entry)
      });
    });
  }
  entries.push(...implicitEntries(config, entries));
  return entries;
}

/**
 * The entries the dashboard's widgets imply: one per timer widget (an event overlay) and one per media player widget
 * (an idle entry that only wins while it is eligible). `explicit` are the entries the user wrote: for the same overview
 * and entity they win, enabled or not (a disabled one is the way to switch a single entity off). Overviews that are not
 * registered are skipped, so the entries exist exactly when the bundle contains the overview.
 */
function implicitEntries(config, explicit) {
  const entries = [];
  // A stand-alone card (`houseview-timer-card`, ...) hosts its one widget in a carousel of its own (`single_widget`):
  // it is a tile on somebody else's dashboard and must never take the whole screen over.
  if (config.single_widget) return entries;
  let index = Array.isArray(config.screensaver) ? config.screensaver.length : explicit.length;
  for (const display of AUTOMATIC_DISPLAYS) {
    const overview = overviews.get(display.overview);
    const setting = config[display.key];
    if (!overview || setting === false) continue;
    const ids = Array.isArray(setting)
      ? setting
      : (config.widgets ?? []).filter((w) => w?.type === display.widget).map((w) => w.entity);
    for (const id of new Set(ids.filter(isEntityOf(display.domain)))) {
      if (explicit.some((e) => e.type === overview.type && e.options.entity === id)) continue;
      entries.push({
        index: index++,
        type: overview.type,
        overview,
        enabled: true,
        idleTimeout: DEFAULT_IDLE_SECONDS,
        startInEditMode: false,
        preview: false,
        event: overview.activation === 'event',
        priority: overview.priority ?? 0,
        implicit: true,
        options: resolveOptions(overview, {entity: id})
      });
    }
  }
  const doorbell = config.doorbell;
  const ring = overviews.get('doorbell');
  if (ring && doorbell?.entity && doorbell.enabled !== false) {
    entries.push({
      index: index++,
      type: ring.type,
      overview: ring,
      enabled: true,
      idleTimeout: DEFAULT_IDLE_SECONDS,
      startInEditMode: false,
      preview: false,
      event: true,
      priority: ring.priority ?? 0,
      implicit: true,
      options: resolveOptions(ring, doorbell)
    });
  }
  return entries;
}

const priorityOf = (entry) => entry.priority ?? entry.overview?.priority ?? 0;

/**
 * Which enabled idle entry does an activation show? Event entries (`event: true`) are never picked: they are started
 * by their own autoShow, not by idle time. Among the candidates the highest `priority` wins (an entry's own, else its
 * overview's, default 0); equal priorities take turns: the first one at or after `cursor` wins (round robin). With
 * every priority equal and every entry eligible this is the plain round robin.
 * @param {{enabled: boolean, event?: boolean, implicit?: boolean, priority?: number}[]} entries
 * @param {number} [cursor]
 * @param {{eligible?: (entry: Object) => boolean, explicitOnly?: boolean}} [rules]
 *   `eligible` takes an entry out of the running (it is asked only about an entry that would beat the best one found so
 *   far, so the common case costs one call per higher priority entry); `explicitOnly` leaves the implicit entries out (the idle timeout, 8.10)
 * @returns {{entry: Object|undefined, next: number}}  `entry` is undefined when no candidate remains
 */
export function pickEntry(entries, cursor = 0, {eligible, explicitOnly = false} = {}) {
  let best = -1;
  let bestPriority = -Infinity;
  for (let i = 0; i < entries.length; i++) {
    const at = (cursor + i) % entries.length;
    const entry = entries[at];
    if (!entry.enabled || entry.event || (explicitOnly && entry.implicit)) continue;
    const priority = priorityOf(entry);
    if (priority <= bestPriority) continue; // an earlier entry in the rotation wins a tie
    if (eligible && !eligible(entry)) continue;
    best = at;
    bestPriority = priority;
  }
  return best < 0
    ? {entry: undefined, next: cursor}
    : {entry: entries[best], next: (best + 1) % entries.length};
}
