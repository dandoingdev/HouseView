// The "Automatic displays" section of the carousel editor: two on/off switches for the displays HouseView adds by itself
// (the timer display while a timer runs, album art while music plays; docs/overview-api.md). Pure functions, no DOM:
// carousel-editor.js renders the <ha-form> and calls these.
//
// Only booleans are editable here. A list value (`timer_display: [timer.kitchen]`, which replaces the widget-derived list)
// is shown as "on" and survives untouched until the user flips that switch.
import {AUTOMATIC_DISPLAYS, getOverview} from '../core/overview-registry.js';
import {field} from './form.js';

export const AUTOMATIC_KEYS = AUTOMATIC_DISPLAYS.map((display) => display.key);
/** The home overview is the one switch that is off unless the config says `true`. */
export const HOME_KEY = 'home_overview';

/** Do the section's fields mean anything? When one of the overviews is in the bundle, or the config already has a key. */
export const showAutomatic = (config) =>
  AUTOMATIC_DISPLAYS.some((display) => getOverview(display.overview)) ||
  AUTOMATIC_KEYS.some((key) => config[key] !== undefined);

/** The form data: on unless the config says `false`. */
export const automaticData = (config) => ({
  ...Object.fromEntries(AUTOMATIC_KEYS.map((key) => [key, config[key] !== false])),
  [HOME_KEY]: config[HOME_KEY] === true
});

export const automaticSchema = () =>
  [...AUTOMATIC_KEYS, HOME_KEY].map((key) => field(key, {boolean: {}}));

/**
 * Form value -> new card config. An untouched switch leaves its key exactly as it was (a list stays a list); a switch
 * that was turned off writes `false`, one that was turned on removes the key (on is the default).
 */
export function applyAutomatic(config, value) {
  const shown = automaticData(config);
  const next = {...config};
  for (const key of AUTOMATIC_KEYS) {
    if (value[key] === undefined || value[key] === shown[key]) continue;
    if (value[key]) delete next[key];
    else next[key] = false;
  }
  // the home overview: on writes `true`, off removes the key (off is the default)
  if (value[HOME_KEY] !== undefined && value[HOME_KEY] !== shown[HOME_KEY]) {
    if (value[HOME_KEY]) next[HOME_KEY] = true;
    else delete next[HOME_KEY];
  }
  return next;
}
