// London Underground's documented status vocabulary. Unrecognised or missing reports are not disruptions.
// https://www.home-assistant.io/integrations/london_underground/
const CRITICAL = new Set([
  'closed',
  'suspended',
  'part suspended',
  'part closure',
  'severe delays',
  'part closed',
  'not running',
  'no service'
]);
const WARNING = new Set([
  'special service',
  'planned closure',
  'reduced service',
  'bus service',
  'minor delays',
  'exit only',
  'no step free access',
  'change of frequency',
  'diverted',
  'issues reported'
]);

export function validateLineAlert(config) {
  if (
    config.line_alert_entity != null &&
    config.line_alert_entity !== '' &&
    (typeof config.line_alert_entity !== 'string' ||
      !/^sensor\.[a-z0-9_]+$/.test(config.line_alert_entity))
  )
    throw new Error('line_alert_entity must be a sensor entity id.');
  if (config.line_alert_name != null && typeof config.line_alert_name !== 'string')
    throw new Error('line_alert_name must be text.');
}

export function lineAlert(config, hass) {
  if (!config?.line_alert_entity || config.single_widget || hass?.connected === false) return null;
  const entity = config.line_alert_entity;
  const sensor = hass?.states?.[entity];
  if (typeof sensor?.state !== 'string') return null;
  const status = sensor.state
    .trim()
    .replace(/[_\s]+/g, ' ')
    .toLowerCase();
  const severity = CRITICAL.has(status) ? 'critical' : WARNING.has(status) ? 'warning' : null;
  if (!severity) return null;
  const friendly = sensor.attributes?.friendly_name;
  const name =
    config.line_alert_name?.trim() ||
    (typeof friendly === 'string'
      ? friendly.replace(/^(?:London Underground|TfL)\s*/i, '').trim()
      : '') ||
    entity.slice(7).replaceAll('_', ' ');
  const detail = sensor.attributes?.Description ?? sensor.attributes?.description;
  return {
    entity,
    name,
    status: sensor.state.trim(),
    severity,
    detail: typeof detail === 'string' ? detail.trim() : '',
    short: status.includes('delay') ? 'delays' : 'issue'
  };
}
