// Pure helpers for the thermostat view: what the face says, which keys work. No DOM, no hass.

// ClimateEntityFeature bit in `supported_features` (Home Assistant core): the entity takes one target temperature.
const TARGET_TEMPERATURE = 1;

/** True while the entity reports a single numeric target (heat_cool has a low/high pair instead). */
export const hasSingleTarget = (state, attrs, num) =>
  !!state && num(attrs.temperature) && state.state !== 'heat_cool';

/**
 * The mood of the view, from `hvac_action` first (what the unit is doing now), then the mode it is set to.
 * `cooling` | `heating` | `idle` | `off` | `unavailable`.
 */
export function moodOf(state, ok) {
  if (!ok) return 'unavailable';
  if (state.state === 'off') return 'off';
  const action = state.attributes?.hvac_action;
  if (action === 'cooling' || action === 'drying') return 'cooling';
  if (action === 'heating' || action === 'preheating') return 'heating';
  if (action === 'idle' || action === 'fan' || action === 'defrosting') return 'idle';
  if (state.state === 'cool' || state.state === 'dry') return 'cooling';
  if (state.state === 'heat') return 'heating';
  return 'idle';
}

/**
 * Whether the down / up key can act: an available entity with a single numeric target, the target-temperature
 * feature and room before `min_temp` / `max_temp` (a missing limit never blocks).
 */
export function canStep(state, attrs, num, direction) {
  if (!hasSingleTarget(state, attrs, num)) return false;
  if (!(attrs.supported_features & TARGET_TEMPERATURE)) return false;
  const limit = direction === 'up' ? attrs.max_temp : attrs.min_temp;
  if (!num(limit)) return true;
  return direction === 'up' ? attrs.temperature < limit : attrs.temperature > limit;
}
