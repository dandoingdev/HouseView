// The "Screensaver" section of the carousel editor: ha-form schema, labels and the config round trip.
// Pure functions (no DOM) so they are unit-testable; carousel-editor.js renders the <ha-form> and calls these.
import {getOverview, overviewList} from '../core/overview-registry.js';
import {t} from '../core/i18n.js';

const FRAMEWORK_FIELDS = [
  'type',
  'enabled',
  'entity',
  'idle_timeout',
  'preview',
  'start_in_edit_mode'
];

function selectorFor(hass, overview, key, spec) {
  const label = (value) => t(hass, `${overview.type}_overview.option.${key}.value.${value}`);
  const names = (values) => values.map((value) => ({value, label: label(value)}));
  switch (spec.type) {
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

/** First entry of `screensaver` (object or list) as ha-form data; `{}` when there is none. */
export function screensaverData(config) {
  const raw = config.screensaver;
  const entry = Array.isArray(raw) ? raw[0] : raw;
  return entry ? {enabled: true, ...entry} : {};
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
  const schema = [{name: 'type', selector: {select: {mode: 'dropdown', options: typeOptions}}}];
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
    schema.push({name: key, selector: selectorFor(hass, overview, key, spec)});
  }
  schema.push(
    {name: 'preview', selector: {boolean: {}}},
    {name: 'start_in_edit_mode', selector: {boolean: {}}}
  );
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

/**
 * Form value -> new card config. Keeps YAML minimal (an enabled screensaver has no `enabled` key), preserves the
 * entries beyond the first, and removes the key when the type is cleared.
 */
export function applyScreensaver(config, value) {
  const {screensaver: old, ...rest} = config;
  const tail = Array.isArray(old) ? old.slice(1) : [];
  if (!value.type) {
    return tail.length ? {...rest, screensaver: tail.length === 1 ? tail[0] : tail} : rest;
  }
  const {enabled, ...entry} = value;
  const clean = Object.fromEntries(
    Object.entries(entry).filter(([, v]) => v !== undefined && v !== '')
  );
  const first = enabled === false ? {...clean, enabled: false} : clean;
  return {...rest, screensaver: tail.length ? [first, ...tail] : first};
}
