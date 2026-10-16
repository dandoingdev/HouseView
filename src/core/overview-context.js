// The only API an overview sees. Built per render; cheap. Deliberately has NO `call`, NO `card`, NO `confirm`:
// an overview can read Home Assistant but cannot change it.
import {esc, num, iconHTML} from './html.js';
import {t as translate} from './i18n.js';
import {peek} from './subscriptions.js';
import {hourOptions, temperatureUnit, timeZoneOf} from './format.js';
import {dateTimeFormatter, numberFormatter} from './intl.js';

/**
 * @typedef {Object} OverviewContext
 * @property {any} hass
 * @property {Object} config            the card config (read only): preview_time, high_contrast...
 * @property {Object} options           resolved options incl. `entity` and `name`, defaults applied
 * @property {'screensaver'|'card'} mode
 * @property {string} overview          the overview type ('weather')
 * @property {string|undefined} entityId
 * @property {Object|undefined} state   hass.states[entityId]
 * @property {Object} attrs             state?.attributes || {}
 * @property {boolean} ok               the entity exists and is neither 'unavailable' nor 'unknown'
 * @property {string} name              ESCAPED: options.name || friendly_name || label
 * @property {string} rawName           the same, unescaped
 * @property {Record<string, any>} data latest payload of each declared DataSpec (null until known); never undefined
 * @property {(id:string)=>Object|undefined} stateOf
 * @property {(id:string)=>Object} attrsOf
 * @property {(id:string)=>boolean} availableOf
 * @property {(v:any)=>string} esc
 * @property {(v:any)=>boolean} num
 * @property {(key:string, vars?:Object)=>string} t       hass.locale.language -> base -> en -> key
 * @property {=>string|undefined} lang
 * @property {=>string} unit                            hass.config.unit_system.temperature || '°C'
 * @property {(name:string)=>string} icon                 <ha-icon icon="mdi:name">; a name containing ':' is used verbatim
 * @property {=>number} now                             Date.now, or config.preview_time when set
 * @property {(ms:number)=>{main:string, period:string, text:string}} timeParts   user's time format and zone ('10:09' + 'AM')
 * @property {(ms:number)=>string} formatTime             timeParts(ms).text
 * @property {(n:number, opts?:Object)=>string} formatNumber    Intl.NumberFormat in hass.locale.language, whole numbers by default
 * @property {(ms:number)=>{year:number, month:number, day:number, hour:number, minute:number}} localParts   calendar fields in the display zone
 * @property {(ms:number)=>number} dayOffset              whole days from today to the day containing ms (display zone)
 *
 * @typedef {OverviewContext & {el: Element|null, requestRender: =>void, store: Map<any,any>}} OverviewHookContext
 *   `el` is the `.ov` element (screensaver layer content or card-mode root); `store` survives renders.
 */

/** DataSpecs an overview wants for these options (empty when it declares none). */
export function specsFor(overview, hass, options) {
  return overview.data ? overview.data({hass, options, entityId: options.entity}) || {} : {};
}

/**
 * @param {Object} args
 * @param {any} args.hass
 * @param {Object} [args.config]
 * @param {Object} args.options   output of resolveOptions
 * @param {'screensaver'|'card'} args.mode
 * @param {Object} args.overview  a defineOverview module
 * @returns {OverviewContext}
 */
export function createOverviewContext({hass, config = {}, options, mode, overview}) {
  const lang = hass?.locale?.language;
  const timeZone = timeZoneOf(hass);
  const stateOf = (id) => hass?.states?.[id];
  const attrsOf = (id) => stateOf(id)?.attributes || {};
  const availableOf = (id) => {
    const s = stateOf(id)?.state;
    return !!s && s !== 'unavailable' && s !== 'unknown';
  };
  const entityId = options.entity;
  const state = entityId ? stateOf(entityId) : undefined;
  const rawName = options.name || state?.attributes?.friendly_name || overview.label;

  const data = {};
  for (const [key, spec] of Object.entries(specsFor(overview, hass, options))) {
    data[key] = peek(hass, spec);
  }

  const now = () => (config.preview_time ? new Date(config.preview_time).valueOf() : Date.now());

  /** {main:'10:09', period:'' | 'AM', text:'10:09 AM'} in the user's time format and zone. */
  const timeParts = (ms) => {
    const timeFormat = hass?.locale?.time_format;
    const fmt = dateTimeFormatter(
      lang || undefined,
      {hour: 'numeric', minute: '2-digit', timeZone, ...hourOptions(timeFormat)},
      {fallback: true}
    );
    const parts = fmt.formatToParts(ms);
    let main = '';
    let period = '';
    let text = '';
    for (const part of parts) {
      text += part.value;
      if (part.type === 'dayPeriod') period = part.value;
      else main += part.value;
    }
    return {main: main.trim(), period, text};
  };

  /** Calendar fields of `ms` in the display zone (numbers), for "today"/"tomorrow" logic. */
  const localParts = (ms) => {
    const fmt = dateTimeFormatter(
      'en-US',
      {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
      },
      {fallback: true, fallbackLanguage: 'en-US'}
    );
    const p = Object.fromEntries(fmt.formatToParts(ms).map((x) => [x.type, Number(x.value)]));
    return {year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute};
  };

  /** The calendar day of `ms` in the display zone, as a day count (UTC midnight / 86400000). */
  const dayNumber = (ms) => {
    const p = localParts(ms);
    return Date.UTC(p.year, p.month - 1, p.day) / 86400e3;
  };

  return {
    hass,
    config,
    options,
    mode,
    overview: overview.type,
    entityId,
    state,
    attrs: state?.attributes || {},
    ok: !!state && state.state !== 'unavailable' && state.state !== 'unknown',
    name: esc(rawName),
    rawName,
    data,
    stateOf,
    attrsOf,
    availableOf,
    esc,
    num,
    t: (key, vars) => translate(hass, key, vars),
    lang: () => lang,
    unit: () => temperatureUnit(hass),
    icon: iconHTML,
    now,
    timeParts,
    formatTime: (ms) => timeParts(ms).text,
    formatNumber: (value, opts = {maximumFractionDigits: 0}) =>
      numberFormatter(lang || undefined, opts, {fallback: true}).format(value),
    localParts,
    /** Whole days from today (display zone) to the day containing `ms`; negative = past. */
    dayOffset: (ms) => dayNumber(ms) - dayNumber(now())
  };
}
