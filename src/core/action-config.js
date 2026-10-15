// Home Assistant standard `tap_action` / `hold_action` / `double_tap_action` for a widget's primary button
// (docs/architecture.md). Opt-in: a widget without those keys is untouched.
//
//   tap_action:
//     action: perform-action
//     perform_action: light.turn_on
//     data: {brightness_pct: 40}
//     target: {entity_id: light.hall}
//     confirmation: true
//
// Implemented: more-info, toggle, perform-action (and the older call-service), navigate, url, none.
// Not implemented: assist (no stable public hook). Specialised sub-controls (cover keys, presets, transport,
// climate +/-) stay internal actions and never go through here.
import {createBaseContext} from './context.js';
import {requestConfirmation} from './confirm.js';
import {dispatchAction} from './dispatch.js';
import {fireEvent} from './events.js';

export const GESTURES = ['tap_action', 'hold_action', 'double_tap_action'];
export const ACTIONS = [
  'more-info',
  'toggle',
  'perform-action',
  'call-service',
  'navigate',
  'url',
  'none'
];

const GESTURE_LABELS = {
  tap_action: 'Tap action',
  hold_action: 'Hold action',
  double_tap_action: 'Double tap action'
};
// What Home Assistant does for a gesture that names no `action`
const DEFAULT_ACTION = {
  tap_action: 'more-info',
  hold_action: 'more-info',
  double_tap_action: 'none'
};
// Schemes `url` may open. Relative paths stay on this origin.
const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

/** True when a widget configures any of the three gestures. */
export function hasActionConfig(widget) {
  return GESTURES.some((key) => widget?.[key] !== undefined && widget[key] !== null);
}

/** True when the widget needs the gesture detector (hold or double tap); plain tap_action needs only click. */
export function needsGestures(widget) {
  return widget?.hold_action != null || widget?.double_tap_action != null;
}

/**
 * The normalised action config of one gesture, or null when the widget does not configure it.
 * @param {Object} widget
 * @param {'tap_action'|'hold_action'|'double_tap_action'} gesture
 * @returns {Object|null}
 */
export function actionConfigFor(widget, gesture) {
  const raw = widget?.[gesture];
  if (raw === undefined || raw === null) return null;
  const config = isObject(raw) ? raw : {};
  return {...config, action: config.action || DEFAULT_ACTION[gesture]};
}

/**
 * Check the shape of the three gesture keys of a widget. Throws Error with a readable sentence.
 * Rejecting a bad value cannot break a working config: a widget without these keys is untouched.
 */
export function validateActionConfigs(widget) {
  for (const gesture of GESTURES) {
    const raw = widget?.[gesture];
    if (raw === undefined || raw === null) continue;
    const label = GESTURE_LABELS[gesture];
    if (!isObject(raw)) throw new Error(`${label} must be an object with an action.`);
    const action = raw.action || DEFAULT_ACTION[gesture];
    if (!ACTIONS.includes(action)) {
      throw new Error(
        `${label} must be one of ${ACTIONS.filter((a) => a !== 'call-service').join(', ')}.`
      );
    }
    if ((action === 'perform-action' || action === 'call-service') && !serviceOf(raw)) {
      throw new Error(`${label} needs perform_action in the form domain.service.`);
    }
    if (action === 'navigate' && typeof raw.navigation_path !== 'string') {
      throw new Error(`${label} needs a navigation_path.`);
    }
    if (action === 'url' && !safeUrl(raw.url_path)) {
      throw new Error(`${label} needs a url_path starting with http, https, mailto or tel.`);
    }
  }
}

/** `light.turn_on` -> {domain, service}; undefined when the config does not name a service. */
function serviceOf(config) {
  const name = config.perform_action ?? config.service;
  const dot = typeof name === 'string' ? name.indexOf('.') : -1;
  if (dot < 1 || dot === name.length - 1) return undefined;
  return {domain: name.slice(0, dot), service: name.slice(dot + 1)};
}

/** The href to open for a url action, or null when it is missing or not a safe scheme. */
function safeUrl(path) {
  if (typeof path !== 'string' || !path) return null;
  try {
    const base = globalThis.window?.location?.href ?? 'http://localhost/';
    const url = new URL(path, base);
    return SAFE_PROTOCOLS.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Is the signed-in user exempt from the confirmation? */
function exempt(confirmation, hass) {
  const exemptions = isObject(confirmation) ? confirmation.exemptions : undefined;
  return Array.isArray(exemptions) && exemptions.some((e) => e?.user && e.user === hass?.user?.id);
}

async function confirmed(card, config, ctx) {
  if (!config.confirmation || exempt(config.confirmation, card._hass)) return true;
  const text = isObject(config.confirmation) && config.confirmation.text;
  return (await requestConfirmation(card, text || ctx.t('confirm.default'))) === true;
}

/** Run a service call the way an internal action does: entity pending, failure shown in the feedback line. */
async function guarded(card, id, run, ctx) {
  const pending = card._pending;
  if (id && pending?.has(id)) return;
  if (id) pending?.add(id);
  card._message = '';
  card._refreshActionState?.();
  try {
    await run();
  } catch (error) {
    card._message = ctx.t('error.action', {reason: error?.message || ctx.t('error.try_again')});
  } finally {
    if (id) pending?.delete(id);
    card._refreshActionState?.();
  }
}

function navigate(config) {
  const win = globalThis.window;
  const replace = config.navigation_replace === true;
  if (replace)
    win.history.replaceState(
      win.history.state?.root ? {root: true} : null,
      '',
      config.navigation_path
    );
  else win.history.pushState(null, '', config.navigation_path);
  fireEvent(win, 'location-changed', {replace});
}

/**
 * Run one gesture of a widget.
 * @param {any} card
 * @param {Object} widget
 * @param {'tap_action'|'hold_action'|'double_tap_action'} gesture
 * @returns {Promise<boolean>} false when the widget does not configure the gesture (nothing happened)
 */
export async function runActionConfig(card, widget, gesture) {
  const config = actionConfigFor(widget, gesture);
  if (!config) return false;
  const ctx = createBaseContext(card);
  const entity = config.entity || widget.entity;
  if (!(await confirmed(card, config, ctx))) return true;

  switch (config.action) {
    case 'more-info':
      if (entity) card._info(entity);
      break;
    case 'toggle':
      if (entity) await dispatchAction(card, 'toggle', entity);
      break;
    case 'perform-action':
    case 'call-service': {
      const {domain, service} = serviceOf(config);
      // Home Assistant accepts target ids (entity_id, device_id, area_id...) inside the service data
      const data = {...config.data, ...config.target};
      await guarded(card, entity, () => ctx.call(domain, service, data), ctx);
      break;
    }
    case 'navigate':
      navigate(config);
      break;
    case 'url': {
      const href = safeUrl(config.url_path);
      if (href) globalThis.window.open(href, '_blank', 'noopener,noreferrer');
      break;
    }
    default: // 'none'
  }
  return true;
}
