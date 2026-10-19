// Household checks plus optional metadata-based battery discovery. No device services.
export const ATTENTION_KINDS = ['opening', 'battery', 'light', 'device'];

/** Cached until `hass.entities` / `hass.devices` identity changes (registry updates). */
let batteryCache = {entities: undefined, devices: undefined, list: null};

/** Test seam: drop the discovered-battery cache. */
export function _resetBatteryCache() {
  batteryCache = {entities: undefined, devices: undefined, list: null};
}

/**
 * Match Maintenance: visible sensor/binary_sensor states with device_class battery, including
 * unassigned devices. Rescans only when the entity/device registries are replaced.
 */
export function discoveredBatteries(hass) {
  const entities = hass?.entities;
  const devices = hass?.devices;
  if (batteryCache.list && batteryCache.entities === entities && batteryCache.devices === devices) {
    return batteryCache.list;
  }
  const states = Object.entries(hass?.states || {});
  const charging = new Map();
  for (const [entity, state] of states) {
    const device = entities?.[entity]?.device_id;
    if (device && state.attributes?.device_class === 'battery_charging' && !charging.has(device)) {
      charging.set(device, entity);
    }
  }
  const list = states.flatMap(([entity, state]) => {
    const metadata = entities?.[entity];
    if (
      !/^(sensor|binary_sensor)\./.test(entity) ||
      state.attributes?.device_class !== 'battery' ||
      metadata?.hidden ||
      metadata?.hidden_by ||
      metadata?.disabled_by ||
      metadata?.disabled
    )
      return [];
    return [
      {entity, kind: 'battery', automatic: true, charging: charging.get(metadata?.device_id)}
    ];
  });
  batteryCache = {entities, devices, list};
  return list;
}

/** Stable id list for signatures: same batteries after a registry swap that did not change them. */
export function discoveredBatteryIds(hass) {
  return discoveredBatteries(hass)
    .flatMap((rule) => [rule.entity, rule.charging])
    .filter(Boolean)
    .sort();
}

export function attentionRules(config, hass) {
  const explicit = Array.isArray(config?.home_attention) ? config.home_attention : [];
  return config?.home_battery_auto ? [...explicit, ...discoveredBatteries(hass)] : explicit;
}
export const attentionIds = (config, hass) => [
  ...new Set(
    attentionRules(config, hass)
      .flatMap((rule) => [rule.entity, rule.charging])
      .filter(Boolean)
  )
];

export function attentionItems(config, stateOf, now, hass) {
  const seen = new Set();
  const rows = [];
  for (const rule of attentionRules(config, hass)) {
    if (seen.has(rule.entity)) continue;
    seen.add(rule.entity);
    const state = stateOf(rule.entity);
    const raw = state?.state;
    const stamp = Date.parse(state?.last_changed || '');
    const age = Number.isFinite(stamp) ? Math.max(0, now - stamp) / 60000 : null;
    const item = {
      entity: rule.entity,
      name: rule.name || state?.attributes?.friendly_name || rule.entity,
      kind: rule.kind
    };
    const offline = !state || ['unavailable', 'unknown'].includes(raw);
    if (offline) {
      // Maintenance's low-battery list excludes unknown/unavailable readings.
      if (rule.automatic) continue;
      // Missing metadata is not evidence of a healthy device. Never call an unknown window closed.
      if (age !== null && age < (rule.kind === 'device' ? (rule.after ?? 5) : 5)) continue;
      rows.push({
        ...item,
        reason: !state ? 'missing' : raw,
        tone: 'muted',
        icon: 'mdi:cloud-off-outline',
        priority: 3
      });
    } else if (rule.kind === 'opening' && raw === 'on') {
      if (age !== null && age < (rule.after ?? 0)) continue;
      rows.push({
        ...item,
        reason: 'open',
        tone: 'amber',
        icon: 'mdi:window-open-variant',
        priority: 0
      });
    } else if (rule.kind === 'battery') {
      if (rule.entity.startsWith('binary_sensor.')) {
        if (raw === 'on')
          rows.push({
            ...item,
            reason: 'battery',
            tone: 'amber',
            icon: 'mdi:battery-low',
            priority: 1
          });
      } else {
        if (rule.automatic && rule.charging && stateOf(rule.charging)?.state === 'on') continue;
        const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
        if (Number.isFinite(value) && value >= 0 && value <= (rule.below ?? 20)) {
          rows.push({
            ...item,
            reason: 'battery_value',
            value,
            tone: 'amber',
            icon: 'mdi:battery-low',
            priority: 1
          });
        }
      }
    } else if (
      rule.kind === 'light' &&
      raw === 'on' &&
      age !== null &&
      age >= (rule.after ?? 120)
    ) {
      rows.push({
        ...item,
        reason: 'light',
        hours: Math.floor(age / 60),
        minutes: Math.floor(age),
        tone: 'amber',
        icon: 'mdi:lightbulb-on-outline',
        priority: 2
      });
    }
  }
  return rows.sort((a, b) => a.priority - b.priority);
}
