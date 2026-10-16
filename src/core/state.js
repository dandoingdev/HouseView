// Entity availability. The policy "state unknown still counts as available" is data on the registry
// (a widget's allowsUnknownDomain), not code here: this file names no widget kind.
import {allowsUnknownDomain} from './registry.js';

/** `light.kitchen` -> `light`. Anything that is not an entity id gives ''. */
export function domainOf(id) {
  return typeof id === 'string' ? id.split('.')[0] : '';
}

/**
 * An entity is available when it exists, is not "unavailable", and is not "unknown" - except for domains
 * whose state is legitimately "unknown" (scenes and buttons never report anything else).
 * @param {{state?: string}|undefined} state   hass.states[id]
 * @param {string} id
 */
export function isAvailable(state, id) {
  return (
    !!state &&
    state.state !== 'unavailable' &&
    (allowsUnknownDomain(domainOf(id)) || state.state !== 'unknown')
  );
}

/**
 * Availability under an action or widget policy:
 * `entity` = isAvailable, `always` = true, `allow-unknown` = exists and is not "unavailable"
 * (blinds without position feedback report "unknown" but must stay controllable).
 * @param {{state?: string}|undefined} state
 * @param {string} id
 * @param {'entity'|'always'|'allow-unknown'} [policy]
 */
export function isUsable(state, id, policy = 'entity') {
  if (policy === 'always') return true;
  if (policy === 'allow-unknown') return !!state && state.state !== 'unavailable';
  return isAvailable(state, id);
}
