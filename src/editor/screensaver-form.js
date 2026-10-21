// The "Screensaver" section of the carousel editor: ha-form schema, labels and the config round trip.
// Pure functions (no DOM) so they are unit-testable; carousel-editor.js renders the <ha-form> and calls these.
import {getOverview, overviewList} from '../core/overview-registry.js';
import {colourFormData} from '../core/colour.js';
import {t} from '../core/i18n.js';
import {DEFAULT_RETURN_SECONDS} from '../core/idle.js';

const FRAMEWORK_FIELDS = [
  'type',
  'return_timeout',
  'enabled',
  'entity',
  'idle_timeout',
  'start_in_edit_mode'
];

const RETURN_FIELD = {
  name: 'return_timeout',
  selector: {number: {min: 0, max: 86400, step: 5, mode: 'box', unit_of_measurement: 's'}}
};

function selectorFor(hass, overview, key, spec) {
  const label = (value) => t(hass, `${overview.type}_overview.option.${key}.value.${value}`);
  const names = (values) => values.map((value) => ({value, label: label(value)}));
  switch (spec.type) {
    case 'colour':
      return {color_rgb: {}};
    case 'boolean':
      return {boolean: {}};
    case 'number':
      return {number: {min: spec.min, max: spec.max, step: spec.step, mode: 'box'}};
    case 'icon':
      return {icon: {}};
    case 'text':
      return {text: {}};
    case 'entity':
      return {entity: {domain: [...spec.domains]}};
    case 'enum':
      return {select: {mode: 'dropdown', options: names(spec.values)}};
    case 'enum_list':
      return {select: {multiple: true, mode: 'list', options: names(spec.values)}};
  }
}

const returnTimeoutOf = (config) => config.return_timeout ?? DEFAULT_RETURN_SECONDS;

/** First entry of `screensaver` (object or list) as ha-form data, plus the carousel return timeout. */
export function screensaverData(config) {
  const raw = config.screensaver;
  const entry = Array.isArray(raw) ? raw[0] : raw;
  const return_timeout = returnTimeoutOf(config);
  if (!entry) return {return_timeout};
  const overview = getOverview(entry.type);
  return {
    enabled: true,
    ...entry,
    ...colourFormData(overview?.options, entry),
    ...overview?.editor?.toForm?.(entry),
    return_timeout
  };
}

/** Number of entries beyond what the form can show (a list is edited in YAML). */
export const extraEntries = (config) =>
  Array.isArray(config.screensaver) ? config.screensaver.length - 1 : 0;

export function screensaverSchema(hass, data) {
  // Automatic displays (timer display, cover art) are not offered; one already written in YAML stays visible.
  const offered = overviewList().filter((o) => o.selectable !== false || o.type === data.type);
  const typeOptions = [
    {value: '', label: t(hass, 'screensaver.none')},
    ...offered.map((o) => ({value: o.type, label: t(hass, `${o.type}_overview.label`)}))
  ];
  const schema = [
    {name: 'type', selector: {select: {mode: 'dropdown', options: typeOptions}}},
    RETURN_FIELD
  ];
  const overview = getOverview(data.type);
  if (!overview) return schema;
  schema.push({name: 'enabled', selector: {boolean: {}}});
  if (overview.entity !== 'none') {
    schema.push({
      name: 'entity',
      required: overview.entity === 'required',
      selector: {entity: {domain: [...overview.domains]}}
    });
  }
  // An event overview (a running timer) is never started by idle time: the timeout would do nothing.
  if (overview.activation !== 'event') {
    schema.push({
      name: 'idle_timeout',
      selector: {number: {min: 0, max: 86400, step: 5, mode: 'box', unit_of_measurement: 's'}}
    });
  }
  for (const [key, spec] of Object.entries(overview.options)) {
    if (spec.when && !spec.when(data)) continue;
    schema.push({name: key, selector: selectorFor(hass, overview, key, spec)});
  }
  // The editor preview already shows the screensaver while you edit, so there is no "show it now" field.
  schema.push({name: 'start_in_edit_mode', selector: {boolean: {}}});
  return schema;
}

export function screensaverLabels(hass, type) {
  const overview = getOverview(type);
  const text = (key, fallback) => {
    const value = t(hass, key);
    return value === key ? fallback : value;
  };
  return {
    computeLabel: ({name}) =>
      FRAMEWORK_FIELDS.includes(name)
        ? t(hass, `screensaver.field.${name}`)
        : text(`${overview?.type}_overview.option.${name}.label`, name),
    computeHelper: ({name}) =>
      FRAMEWORK_FIELDS.includes(name)
        ? text(`screensaver.helper.${name}`, '')
        : text(`${overview?.type}_overview.option.${name}.helper`, '')
  };
}

function withoutReturnTimeout(config) {
  if (config.return_timeout === undefined) return config;
  const {return_timeout: _return_timeout, ...rest} = config;
  return rest;
}

/** Keep a custom timeout, and leave the default out of the YAML. A missing field keeps what the card already has. */
function withReturnTimeout(config, value) {
  if (!value || !('return_timeout' in value)) return config;
  const seconds = value.return_timeout;
  const base = withoutReturnTimeout(config);
  if (seconds === '' || seconds == null || seconds === DEFAULT_RETURN_SECONDS) return base;
  return {...base, return_timeout: seconds};
}

/**
 * Form value -> new card config. Keeps YAML minimal (an enabled screensaver has no `enabled` key), preserves the
 * entries beyond the first, and removes the key when the type is cleared. `return_timeout` is a card option, not
 * part of the screensaver entry.
 */
export function applyScreensaver(config, value) {
  const {return_timeout: _return_timeout, ...fields} = value ?? {};
  const {screensaver: old, ...rest} = config;
  const tail = Array.isArray(old) ? old.slice(1) : [];
  let next;
  if (!fields.type) {
    next = tail.length ? {...rest, screensaver: tail.length === 1 ? tail[0] : tail} : rest;
  } else {
    const {enabled, ...entry} = fields;
    const clean = Object.fromEntries(
      Object.entries(entry).filter(([, v]) => v !== undefined && v !== '')
    );
    const first = enabled === false ? {...clean, enabled: false} : clean;
    next = {...rest, screensaver: tail.length ? [first, ...tail] : first};
  }
  return withReturnTimeout(next, value);
}
