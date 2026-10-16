import {dateTimeFormatter} from '../../core/intl.js';

const zones = new Map();

/** Validate timezone metadata rather than guessing offsets from a formatted clock value. */
export function validZone(value) {
  if (typeof value !== 'string' || !value) return null;
  if (zones.has(value)) return zones.get(value);
  try {
    dateTimeFormatter('en', {timeZone: value}).format(0);
    zones.set(value, value);
    return value;
  } catch {
    zones.set(value, null);
    return null;
  }
}

export function configuredIds(options = {}) {
  return [
    ...new Set(
      String(options.entities || '')
        .split(/[\s,]+/)
        .filter((id) => /^sensor\.[\w]+$/.test(id))
    )
  ];
}

export function discover(entries = [], configs = []) {
  const zones = new Map(configs.map((entry) => [entry.entry_id, validZone(entry.title)]));
  return entries
    .filter(
      (entry) =>
        entry.platform === 'worldclock' &&
        !entry.disabled_by &&
        entry.entity_id?.startsWith('sensor.')
    )
    .map((entry) => ({
      entity: entry.entity_id,
      name: entry.name || entry.original_name || '',
      zone: zones.get(entry.config_entry_id) || null
    }));
}

function parts(now, zone) {
  const formatter = dateTimeFormatter('en-GB', {
    timeZone: zone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23'
  });
  const p = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, Number(part.value)])
  );
  const day = Date.UTC(p.year, p.month - 1, p.day) / 86400000;
  return {day, minutes: day * 1440 + p.hour * 60 + p.minute};
}

export function relativeTime(now, zone, localZone) {
  if (!validZone(zone) || !validZone(localZone)) return null;
  const remote = parts(now, zone);
  const local = parts(now, localZone);
  return {days: remote.day - local.day, hours: (remote.minutes - local.minutes) / 60};
}

export function localZoneOf(hass) {
  return (
    (hass?.locale?.time_zone === 'server' && validZone(hass?.config?.time_zone)) ||
    dateTimeFormatter().resolvedOptions().timeZone
  );
}

export function clockRows(hass, descriptors, options, now) {
  const localZone = localZoneOf(hass);
  const explicit = configuredIds(options);
  const sources = explicit.length
    ? explicit.map((entity) => descriptors.find((row) => row.entity === entity) || {entity})
    : descriptors;
  return sources.map((row) => {
    const state = hass?.states?.[row.entity];
    const attrs = state?.attributes || {};
    const name = attrs.friendly_name || row.name || row.entity;
    const zone = validZone(attrs.time_zone || attrs.timezone) || row.zone || validZone(name);
    const available = !!state && !['unknown', 'unavailable'].includes(state.state);
    return {
      entity: row.entity,
      name,
      available,
      time: available ? state.state : '—',
      relative: available ? relativeTime(now, zone, localZone) : null
    };
  });
}
