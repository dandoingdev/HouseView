// Pure data mapping for the home overview: the carousel's widgets plus Home Assistant states -> chips, cameras and
// scenes. No DOM, no Date.now, no Intl, no strings: `now` and the number formatter are passed in, words and markup
// are made in index.js.

/** Cameras shown on the home screen (the rest are one press away in the camera gallery). */
export const MAX_CAMERAS = 3;
/** The widget type of the overview itself: never part of its own content. */
const SELF = 'home_overview';
const UNKNOWN = new Set(['unavailable', 'unknown']);
const UNLOCKED = new Set(['unlocked', 'open', 'opening', 'unlocking', 'jammed']);
const LOCKED = new Set(['locked', 'locking']);

const isId = (value, domain) => typeof value === 'string' && value.startsWith(`${domain}.`);
const known = (state) => !!state && typeof state.state === 'string' && !UNKNOWN.has(state.state);

/**
 * The widgets the home screen is made of, grouped by kind, each with its position in `widgets` (the widget's
 * `data-widget` number, which `goto-widget` takes). One entry per entity: the first widget that names it wins.
 * @param {any[]|undefined} widgets   the card's normalised widget list
 * @returns {{climate: Item[], light: Item[], lock: Item[], media: Item[], camera: Item[], scene: Item[]}}
 *
 * @typedef {{index: number, entity: string, name?: string, icon?: string}} Item
 */
export function collect(widgets) {
  const groups = {climate: [], light: [], lock: [], media: [], camera: [], scene: []};
  const seen = new Set();
  (Array.isArray(widgets) ? widgets : []).forEach((widget, index) => {
    if (!widget || typeof widget !== 'object' || widget.type === SELF) return;
    const entity = widget.entity;
    if (typeof entity !== 'string') return;
    let group;
    if (widget.type === 'climate' && isId(entity, 'climate')) group = 'climate';
    else if (widget.type === 'light' && isId(entity, 'light')) group = 'light';
    else if (widget.type === 'lock' && isId(entity, 'lock')) group = 'lock';
    else if (widget.type === 'media_player' && isId(entity, 'media_player')) group = 'media';
    else if (widget.type === 'camera' && isId(entity, 'camera')) group = 'camera';
    // Scripts and buttons are not scenes: only a scene shows up on the home screen.
    else if (widget.type === 'action' && isId(entity, 'scene')) group = 'scene';
    if (!group || seen.has(`${group}|${entity}`)) return;
    seen.add(`${group}|${entity}`);
    const item = {index, entity};
    if (typeof widget.name === 'string' && widget.name) item.name = widget.name;
    if (typeof widget.icon === 'string' && widget.icon) item.icon = widget.icon;
    groups[group].push(item);
  });
  return groups;
}

/**
 * The current temperatures of the climate entities as a range: "20-22", "21" when there is one value or all agree,
 * "--" when none is known. The degree sign belongs to the caller. Entities that are unavailable or report no number
 * are left out.
 * @param {Item[]} items
 * @param {(id: string) => any} stateOf
 * @param {(n: number) => string} [format]   number formatter (whole numbers); default String
 * @returns {{text: string, min: number|null, max: number|null}}
 */
export function temperatureRange(items, stateOf, format = String) {
  const values = [];
  for (const {entity} of items) {
    const state = stateOf(entity);
    const value = state?.attributes?.current_temperature;
    if (known(state) && typeof value === 'number' && Number.isFinite(value)) values.push(value);
  }
  if (!values.length) return {text: '--', min: null, max: null};
  const min = Math.round(Math.min(...values));
  const max = Math.round(Math.max(...values));
  return {text: min === max ? format(min) : `${format(min)}-${format(max)}`, min, max};
}

/** How many of the lights are on. */
export function lightsOn(items, stateOf) {
  return items.filter(({entity}) => stateOf(entity)?.state === 'on').length;
}

/** `{locked, unlocked}`: counts of the locks that are locked and of those that are open, unlocked or jammed. */
export function lockCounts(items, stateOf) {
  let locked = 0;
  let unlocked = 0;
  for (const {entity} of items) {
    const state = stateOf(entity)?.state;
    if (LOCKED.has(state)) locked++;
    else if (UNLOCKED.has(state)) unlocked++;
  }
  return {locked, unlocked};
}

/** True when any of the media players is playing. */
export const anyPlaying = (items, stateOf) =>
  items.some(({entity}) => stateOf(entity)?.state === 'playing');

/**
 * The chips of the top row, in a fixed order (climate, lights, locks, media). A kind has a chip only when the carousel
 * has widgets of that kind. `target` is the widget index a press jumps to (the first widget of the kind).
 * @param {ReturnType<typeof collect>} groups
 * @param {(id: string) => any} stateOf
 * @param {(n: number) => string} [format]
 * @returns {{key: string, tone: string, value: string, count: number|null, dim: boolean, active: boolean, target: number}[]}
 *   `tone`: cyan | yellow | teal | amber | grey. `value` is the text shown ('20-22', '3', '1', ''), without the degree sign.
 */
export function chips(groups, stateOf, format = String) {
  const out = [];
  if (groups.climate.length) {
    const range = temperatureRange(groups.climate, stateOf, format);
    out.push({
      key: 'climate',
      tone: 'cyan',
      value: range.text,
      count: null,
      dim: range.min === null,
      active: false,
      target: groups.climate[0].index
    });
  }
  if (groups.light.length) {
    const count = lightsOn(groups.light, stateOf);
    out.push({
      key: 'lights',
      tone: 'yellow',
      value: format(count),
      count,
      dim: count === 0,
      active: false,
      target: groups.light[0].index
    });
  }
  if (groups.lock.length) {
    const {locked, unlocked} = lockCounts(groups.lock, stateOf);
    // An open door matters more than the number of closed ones: the chip turns amber and counts the open locks.
    if (unlocked > 0) {
      out.push({
        key: 'unlocked',
        tone: 'amber',
        value: format(unlocked),
        count: unlocked,
        dim: false,
        active: false,
        target: groups.lock[0].index
      });
    } else {
      out.push({
        key: 'locks',
        tone: 'teal',
        value: format(locked),
        count: locked,
        dim: locked === 0,
        active: false,
        target: groups.lock[0].index
      });
    }
  }
  if (groups.media.length) {
    out.push({
      key: 'media',
      tone: 'grey',
      value: '',
      count: null,
      dim: false,
      active: anyPlaying(groups.media, stateOf),
      target: groups.media[0].index
    });
  }
  return out;
}

// ---- bins and transport chips (optional, configured on the card: `home_bins`, `home_transport`) ---------------------------

const BIN_ICONS = [
  [/non-?\s?recycl|general|refuse|residual|black/i, 'mdi:trash-can'],
  [/recycl/i, 'mdi:recycle'],
  [/food|caddy/i, 'mdi:food-apple'],
  [/garden|green|organic/i, 'mdi:leaf'],
  [/glass|bottle/i, 'mdi:bottle-wine'],
  [/paper|card/i, 'mdi:newspaper'],
  [/.*/, 'mdi:trash-can']
];
const DAY_MS = 86400000;

/** The icon of a bin type ("Recycling", "Non-Recyclable Waste", "Garden waste", ...). */
export const binIcon = (type) => BIN_ICONS.find(([pattern]) => pattern.test(type))[1];

/**
 * The bins going out in the next 7 days, from a waste_collection_schedule sensor: its attributes are dates
 * (`2026-10-16: Recycling`), and the state reads "Recycling in 2 days". Entities that do not describe a collection give [].
 * @param {any} state   the sensor's state object
 * @param {number} now  milliseconds
 * @returns {{type: string, icon: string, days: number}[]}  nearest first, one per type
 */
export function binsThisWeek(state, now) {
  if (!known(state)) return [];
  const today = Date.parse(new Date(now).toISOString().slice(0, 10));
  const found = new Map();
  const add = (types, days) => {
    for (const raw of String(types).split(/,|\band\b|&/)) {
      const type = raw.trim();
      if (type && days >= 0 && days < 7 && !found.has(type)) found.set(type, days);
    }
  };
  for (const [key, value] of Object.entries(state.attributes || {})) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(key)) continue;
    add(value, Math.round((Date.parse(key.slice(0, 10)) - today) / DAY_MS));
  }
  if (!found.size) {
    const match = /^(.*) in (\d+) days?$/i.exec(String(state.state));
    if (match) add(match[1], Number(match[2]));
    else if (/^(.*) (today|tomorrow)$/i.test(String(state.state)))
      add(RegExp.$1, /today/i.test(state.state) ? 0 : 1);
  }
  return [...found]
    .map(([type, days]) => ({type, icon: binIcon(type), days}))
    .sort((a, b) => a.days - b.days);
}

/**
 * One transport chip from a departure sensor (the London TfL integration: the state is the next departure as "HH:MM",
 * "None" when nothing is due). A line that is not running (no departure, unavailable, an error text) is `running: false`.
 * @param {{entity: string, label?: string, icon?: string}} item
 * @returns {{entity: string, label: string, icon: string, time: string, running: boolean}}
 */
export function transportChip(item, stateOf) {
  const state = stateOf(item.entity);
  const text = known(state) ? String(state.state).trim() : '';
  const time = /^\d{1,2}:\d{2}$/.test(text) ? text : '';
  const name = state?.attributes?.friendly_name;
  return {
    entity: item.entity,
    label: item.label || name || item.entity.split('.')[1].replaceAll('_', ' '),
    icon: item.icon || 'mdi:subway-variant',
    time,
    running: !!time
  };
}

/** The `home_transport` list as items: entity ids only, with an optional label and icon. */
export function transportItems(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => (typeof item === 'string' ? {entity: item} : item))
    .filter((item) => item && typeof item.entity === 'string' && item.entity.includes('.'));
}

/** The `home_bins` entity: a sensor id, or `{entity}`. */
export const binsEntity = (value) =>
  typeof value === 'string' ? value : typeof value?.entity === 'string' ? value.entity : '';

/** The cameras that get a card (at most MAX_CAMERAS), in configured order. */
export const visibleCameras = (groups) => groups.camera.slice(0, MAX_CAMERAS);

/** A time as milliseconds (an ISO string from `last_updated`), or null. */
export function parseTime(value) {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * How long ago something happened, as a unit and a signed value for Intl.RelativeTimeFormat: under a minute is
 * `{value: 0, unit: 'second'}` ("now"), then whole minutes, hours and days (rounded down). Null for an unknown time.
 * A time in the future counts as now.
 * @param {number|null} since   milliseconds
 * @param {number} now          milliseconds
 * @returns {{value: number, unit: 'second'|'minute'|'hour'|'day'}|null}
 */
export function ago(since, now) {
  if (since === null || !Number.isFinite(since)) return null;
  const seconds = Math.floor((now - since) / 1000);
  if (seconds < 60) return {value: 0, unit: 'second'};
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return {value: -minutes, unit: 'minute'};
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return {value: -hours, unit: 'hour'};
  return {value: -Math.floor(hours / 24), unit: 'day'};
}

/** Whether the camera's own state allows a picture: it exists and is neither unavailable nor unknown. */
export const cameraOk = (state) => known(state);

/** The minute a time falls in: the label of a camera changes at most once a minute. */
export const minuteOf = (ms) => Math.floor(ms / 60000);
/** The 30 s snapshot bucket (the camera widget's SNAPSHOT_BUCKET_MS). */
export const bucketOf = (ms) => Math.floor(ms / 30000);
