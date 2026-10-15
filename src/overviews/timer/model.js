// Pure data mapping: a Home Assistant timer entity -> the numbers the display shows.
// No DOM, no Date.now, no Intl, no strings: `now` is passed in (ctx.now), words are made in index.js.

/** Tick marks around the screen. 60 reads as a clock face and divides every common timer length. */
export const TICK_COUNT = 60;

const NUMBER = /^\d+(?:\.\d+)?$/;

/**
 * A duration as seconds, or null when it cannot be read. Accepts what Home Assistant writes ("0:15:00", "1:30:00"),
 * the shorter "15:00" (minutes and seconds), "45" and plain numbers (seconds).
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseDuration(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const parts = value.trim().split(':');
  if (parts.length > 3 || !parts.every((part) => NUMBER.test(part))) return null;
  return parts.map(Number).reduce((total, part) => total * 60 + part, 0);
}

/** A timestamp (ISO string) as milliseconds, or null. */
export function parseTime(value) {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Whole seconds, rounded up: 10.2 s left still reads 0:11 until it is really over. Never negative. */
const wholeSeconds = (seconds) =>
  Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds - 1e-9)) : 0;

/** "m:ss", or "h:mm:ss" from one hour up. Never negative, never fractional. */
export function formatClock(seconds) {
  const s = wholeSeconds(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * The total duration as the units the caption names: [['h', 1], ['min', 30]] for 1 h 30 min, [['min', 15]],
 * [['sec', 45]]. Minutes and seconds both show below an hour ("1 MIN 30 SEC"); from an hour up the seconds are
 * rounded away. Empty for 0.
 * @returns {Array<['h'|'min'|'sec', number]>}
 */
export function durationParts(seconds) {
  const s = wholeSeconds(seconds);
  if (!s) return [];
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return [...(m ? [['min', m]] : []), ...(s % 60 ? [['sec', s % 60]] : [])];
  }
  const minutes = Math.round(s / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [['h', h], ...(m ? [['min', m]] : [])];
}

/** How many of the 60 ticks are lit: ceil(60 * remaining / total), clamped to 0..60. Time is used up from the end. */
export function litTicks(remaining, total) {
  if (!(total > 0) || !(remaining > 0)) return 0;
  return Math.min(TICK_COUNT, Math.max(0, Math.ceil((TICK_COUNT * remaining) / total - 1e-9)));
}

/**
 * @typedef {Object} TimerModel
 * @property {'running'|'paused'|'idle'|'unavailable'} status
 * @property {number} remaining   whole seconds left (idle: the duration), never negative
 * @property {number} total       the timer's length in seconds (0 when nothing says)
 * @property {number} lit         lit ticks, 0..60 (only a running or paused timer lights any)
 * @property {boolean} hasDuration  attributes.duration was present and readable
 */

/**
 * @param {{state?: {state?: string, last_changed?: string}, attrs?: Object, now: number}} input
 *   `now` in ms (ctx.now). `attrs` is the entity's attributes.
 * @returns {TimerModel}
 */
export function timerModel({state, attrs = {}, now}) {
  const raw = state?.state;
  if (!state || !raw || raw === 'unavailable' || raw === 'unknown') {
    return {status: 'unavailable', remaining: 0, total: 0, lit: 0, hasDuration: false};
  }
  const status = raw === 'active' ? 'running' : raw === 'paused' ? 'paused' : 'idle';
  const duration = parseDuration(attrs.duration);
  const reported = parseDuration(attrs.remaining);

  let remaining;
  if (status === 'running') {
    // An active timer counts down to finishes_at (remaining is a snapshot from the last state change).
    const finish = parseTime(attrs.finishes_at);
    remaining = finish !== null ? (finish - now) / 1000 : (reported ?? duration ?? 0);
  } else if (status === 'paused') {
    remaining = reported ?? duration ?? 0;
  } else {
    remaining = duration ?? reported ?? 0;
  }
  remaining = wholeSeconds(remaining);

  let total = duration ?? 0;
  if (!(total > 0)) {
    // No duration attribute: the largest length we can prove from what is there.
    const since = parseTime(state.last_changed);
    const elapsed =
      status === 'running' && since !== null && since <= now ? (now - since) / 1000 : 0;
    total = wholeSeconds(Math.max(remaining, reported ?? 0, remaining + elapsed));
  }
  const lit = status === 'running' || status === 'paused' ? litTicks(remaining, total) : 0;
  return {status, remaining, total, lit, hasDuration: duration !== null && duration > 0};
}
