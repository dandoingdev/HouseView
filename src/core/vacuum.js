// Home Assistant vacuum features and the activity rules the tile and the cleaning panel share.
// VacuumEntityFeature bits from Home Assistant core.

export const VACUUM_FEATURE = {
  TURN_ON: 1,
  TURN_OFF: 2,
  PAUSE: 4,
  STOP: 8,
  RETURN_HOME: 16,
  FAN_SPEED: 32,
  BATTERY: 64,
  LOCATE: 512,
  CLEAN_SPOT: 1024,
  START: 8192
};

/** Fan-speed keys on the panel. Longer lists stay on the tile as the current speed only. */
export const FAN_SPEED_LIMIT = 6;

const AT_HOME = new Set(['docked', 'charging']);
const MOVING = new Set(['cleaning', 'returning']);

export function supports(attrs, bit) {
  const features = attrs?.supported_features;
  return typeof features === 'number' && Number.isFinite(features) && !!(features & bit);
}

/** 0–100, or null when the vacuum is not reporting a battery. */
export function batteryPercent(attrs) {
  const value = attrs?.battery_level;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** The integration's own status sentence, when it has one. */
export function reportedStatus(attrs) {
  return typeof attrs?.status === 'string' ? attrs.status.trim() : '';
}

/** String fan speeds, capped for the panel. */
export function fanSpeeds(attrs) {
  const list = attrs?.fan_speed_list;
  if (!Array.isArray(list)) return [];
  return list.filter((item) => typeof item === 'string' && item.trim()).slice(0, FAN_SPEED_LIMIT);
}

/**
 * Flat colour of the cleaning panel.
 * `cleaning` | `returning` | `paused` | `docked` | `idle` | `error` | `unavailable`.
 * Charging uses the docked colour.
 */
export function moodOf(state, ok) {
  if (!ok || !state) return 'unavailable';
  if (state.state === 'docked' || state.state === 'charging') return 'docked';
  if (
    state.state === 'cleaning' ||
    state.state === 'returning' ||
    state.state === 'paused' ||
    state.state === 'error'
  )
    return state.state;
  return 'idle';
}

/** The tile is highlighted while the vacuum is out or paused mid-job. */
export function isActive(state) {
  return (
    !!state &&
    (state.state === 'cleaning' || state.state === 'returning' || state.state === 'paused')
  );
}

/** `start` when the vacuum advertises START, else `on` for the older TURN_ON bit. */
export function startKind(attrs) {
  if (supports(attrs, VACUUM_FEATURE.START)) return 'start';
  if (supports(attrs, VACUUM_FEATURE.TURN_ON)) return 'on';
  return null;
}

export function startService(attrs) {
  return supports(attrs, VACUUM_FEATURE.START) ? 'start' : 'turn_on';
}

/** Start or resume, except while it is already cleaning or heading back. */
export function canStart(state, attrs) {
  if (!state || !startKind(attrs)) return false;
  return !MOVING.has(state.state);
}

export function canPause(state, attrs) {
  return !!state && MOVING.has(state.state) && supports(attrs, VACUUM_FEATURE.PAUSE);
}

/** `stop` for STOP, else `off` for the older TURN_OFF bit. */
export function stopKind(attrs) {
  if (supports(attrs, VACUUM_FEATURE.STOP)) return 'stop';
  if (supports(attrs, VACUUM_FEATURE.TURN_OFF)) return 'off';
  return null;
}

export function stopService(attrs) {
  return supports(attrs, VACUUM_FEATURE.STOP) ? 'stop' : 'turn_off';
}

export function canStop(state, attrs) {
  if (!state || !stopKind(attrs)) return false;
  if (stopKind(attrs) === 'off') return true;
  return state.state === 'cleaning' || state.state === 'paused' || state.state === 'returning';
}

export function canReturn(state, attrs) {
  if (!state || !supports(attrs, VACUUM_FEATURE.RETURN_HOME)) return false;
  return !AT_HOME.has(state.state) && state.state !== 'returning';
}

export function canSpot(state, attrs) {
  if (!state || !supports(attrs, VACUUM_FEATURE.CLEAN_SPOT)) return false;
  return !MOVING.has(state.state);
}

export function canLocate(state, attrs) {
  return !!state && supports(attrs, VACUUM_FEATURE.LOCATE);
}
