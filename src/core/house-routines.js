/** Explicit, bounded readiness checks. Only reported states count as verification. */
export const HOUSE_ROUTINES = Object.freeze(['away', 'sleeping']);
export const ROUTINE_CHECK_LIMIT = 24;
const DOMAINS = {
  opening: 'binary_sensor',
  light: 'light',
  lock: 'lock',
  climate: 'climate',
  alarm: 'alarm_control_panel'
};
const STATES = {
  opening: ['off'],
  light: ['off'],
  lock: ['locked'],
  climate: ['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'],
  alarm: ['armed_away', 'armed_home', 'armed_night', 'armed_vacation', 'disarmed']
};
export const ROUTINE_ICONS = Object.freeze({
  opening: 'window-closed-variant',
  light: 'lightbulb-group-outline',
  lock: 'lock-outline',
  climate: 'thermostat',
  alarm: 'shield-check-outline'
});

export function validateRoutineChecks(mode) {
  if (mode.checks === undefined) return;
  if (!HOUSE_ROUTINES.includes(mode.mode))
    throw new Error('Readiness checks belong to Away or Sleeping.');
  if (!Array.isArray(mode.checks) || mode.checks.length > ROUTINE_CHECK_LIMIT)
    throw new Error('Choose up to 24 readiness checks per routine.');
  const seen = new Set();
  for (const check of mode.checks) {
    if (
      !check ||
      !Object.prototype.hasOwnProperty.call(DOMAINS, check.kind) ||
      !new RegExp(`^${DOMAINS[check.kind]}\\.[a-z0-9_]+$`).test(check.entity || '')
    )
      throw new Error(
        'Readiness checks need a matching door/window, light, lock, climate or alarm entity.'
      );
    if (seen.has(check.entity)) throw new Error('Each routine can check an entity only once.');
    seen.add(check.entity);
    if (check.name !== undefined && typeof check.name !== 'string')
      throw new Error('Readiness check names must be text.');
    if (
      check.expected_state !== undefined &&
      check.expected_state !== '' &&
      !STATES[check.kind].includes(check.expected_state)
    )
      throw new Error('Readiness check expected_state is not supported for this kind.');
  }
}

export const routineExpected = (check, mode) =>
  check.expected_state ||
  {
    opening: 'off',
    light: 'off',
    lock: 'locked',
    climate: 'off',
    alarm: mode === 'away' ? 'armed_away' : 'armed_home'
  }[check.kind];
export const routineConfig = (config, mode) =>
  config?.house_modes?.find((item) => item.mode === mode);

export function routineChecks(config, mode, hass) {
  return (routineConfig(config, mode)?.checks || []).map((check, index) => {
    const state = hass?.states?.[check.entity];
    const actual = state?.state;
    const expected = routineExpected(check, mode);
    const unknown =
      hass?.connected === false || !state || !actual || ['unknown', 'unavailable'].includes(actual);
    return {
      ...check,
      index,
      actual,
      expected,
      name: check.name || state?.attributes?.friendly_name || check.entity,
      status: unknown ? 'unknown' : actual === expected ? 'ready' : 'attention',
      icon: ROUTINE_ICONS[check.kind]
    };
  });
}

/** Explicit fixes only. Contact sensors and alarm codes stay in Home Assistant's own details dialog. */
export function routineFix(row, hass) {
  if (row.status !== 'attention') return null;
  if (row.kind === 'light')
    return {
      entity: row.entity,
      label: 'house_routines.turn_off',
      tap_action: {
        action: 'perform-action',
        perform_action: 'light.turn_off',
        target: {entity_id: row.entity}
      }
    };
  if (row.kind === 'lock' && row.actual === 'unlocked')
    return {
      entity: row.entity,
      label: 'house_routines.lock',
      tap_action: {
        action: 'perform-action',
        perform_action: 'lock.lock',
        target: {entity_id: row.entity}
      }
    };
  if (
    row.kind === 'climate' &&
    row.expected === 'off' &&
    hass?.states?.[row.entity]?.attributes?.hvac_modes?.includes('off')
  )
    return {
      entity: row.entity,
      label: 'house_routines.turn_off',
      tap_action: {
        action: 'perform-action',
        perform_action: 'climate.set_hvac_mode',
        target: {entity_id: row.entity},
        data: {hvac_mode: 'off'}
      }
    };
  return null;
}

/** Suggestions are copied into the editor only on request and never run a service. */
export function suggestedRoutineChecks(config) {
  const checks = [];
  const seen = new Set();
  const add = (entity, kind, name) => {
    if (entity && !seen.has(entity) && checks.length < ROUTINE_CHECK_LIMIT) {
      seen.add(entity);
      checks.push({entity, kind, ...(name ? {name} : {})});
    }
  };
  for (const rule of config.home_attention || [])
    if (rule.kind === 'opening') add(rule.entity, 'opening', rule.name);
  for (const widget of config.widgets || []) {
    const kind = {light: 'light', lock: 'lock', climate: 'climate', alarm_control_panel: 'alarm'}[
      widget.type
    ];
    if (kind) add(widget.entity, kind, widget.name);
  }
  return checks;
}
