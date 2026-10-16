// defineOverview: fill defaults, validate the shape, derive the card-mode widget, freeze.
// The derived widget is registered with the ordinary widget registry: overviews do not fork the engine.
import {defineWidget} from './define-widget.js';
import {createOverviewContext} from './overview-context.js';
import {esc} from './html.js';

/**
 * @typedef {'screensaver'|'card'} OverviewMode
 * @typedef {'entity'|'enum_list'|'text'|'icon'|'enum'|'boolean'|'number'} OverviewOptionType
 *
 * @typedef {Object} OverviewOptionSpec          the widget OptionSpec plus two types
 * @property {OverviewOptionType} type
 * @property {any} [default]
 * @property {string[]} [values]                 enum, enum_list
 * @property {number} [max]                      enum_list: most entries; number: largest value
 * @property {number} [min] @property {number} [step]   number
 * @property {string[]} [domains]                entity: allowed domains
 * @property {string} [error]                    enum: exact message for an invalid value
 *
 * @typedef {Object} OverviewDefinition
 * -- identity (required) --
 * @property {string} type       snake_case; == folder src/overviews/<type>/ == `screensaver.type`. The card-mode widget is `<type>_overview`.
 * @property {string} label      English picker/editor name ('Weather overview'); strings key `<type>_overview.label`
 * @property {number} order      unique integer, picker order (weather 10); the derived widget gets 200 + order
 * @property {(ctx: OverviewContext, mode: OverviewMode) => string} render   pure; returns ONE root element string whose class starts with `ov-scene`
 *
 * -- entities and options (optional) --
 * @property {'required'|'optional'|'none'} [entity]   default 'required'
 * @property {string[]} [domains]          entity domains (required when entity is 'required' or 'optional')
 * @property {{en: Record<string,string>} & Record<string, Record<string,string>>} strings   the default export of ./strings.js; keys start with `<type>_overview.`,
 *                                         and `en` must define `<type>_overview.label` and `<type>_overview.description`
 * @property {Record<string, OverviewOptionSpec>} [options]   flat keys beside `entity`, identical in a screensaver block and an overview card
 * @property {(options: Object) => void} [validate]   cross-field rules; throw Error('<exact message>'); `options` is fully resolved
 * @property {(options: Object, config?: Object) => string[]} [watch]  extra entity ids whose changes re-render (sun.sun); the primary entity is always watched. `config` is the card config
 *                                         (the carousel's normalised `widgets` list), so an overview built from the dashboard's widgets (home) can watch their entities
 * @property {boolean} [interactive]   default false. true allows `<button data-action data-entity>` in CARD mode, only with the actions of INTERACTIVE_ACTIONS; in screensaver mode the overview renders no buttons
 * @property {boolean} [controls]   default false, needs `interactive`. true makes the full-page layer a control panel: the overview keeps its buttons in
 *                                         screensaver mode too, a press on one runs its action through the card's dispatcher, a press anywhere else does
 *                                         nothing, and the layer closes through an `overview-close` button, Escape or `autoWake` (the thermostat view)
 * @property {string[]} [actions]   `controls` only: widget action names its buttons may carry besides INTERACTIVE_ACTIONS (climate: up, down).
 *                                         They are actions the dashboard already offers (the widget that opens the view owns them)
 *
 * -- data (optional) --
 * @property {(args: {hass: any, options: Object, entityId?: string}) => Record<string, DataSpec>} [data]
 *                                         async subscriptions, keyed by the name render reads from `ctx.data[name]`
 *
 * -- behaviour (optional) --
 * @property {(ctx: OverviewHookContext) => void} [afterRender]   after a card is created or patched, and when a screensaver layer is shown or patched; idempotent
 * @property {{every: number, align?: 'minute', run: (ctx: OverviewHookContext) => void}} [tick]   shared ticker, throttled to `every` ms; runs while the overview is on screen. `align: 'minute'` runs it when the wall-clock minute changes instead (a clock that shows minutes)
 * @property {(ctx: OverviewContext) => string} [tile]   optional compact summary: the card gets a `display: tile` option and renders this small face instead of the scene; tapping it opens the full overview as a one-off page-sized layer
 * @property {{card?: 'info'|'open'|'none'}} [tap]   card mode only: tap opens more-info of the entity (default), opens the full-screen view ('open', for overviews without an entity) or does nothing. A screensaver tap ALWAYS dismisses.
 * @property {number} [onPageIdle]   idle seconds that apply instead of the screensaver timeout while this overview's implicit entry has its widget on the page that is showing and is eligible (cover art: 5)
 * @property {(ctx: OverviewContext) => boolean} [autoWake]   called on every hass update while the screensaver is up; true dismisses it (no tap swallow)
 *
 * -- precedence among idle overviews (optional, `activation: 'idle'` only) --
 * @property {boolean} [selectable]   default true. false = an automatic display: it works from its widget, is not offered in the editor's screensaver list, but can still be written in YAML
 * @property {number} [priority]   integer, default 0 (weather 0, cover art 10). When idle time starts a screensaver, the highest
 *                                         priority among the ELIGIBLE enabled idle entries wins; equal priorities take turns (round robin).
 *                                         An event overlay (a running timer) is above every idle entry whatever its priority
 * @property {(ctx: OverviewContext) => boolean} [eligible]   default: always. Evaluated at the moment idle activation picks an entry
 *                                         (mode 'screensaver' context): false takes the entry out of the running for that activation.
 *                                         Pure and cheap, false for a missing or unavailable entity. When no entry is eligible nothing shows
 *
 * -- activation (optional) --
 * @property {'idle'|'event'} [activation]   default 'idle': the screensaver layer starts after `idle_timeout` seconds without a touch and
 *                                         takes part in the round robin. 'event': never started by idle time and left out of the round robin;
 *                                         the controller starts it when `autoShow` turns true (a timer that starts, a doorbell that rings)
 * @property {(ctx: OverviewContext) => boolean} [autoShow]   required when activation is 'event', and only then. Pure and cheap: evaluated on every hass
 *                                         update and on the shared 1 s tick. The layer appears when it turns true (false -> true edge) and nothing
 *                                         blocks; after a dismissal it stays away until it has gone false and true again
 */

/** Keys the framework owns in a screensaver block or an overview card; an overview option may not reuse them. */
export const RESERVED_KEYS = [
  'type',
  'widget_type',
  'entity',
  'name',
  'enabled',
  'idle_timeout',
  'start_in_edit_mode',
  'preview',
  'page',
  'size'
];
export const OPTION_TYPES = ['text', 'icon', 'enum', 'boolean', 'number', 'entity', 'enum_list'];
export const OVERVIEW_MODES = ['screensaver', 'card'];
const ENTITY_RULES = ['required', 'optional', 'none'];
export const ACTIVATIONS = ['idle', 'event'];
const DISPLAYS = ['scene', 'tile'];
/** The only actions an interactive overview's buttons may carry (docs/overview-api.md); the contract suite holds it to this. */
export const INTERACTIVE_ACTIONS = Object.freeze([
  'goto-widget',
  'camera-grid',
  'run-action',
  'info',
  'overview-close'
]);

/** The actions a scene of `overview` may carry: the allow-list, plus its own `actions` when it is a control panel. */
export const allowedActions = (overview) =>
  overview.controls ? [...INTERACTIVE_ACTIONS, ...overview.actions] : INTERACTIVE_ACTIONS;

const isStringList = (value) => Array.isArray(value) && value.every((v) => typeof v === 'string');

/** Freeze plain objects and arrays all the way down; functions and everything else are left alone. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Copy plain data (objects and arrays) so freezing the module never freezes the author's own objects. */
function copyData(value) {
  if (Array.isArray(value)) return value.map(copyData);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyData(v)]));
  }
  return value;
}

function checkOptionSpecs(type, options) {
  for (const [key, spec] of Object.entries(options)) {
    const where = `Overview ${type}: option ${key}`;
    if (RESERVED_KEYS.includes(key)) {
      throw new Error(`Overview ${type}: option name ${key} is reserved.`);
    }
    if (!spec || !OPTION_TYPES.includes(spec.type)) {
      throw new Error(`${where} has unknown type ${spec?.type}.`);
    }
    if (
      (spec.type === 'enum' || spec.type === 'enum_list') &&
      !(isStringList(spec.values) && spec.values.length)
    ) {
      throw new Error(`${where} needs a non-empty values list.`);
    }
    if (spec.type === 'entity' && !(isStringList(spec.domains) && spec.domains.length)) {
      throw new Error(`${where} needs entity domains.`);
    }
  }
}

/**
 * Validate an overview definition, fill the defaults, derive its card-mode widget and freeze the result.
 * @param {OverviewDefinition} def
 */
export function defineOverview(def) {
  const o = {entity: 'required', ...def, activation: def.activation ?? 'idle'};
  o.domains = o.domains ?? [];
  o.options = o.options ?? {};
  o.tap = {card: 'info', ...def.tap};
  if (!/^[a-z][a-z0-9_]*$/.test(o.type || '')) {
    throw new Error(`Overview type must be snake_case: ${o.type}`);
  }
  if (typeof o.render !== 'function')
    throw new Error(`Overview ${o.type} needs a render function.`);
  if (typeof o.label !== 'string' || !o.label) throw new Error(`Overview ${o.type} needs a label.`);
  if (!Number.isInteger(o.order)) throw new Error(`Overview ${o.type} needs an integer order.`);
  if (!ENTITY_RULES.includes(o.entity)) {
    throw new Error(`Overview ${o.type}: entity must be required, optional or none.`);
  }
  if (o.entity !== 'none' && !o.domains.length) {
    throw new Error(`Overview ${o.type} needs entity domains.`);
  }
  const prefix = `${o.type}_overview.`;
  for (const [lang, table] of Object.entries(o.strings || {})) {
    for (const key of Object.keys(table)) {
      if (!key.startsWith(prefix)) {
        throw new Error(
          `Overview ${o.type}: string key ${key} (${lang}) must start with ${prefix}`
        );
      }
    }
  }
  for (const key of ['label', 'description']) {
    if (!o.strings?.en?.[prefix + key]) {
      throw new Error(`Overview ${o.type} needs the English string ${prefix}${key}.`);
    }
  }
  if (o.tile !== undefined && typeof o.tile !== 'function') {
    throw new Error(`Overview ${o.type}: tile must be a function.`);
  }
  if (o.tick && !(o.tick.every > 0)) {
    throw new Error(`Overview ${o.type}: tick.every must be a positive number of ms.`);
  }
  if (o.tick && o.tick.align !== undefined && o.tick.align !== 'minute') {
    throw new Error(`Overview ${o.type}: tick.align must be 'minute' when given.`);
  }
  if (!ACTIVATIONS.includes(o.activation)) {
    throw new Error(`Overview ${o.type}: activation must be idle or event.`);
  }
  if (o.activation === 'event' && typeof o.autoShow !== 'function') {
    throw new Error(`Overview ${o.type}: an event overview needs an autoShow function.`);
  }
  if (o.activation === 'idle' && o.autoShow !== undefined) {
    throw new Error(`Overview ${o.type}: autoShow needs activation: 'event'.`);
  }
  if (o.autoWake !== undefined && typeof o.autoWake !== 'function') {
    throw new Error(`Overview ${o.type}: autoWake must be a function.`);
  }
  if (def.priority !== undefined && !Number.isInteger(def.priority)) {
    throw new Error(`Overview ${o.type}: priority must be an integer.`);
  }
  if (def.eligible !== undefined && typeof def.eligible !== 'function') {
    throw new Error(`Overview ${o.type}: eligible must be a function.`);
  }
  if (o.activation === 'event' && (def.priority !== undefined || def.eligible !== undefined)) {
    throw new Error(`Overview ${o.type}: priority and eligible need activation: 'idle'.`);
  }
  o.priority = def.priority ?? 0;
  // Automatic displays (the timer display, cover art) are not offered in the editor's screensaver list.
  if (def.selectable !== undefined && typeof def.selectable !== 'boolean') {
    throw new Error(`Overview ${o.type}: selectable must be true or false.`);
  }
  o.selectable = def.selectable ?? true;
  if (def.interactive !== undefined && typeof def.interactive !== 'boolean') {
    throw new Error(`Overview ${o.type}: interactive must be true or false.`);
  }
  o.interactive = def.interactive ?? false;
  if (def.controls !== undefined && typeof def.controls !== 'boolean') {
    throw new Error(`Overview ${o.type}: controls must be true or false.`);
  }
  o.controls = def.controls ?? false;
  if (o.controls && !o.interactive) {
    throw new Error(`Overview ${o.type}: controls needs interactive: true.`);
  }
  if (def.actions !== undefined && !(o.controls && isStringList(def.actions))) {
    throw new Error(
      `Overview ${o.type}: actions is a list of action names and needs controls: true.`
    );
  }
  o.actions = def.actions ?? [];
  checkOptionSpecs(o.type, o.options);

  const overview = deepFreeze({
    ...o,
    domains: copyData(o.domains),
    options: copyData(o.options),
    actions: copyData(o.actions),
    tap: copyData(o.tap),
    strings: copyData(o.strings)
  });
  return Object.freeze({...overview, widget: toWidget(overview)});
}

// ---------- options ----------

const copy = (value) => (Array.isArray(value) ? [...value] : value);

/** Raw config (screensaver entry or widget) -> every option with its default. Unknown keys are dropped. */
export function resolveOptions(overview, raw = {}) {
  const options = {entity: raw.entity, name: raw.name};
  for (const [key, spec] of Object.entries(overview.options)) {
    options[key] = raw[key] == null ? copy(spec.default) : raw[key];
  }
  return options;
}

/** Throws the exact message for the first invalid option. `options` is the output of resolveOptions. */
export function checkOptions(overview, options) {
  const label = overview.label;
  const bad = (message) => {
    throw new Error(message);
  };
  for (const [key, spec] of Object.entries(overview.options)) {
    const value = options[key];
    if (value === undefined) continue;
    switch (spec.type) {
      case 'boolean':
        if (typeof value !== 'boolean') bad(`${label} ${key} must be true or false.`);
        break;
      case 'number': {
        const range =
          spec.min != null && spec.max != null ? ` from ${spec.min} to ${spec.max}` : '';
        const finite = typeof value === 'number' && Number.isFinite(value);
        const outside = value < (spec.min ?? -Infinity) || value > (spec.max ?? Infinity);
        if (!finite || outside) bad(`${label} ${key} must be a number${range}.`);
        break;
      }
      case 'text':
      case 'icon':
        if (typeof value !== 'string') bad(`${label} ${key} must be text.`);
        break;
      case 'enum':
        if (!spec.values.includes(value)) {
          bad(spec.error ?? `${label} ${key} must be one of: ${spec.values.join(', ')}.`);
        }
        break;
      case 'enum_list':
        if (!Array.isArray(value) || value.some((v) => !spec.values.includes(v))) {
          bad(`${label} ${key} must be a list of: ${spec.values.join(', ')}.`);
        }
        if (spec.max != null && value.length > spec.max) {
          bad(`${label} ${key} can have at most ${spec.max} entries.`);
        }
        break;
      case 'entity':
        if (typeof value !== 'string' || !spec.domains.some((d) => value.startsWith(`${d}.`))) {
          bad(`${label} ${key} must be a ${spec.domains.join(' or ')} entity.`);
        }
        break;
    }
  }
  overview.validate?.(options);
}

/**
 * The entity rule. `where` is 'screensaver' or 'overview'.
 * Same sentence shape as the widget rule `<type> widget needs a <type> entity.`
 */
export function checkEntity(overview, entity, where) {
  const ok = typeof entity === 'string' && overview.domains.some((d) => entity.startsWith(`${d}.`));
  const domains = overview.domains.join(' or ');
  if (overview.entity === 'required' && !ok) {
    throw new Error(`${overview.type} ${where} needs a ${domains} entity.`);
  }
  if (overview.entity === 'optional' && entity != null && !ok) {
    throw new Error(`${overview.type} ${where} entity must be a ${domains} entity.`);
  }
}

// ---------- context and markup ----------

/**
 * Build the read-only context for one render.
 * @param {Object} overview
 * @param {{hass: any, config?: Object, raw: Object, mode: OverviewMode}} args
 *   `raw` is the screensaver entry, the resolved options of one, or the widget config of an overview card.
 */
export function contextFor(overview, {hass, config, raw, mode}) {
  if (!OVERVIEW_MODES.includes(mode)) throw new Error(`Unknown overview mode: ${mode}`);
  return createOverviewContext({
    hass,
    config,
    options: resolveOptions(overview, raw),
    mode,
    overview
  });
}

/**
 * The screensaver layer shell, created once per activation. The scene is patched into `.ov` afterwards. A control
 * panel (`controls`) has no full-area dismiss button: its own buttons are the controls, and it closes through
 * `overview-close`.
 */
export function layerMarkup(overview, scene, {label, dismiss}) {
  const close = overview.controls
    ? ''
    : `<button type="button" class="ov-dismiss" aria-label="${esc(dismiss)}"></button>`;
  return (
    `<div class="hv-screensaver${overview.controls ? ' hv-controls' : ''}" data-screensaver="${esc(overview.type)}" ` +
    `data-state="entering" role="dialog" aria-modal="true" aria-label="${esc(label)}">` +
    `<div class="ov ov-${overview.type} ov-mode-screensaver">${scene}</div>${close}</div>`
  );
}

// ---------- the derived widget (card mode and the standalone card) ----------

function toWidget(overview) {
  const hookContext = (hctx) => ({
    ...contextFor(overview, {hass: hctx.hass, config: hctx.config, raw: hctx.widget, mode: 'card'}),
    el: hctx.el,
    requestRender: hctx.requestRender,
    store: hctx.store
  });
  return defineWidget({
    type: `${overview.type}_overview`,
    tag: `houseview-${overview.type.replaceAll('_', '-')}-overview-card`,
    overview: overview.type,
    label: overview.label,
    order: 200 + overview.order,
    entity: 'custom', // the generic rule would demand a `weather_overview.*` entity
    domains: overview.domains,
    defaultSize: 'large',
    availability: 'always', // the overview draws its own unavailable state
    standaloneHeight: 380,
    cardRows: 6,
    gridOptions: {min_columns: 3, min_rows: 4},
    options: overview.tile
      ? {display: {type: 'enum', values: DISPLAYS, default: 'scene'}, ...overview.options}
      : overview.options,

    // A compact tile occupies one cell unless the card says otherwise.
    normalize: (widget) =>
      overview.tile && widget.display === 'tile' && !widget.size
        ? {...widget, size: 'normal'}
        : widget,

    validate(widget) {
      checkEntity(overview, widget.entity, 'overview');
      checkOptions(overview, resolveOptions(overview, widget));
      if (widget.display !== undefined && !DISPLAYS.includes(widget.display)) {
        throw new Error(`${overview.label} display must be one of: ${DISPLAYS.join(', ')}.`);
      }
    },
    watch: (widget, config) =>
      [widget.entity, ...(overview.watch?.(resolveOptions(overview, widget), config) ?? [])].filter(
        Boolean
      ),

    // The root is NOT ctx.root/ctx.tile: `.tile` and `.widget` carry the shared glass styling and its
    // !important cascade. The grid still finds it by [data-widget].
    render(ctx) {
      if (overview.tile && ctx.widget.display === 'tile') {
        const tileContext = contextFor(overview, {
          hass: ctx.hass,
          config: ctx.config,
          raw: ctx.widget,
          mode: 'card'
        });
        const open = ctx.esc(ctx.t('screensaver.open', {name: ctx.rawName}));
        return (
          `<section ${ctx.attr} class="ov ov-${overview.type} ov-mode-tile size-${ctx.size}" ` +
          `data-overview="${overview.type}">${overview.tile(tileContext)}` +
          `${ctx.btn('overview-open', '', 'ov-tap', !!ctx.state, {attrs: `aria-label="${open}" `})}</section>`
        );
      }
      const octx = contextFor(overview, {
        hass: ctx.hass,
        config: ctx.config,
        raw: ctx.widget,
        mode: 'card'
      });
      const scene = overview.render(octx, 'card');
      const label = ctx.esc(ctx.t('screensaver.more_info', {name: ctx.rawName}));
      const open = ctx.esc(ctx.t('screensaver.open', {name: ctx.rawName}));
      let tap = '';
      if (overview.interactive) {
        tap = ''; // its own buttons are the controls: a full-card overlay would cover them
      } else if (overview.tap.card === 'info' && ctx.entityId) {
        tap = ctx.btn('info', '', 'ov-tap', !!ctx.state, {attrs: `aria-label="${label}" `});
      } else if (overview.tap.card === 'open') {
        // No entity to name: the action finds its card by position (see _screensaverOpen).
        tap = ctx.btn('overview-open', '', 'ov-tap', true, {
          entity: `overview:${ctx.index}`,
          attrs: `aria-label="${open}" `
        });
      }
      return (
        `<section ${ctx.attr} class="ov ov-${overview.type} ov-mode-card size-${ctx.size}" ` +
        `data-overview="${overview.type}">${scene}${tap}</section>`
      );
    },
    afterRender: overview.afterRender && ((hctx) => overview.afterRender(hookContext(hctx))),
    tick: overview.tick && {
      every: overview.tick.every,
      ...(overview.tick.align ? {align: overview.tick.align} : {}),
      run: (hctx) => overview.tick.run(hookContext(hctx))
    }
  });
}
