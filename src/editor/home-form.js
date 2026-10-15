// The "Home summary" section of the carousel editor: the switch that adds the home button, its title, the bins sensor and
// the transport chips (docs/overviews/home.md). Pure functions, no DOM: carousel-editor.js renders the <ha-form> and calls these.
import {getOverview} from '../core/overview-registry.js';
import {field} from './form.js';

export const HOME_KEYS = ['home_overview', 'home_title', 'home_bins', 'home_transport'];

/** The section means something when the home summary is in the bundle, or the config already has one of its keys. */
export const showHome = (config) =>
  !!getOverview('home') || HOME_KEYS.some((key) => config[key] !== undefined);

const binsOf = (value) => (typeof value === 'string' ? value : (value?.entity ?? ''));
const itemsOf = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => (typeof item === 'string' ? {entity: item} : item))
    .filter((item) => item && typeof item === 'object');

/** The form data: the switch is off unless the config says `true`; a plain `sensor.id` transport entry reads as {entity}. */
export const homeData = (config) => ({
  home_overview: config.home_overview === true,
  home_title: config.home_title ?? '',
  home_bins: binsOf(config.home_bins),
  home_transport: itemsOf(config.home_transport)
});

export const homeSchema = () => [
  field('home_overview', {boolean: {}}),
  field('home_title', {text: {}}),
  field('home_bins', {entity: {domain: 'sensor'}}),
  field('home_transport', {
    object: {
      multiple: true,
      label_field: 'label',
      description_field: 'entity',
      fields: {
        entity: {required: true, selector: {entity: {domain: 'sensor'}}},
        label: {selector: {text: {}}},
        icon: {selector: {icon: {}}}
      }
    }
  })
];

/**
 * Form value -> new card config. Empty values remove their key; an untouched `home_bins` / `home_transport` keeps the
 * shape the user wrote (a bare `sensor.id`, a `{entity}` object).
 */
export function applyHome(config, value) {
  const shown = homeData(config);
  const next = {...config};
  for (const key of HOME_KEYS) {
    if (value[key] === undefined || JSON.stringify(value[key]) === JSON.stringify(shown[key]))
      continue;
    const v = value[key];
    if (key === 'home_overview') {
      if (v) next[key] = true;
      else delete next[key];
    } else if (key === 'home_transport') {
      const items = itemsOf(v)
        .filter((item) => typeof item.entity === 'string' && item.entity)
        .map(({entity, label, icon}) => ({
          entity,
          ...(label ? {label} : {}),
          ...(icon ? {icon} : {})
        }));
      if (items.length) next[key] = items;
      else delete next[key];
    } else if (v) next[key] = v;
    else delete next[key];
  }
  return next;
}
