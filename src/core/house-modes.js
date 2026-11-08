import {validateRoutineChecks} from './house-routines.js';
/** Fixed household vocabulary; state and automation ownership stay in Home Assistant. */
export const HOUSE_MODES = Object.freeze([
  Object.freeze({id: 'home', option: 'Home', icon: 'home-outline'}),
  Object.freeze({id: 'away', option: 'Away', icon: 'home-export-outline'}),
  Object.freeze({id: 'guests', option: 'Guests', icon: 'account-group-outline'}),
  Object.freeze({id: 'evening', option: 'Evening', icon: 'weather-sunset'}),
  Object.freeze({id: 'sleeping', option: 'Sleeping', icon: 'weather-night'})
]);

export function validateHouseModes(config) {
  if (
    config.house_mode_entity !== undefined &&
    !/^(input_select|select)\.[a-z0-9_]+$/.test(config.house_mode_entity)
  )
    throw new Error('house_mode_entity must be an input_select or select entity id.');
  if (config.house_modes === undefined) return;
  if (!Array.isArray(config.house_modes) || config.house_modes.length > 5)
    throw new Error('house_modes must be a list of up to five mode descriptions.');
  const ids = new Set();
  const options = new Set();
  for (const item of config.house_modes) {
    if (!item || !HOUSE_MODES.some((mode) => mode.id === item.mode) || ids.has(item.mode))
      throw new Error(
        'Each house mode must be home, away, guests, evening or sleeping, without duplicates.'
      );
    if (
      [item.option, item.description].some(
        (value) => value !== undefined && typeof value !== 'string'
      )
    )
      throw new Error('House mode option and description must be text.');
    if (item.script !== undefined && !/^script\.[a-z0-9_]+$/.test(item.script))
      throw new Error('House mode script must be a script entity id.');
    validateRoutineChecks(item);
    ids.add(item.mode);
  }
  for (const mode of houseModeItems(config)) {
    if (options.has(mode.option)) throw new Error('House mode option names must be unique.');
    options.add(mode.option);
  }
}

/** Only five entries, derived on demand; no input-keyed cache or mutable public registry. */
export function houseModeItems(config) {
  return HOUSE_MODES.map((mode) => {
    const saved = config?.house_modes?.find((item) => item.mode === mode.id);
    return {
      ...mode,
      option: saved?.option?.trim() || mode.option,
      description: saved?.description?.trim() || '',
      ...(saved?.script ? {script: saved.script} : {})
    };
  });
}

export function houseModeState(config, hass) {
  const entity = config?.house_mode_entity;
  const state = hass?.states?.[entity];
  const available = !!state && !['unknown', 'unavailable'].includes(state.state);
  const items = houseModeItems(config).map((item) => ({
    ...item,
    scriptAvailable:
      !item.script ||
      !!(hass?.states?.[item.script] && ['off'].includes(hass.states[item.script].state))
  }));
  const current = available ? items.find((mode) => mode.option === state.state) : undefined;
  return {entity, state, available, items, current};
}

export function canActivateHouseMode(model, mode) {
  return !!(
    model.available &&
    model.items[0].description &&
    model.items[0].scriptAvailable !== false &&
    model.state.attributes?.options?.includes(model.items[0].option) &&
    mode?.description &&
    mode.scriptAvailable !== false &&
    model.state.attributes?.options?.includes(mode.option) &&
    model.state.state !== mode.option
  );
}
