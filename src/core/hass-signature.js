// Change detection for `set hass`: should the tiles be re-rendered for this hass update?
//
// Home Assistant sets `hass` on every card for every state change in the whole house, so this must be cheap.
// Only the entities a card watches (plus language, units, dark mode and time zone) matter.
//
//   deep       JSON.stringify of the watched states. Needed by mock hass objects whose state objects are
//              mutated IN PLACE (tests/index.html does that); never used for a whole `hass.states`.
//   reference  compare each watched state object by identity. Real Home Assistant replaces a state object
//              on every change, so this is exact and costs nothing. Chosen automatically when
//              `hass.connection` exists.
//
// `state_compare: deep | reference | auto` (default auto) overrides the choice.
import {discoveredBatteryIds} from './home-attention.js';
import {extensions, getWidget} from './registry.js';

export const COMPARE_MODES = ['deep', 'reference', 'auto'];

/** Entity ids one widget reads (its own entity plus `def.watch`), without duplicates. */
export function widgetWatchIds(widget, config, hass) {
  if (!widget) return [];
  const ids = [];
  if (widget.entity) ids.push(widget.entity);
  const extra = getWidget(widget.type)?.watch?.(widget, config, hass);
  if (Array.isArray(extra)) ids.push(...extra);
  return [...new Set(ids.filter(Boolean))];
}

/** Entity ids whose state change must re-render the card, without duplicates. */
export function watchedIds(config, hass) {
  if (!config) return [];
  const ids = [];
  for (const widget of config.widgets ?? []) ids.push(...widgetWatchIds(widget, config, hass));
  for (const {extension} of extensions()) ids.push(...(extension.entities?.(config) || []));
  return [...new Set(ids.filter(Boolean))];
}

/** 'deep' or 'reference' for this config and hass object. */
export function resolveMode(config, hass) {
  const requested = config?.state_compare;
  if (requested === 'deep' || requested === 'reference') return requested;
  return hass?.connection ? 'reference' : 'deep';
}

/** The values besides entity states that change what the tiles show. */
function scalars(hass) {
  return [
    hass?.config?.unit_system?.temperature,
    hass?.locale?.language,
    hass?.locale?.time_format,
    hass?.themes?.darkMode,
    hass?.locale?.time_zone,
    hass?.config?.time_zone
  ];
}

/**
 * A signature of the watched part of `hass`. Compare two with sameSignature.
 * @param {any} hass
 * @param {string[]} ids
 * @param {'deep'|'reference'} [mode]
 * @returns {string|{refs: any[], scalars: any[]}}
 */
export function computeSignature(hass, ids, mode = 'deep') {
  const states = ids.map((id) => hass?.states?.[id]);
  if (mode === 'reference') return {refs: states, scalars: scalars(hass)};
  return JSON.stringify([states, ...scalars(hass)]);
}

const sameList = (a, b) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

/** True when two signatures describe the same watched state. A different mode never matches. */
export function sameSignature(a, b) {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (!a || !b) return false;
  return sameList(a.refs, b.refs) && sameList(a.scalars, b.scalars);
}

/** 1 when a service call for that id is in flight. Pending is not part of hass, but it changes the tile. */
function pendingFlags(card, ids) {
  const pending = card._pending;
  return ids.map((id) => (pending?.has(id) ? 1 : 0));
}

/**
 * Per-tile change check for `_updateWidgets`. Locale/units/dark mode force every tile via
 * `card._scalarsDirty` (set by hassChanged). A pending service call for a watched entity also
 * counts: the tile must disable and re-enable even though the state object has not changed.
 * Ticks still call `element.update()` directly.
 * @returns {boolean} true when this widget's watched state or pending flags changed
 */
export function widgetHassChanged(card, index, widget, hass) {
  const mode = resolveMode(card._config, hass);
  const ids = widgetWatchIds(widget, card._config, hass);
  const states = ids.map((id) => hass?.states?.[id]);
  const pending = pendingFlags(card, ids);
  const prev = card._widgetSignatures?.get(index);
  if (!card._widgetSignatures) card._widgetSignatures = new Map();
  if (mode === 'reference') {
    const same = !!prev && sameList(prev.states, states) && sameList(prev.pending, pending);
    card._widgetSignatures.set(index, {states, pending});
    return !same;
  }
  const json = JSON.stringify([states, pending]);
  card._widgetSignatures.set(index, json);
  return prev !== json;
}

/**
 * The call the hass setter makes: compute the signature, compare it with `card._signature`, store it.
 * @param {any} card   uses card._config and card._signature
 * @param {any} hass
 * @returns {boolean} true when the tiles need an update
 */
export function hassChanged(card, hass) {
  const config = card._config;
  const nextScalars = scalars(hass);
  const scalarsDirty = !card._scalars || !sameList(card._scalars, nextScalars);
  let signature = computeSignature(hass, watchedIds(config, hass), resolveMode(config, hass));
  if (config?.home_battery_auto) {
    // Registry identity is handled inside discoveredBatteries; the signature only cares when the
    // discovered id list actually changes, so a no-op registry swap does not repaint the card.
    const batteries = discoveredBatteryIds(hass).join('\0');
    signature =
      typeof signature === 'string'
        ? JSON.stringify([signature, batteries])
        : {...signature, scalars: [...signature.scalars, batteries]};
  }
  if (sameSignature(card._signature, signature)) {
    card._scalarsDirty = false;
    return false;
  }
  card._signature = signature;
  card._scalars = nextScalars;
  card._scalarsDirty = scalarsDirty;
  return true;
}
