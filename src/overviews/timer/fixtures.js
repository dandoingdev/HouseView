// Variants for tests, previews and screenshots. Data only, imports nothing (the browser harness loads this file
// unbundled). Fixed clock: 2026-10-15 10:09:00 Europe/London (BST, +01:00); every running timer is relative to it.
//
//   options  flat overview options (entity first), as in a screensaver block or an overview card
//   states   the hass.states the display reads
//   config   card config keys (preview_time freezes ctx.now at NOW)
//   hass     hass.locale / hass.config overrides
export const NOW = '2026-10-15T10:09:00+01:00';
const entity = 'timer.kitchen_timer';

/** "H:MM:SS", the way Home Assistant writes a timer's duration and remaining time. */
const hms = (seconds) =>
  `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

/** An ISO time `seconds` after NOW (negative: before). */
const at = (seconds) => new Date(Date.parse(NOW) + seconds * 1000).toISOString();

/**
 * @param {'active'|'paused'|'idle'|string} state
 * @param {Object} o
 * @param {number} [o.total]      duration in seconds (omit with `noDuration`)
 * @param {number} [o.left]       seconds left (active: finishes_at = NOW + left; paused: remaining)
 * @param {Object} [o.attributes] extra attributes, applied last
 */
const timer = (state, {total, left, noDuration = false, attributes = {}, changed} = {}) => ({
  [entity]: {
    state,
    last_changed: changed ?? at(-30),
    attributes: {
      friendly_name: 'Kitchen timer',
      ...(noDuration || total === undefined ? {} : {duration: hms(total)}),
      ...(state === 'active'
        ? {remaining: hms(left ?? total ?? 0), finishes_at: at(left ?? 0)}
        : {}),
      ...(state === 'paused' ? {remaining: hms(left ?? total ?? 0)} : {}),
      editable: true,
      ...attributes
    }
  }
});

const make = (states, {options = {}, hass} = {}) => ({
  options: {entity, ...options},
  states,
  config: {preview_time: NOW},
  hass: {
    locale: {language: 'en-GB', time_format: '24', time_zone: 'server', ...hass?.locale},
    config: {time_zone: 'Europe/London', ...hass?.config}
  }
});

export const variants = {
  // the reference picture: 15 minutes, 10:56 left, so 44 of the 60 ticks are lit
  ok: make(timer('active', {total: 900, left: 656})),

  // lit ticks follow ceil(60 * left / total)
  justStarted: make(timer('active', {total: 900, left: 900})),
  almostDone: make(timer('active', {total: 900, left: 7})),
  shortTimer: make(timer('active', {total: 45, left: 31})),
  oneHalf: make(timer('active', {total: 5400, left: 4354})), // 1 h 30 min, 1:12:34 left
  hour: make(timer('active', {total: 3600, left: 3599})),
  extended: make(timer('active', {total: 600, left: 900})), // timer.change added time: ring stays full

  // paused: shows PAUSED, keeps the remaining time from attributes.remaining
  paused: make(timer('paused', {total: 900, left: 450})),

  // not running: the card face says READY and shows the length; the ring is unlit
  idle: make(timer('idle', {total: 900})),

  // degenerate data
  noDuration: make(timer('active', {noDuration: true, left: 656, changed: at(-244)})),
  pastFinish: make(timer('active', {total: 900, left: -20})),
  noFinish: make(timer('active', {total: 900, attributes: {finishes_at: undefined}})),
  evilName: make(
    timer('active', {
      total: 900,
      left: 656,
      attributes: {friendly_name: '<img src=x onerror=alert(1)>'}
    })
  ),
  unavailable: make({[entity]: {state: 'unavailable', attributes: {}}}),
  unknown: make({[entity]: {state: 'unknown', attributes: {}}}),
  missing: make({})
};
