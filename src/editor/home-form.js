// The "Home summary" section of the carousel editor: the switch that adds the home button, its title, the bins sensor and
// the transport chips (docs/overviews/home.md). Pure functions, no DOM: carousel-editor.js renders the <ha-form> and calls these.
import {getOverview} from '../core/overview-registry.js';
import {field} from './form.js';

export const HOME_KEYS = [
  'home_overview',
  'home_swipe',
  'home_title',
  'home_bins',
  'home_transport',
  'home_attention',
  'home_battery_auto'
];

/** The section means something when the home summary is in the bundle, or the config already has one of its keys. */
export const showHome = (config) =>
  !!getOverview('home') || HOME_KEYS.some((key) => config[key] !== undefined);

const binsOf = (value) => (typeof value === 'string' ? value : (value?.entity ?? ''));
const itemsOf = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => (typeof item === 'string' ? {entity: item} : item))
    .filter((item) => item && typeof item === 'object');

/**
 * The form data. The home button is off unless the config says `true`. Swipe is on when `home_swipe` is true, or when
 * an older config only turned on the button (swipe came with it) and did not set `home_swipe: false`.
 */
export const homeData = (config) => ({
  home_overview: config.home_overview === true,
  home_swipe:
    config.home_swipe === true || (config.home_swipe !== false && config.home_overview === true),
  home_battery_auto: config.home_battery_auto === true,
  home_title: config.home_title ?? '',
  home_bins: binsOf(config.home_bins),
  home_transport: itemsOf(config.home_transport),
  home_attention: Array.isArray(config.home_attention) ? config.home_attention : []
});

export const homeSchema = () => [
  field('home_overview', {boolean: {}}),
  field('home_swipe', {boolean: {}}),
  field('home_title', {text: {}}),
  field('home_bins', {entity: {domain: 'sensor'}}),
  field('home_battery_auto', {boolean: {}}),
  field('home_attention', {
    object: {
      multiple: true,
      label_field: 'name',
      description_field: 'entity',
      fields: {
        entity: {required: true, selector: {entity: {}}},
        kind: {
          required: true,
          selector: {
            select: {
              options: [
                {value: 'opening', label: 'Open door or window'},
                {value: 'battery', label: 'Low battery'},
                {value: 'light', label: 'Light on too long'},
                {value: 'device', label: 'Device unavailable'}
              ]
            }
          }
        },
        name: {selector: {text: {}}},
        after: {selector: {number: {min: 0, max: 10080, mode: 'box', unit_of_measurement: 'min'}}},
        below: {selector: {number: {min: 0, max: 100, mode: 'box', unit_of_measurement: '%'}}}
      }
    }
  }),
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
    if (key === 'home_swipe') continue;
    if (key === 'home_overview' || key === 'home_battery_auto') {
      if (v) next[key] = true;
      else delete next[key];
    } else if (key === 'home_attention') {
      const rules = (Array.isArray(v) ? v : []).map((rule) =>
        Object.fromEntries(
          Object.entries(rule).filter(
            ([, value]) => value !== undefined && value !== null && value !== ''
          )
        )
      );
      if (rules.length) next[key] = rules;
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
  // Swipe can be on without the footer button. When the button is on, omit `home_swipe` so older configs keep
  // swiping; write false only to turn the swipe off while the button stays.
  if ('home_swipe' in value) {
    const button = next.home_overview === true;
    const swipe = value.home_swipe === true;
    if (swipe && !button) next.home_swipe = true;
    else if (!swipe && button) next.home_swipe = false;
    else delete next.home_swipe;
  }
  return next;
}
