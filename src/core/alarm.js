// Home Assistant alarm panel features and the arming rules the tile and the alarm view share.
// AlarmControlPanelEntityFeature bits from Home Assistant core.

export const ALARM_FEATURE = {
  ARM_HOME: 1,
  ARM_AWAY: 2,
  ARM_NIGHT: 4,
  TRIGGER: 8,
  ARM_CUSTOM_BYPASS: 16,
  ARM_VACATION: 32
};

/** The arming modes the view offers, in key order. `state` is what the panel reports once armed. */
export const ARM_MODES = Object.freeze([
  {key: 'home', bit: ALARM_FEATURE.ARM_HOME, service: 'alarm_arm_home', icon: 'shield-home'},
  {key: 'away', bit: ALARM_FEATURE.ARM_AWAY, service: 'alarm_arm_away', icon: 'shield-lock'},
  {key: 'night', bit: ALARM_FEATURE.ARM_NIGHT, service: 'alarm_arm_night', icon: 'shield-moon'},
  {
    key: 'vacation',
    bit: ALARM_FEATURE.ARM_VACATION,
    service: 'alarm_arm_vacation',
    icon: 'shield-airplane'
  }
]);

const DISARMABLE = new Set(['arming', 'pending', 'triggered']);

export function supports(attrs, bit) {
  const features = attrs?.supported_features;
  return typeof features === 'number' && Number.isFinite(features) && !!(features & bit);
}

/** The modes this panel advertises. */
export function armModes(attrs) {
  return ARM_MODES.filter((mode) => supports(attrs, mode.bit));
}

export function modeOf(key) {
  return ARM_MODES.find((mode) => mode.key === key);
}

/** `number`, `text` or null. HouseView has no keypad: a panel with a code is finished in Home Assistant's dialog. */
export function codeFormat(attrs) {
  const format = attrs?.code_format;
  return format === 'number' || format === 'text' ? format : null;
}

export const needsCodeToDisarm = (attrs) => codeFormat(attrs) !== null;
export const needsCodeToArm = (attrs) =>
  codeFormat(attrs) !== null && attrs?.code_arm_required !== false;

export const isArmed = (state) =>
  typeof state?.state === 'string' && state.state.startsWith('armed');

/** Arming starts from disarmed, with a mode the panel supports and no code to ask for. */
export function canArm(state, attrs, mode) {
  return (
    state?.state === 'disarmed' && !!mode && supports(attrs, mode.bit) && !needsCodeToArm(attrs)
  );
}

/** Disarm (or cancel an arming that is under way) once armed, counting down or triggered. */
export function canDisarm(state, attrs) {
  return (isArmed(state) || DISARMABLE.has(state?.state)) && !needsCodeToDisarm(attrs);
}

/** True when a key that would otherwise work is held back only because the panel wants a code. */
export function codeBlocks(state, attrs) {
  if (!state) return false;
  if (state.state === 'disarmed') return armModes(attrs).length > 0 && needsCodeToArm(attrs);
  return (isArmed(state) || DISARMABLE.has(state.state)) && needsCodeToDisarm(attrs);
}

/**
 * Flat colour of the alarm view.
 * `disarmed` | `home` | `away` | `night` | `vacation` | `armed` | `pending` | `triggered` | `unavailable`.
 */
export function moodOf(state, ok) {
  if (!ok || !state) return 'unavailable';
  const value = state.state;
  if (value === 'disarmed') return 'disarmed';
  if (value === 'triggered') return 'triggered';
  if (value === 'arming' || value === 'pending' || value === 'disarming') return 'pending';
  if (isArmed(state)) {
    const key = value.slice('armed_'.length);
    return modeOf(key) ? key : 'armed';
  }
  return 'unavailable';
}
