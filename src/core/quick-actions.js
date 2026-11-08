import {HOUSE_ROUTINES} from './house-routines.js';
import {validateActionConfigs} from './action-config.js';
import {isAvailable} from './state.js';

export const QUICK_ACTION_LIMIT = 6;
export const QUICK_ACTION_DOMAINS = Object.freeze([
  'light',
  'switch',
  'input_boolean',
  'fan',
  'automation',
  'scene',
  'script',
  'button',
  'input_button'
]);
const RUN_DOMAINS = ['scene', 'script', 'button', 'input_button'];
const BEHAVIOURS = ['auto', 'toggle', 'turn_on', 'turn_off'];

/** One fixed page; validate without changing the saved order, action data or caller-owned objects. */
export function validateQuickActions(config) {
  if (config.quick_actions_swipe !== undefined && typeof config.quick_actions_swipe !== 'boolean')
    throw new Error('quick_actions_swipe must be true or false.');
  if (config.quick_actions_title !== undefined && typeof config.quick_actions_title !== 'string')
    throw new Error('quick_actions_title must be text.');
  if (config.quick_actions === undefined) return;
  if (!Array.isArray(config.quick_actions) || config.quick_actions.length > QUICK_ACTION_LIMIT)
    throw new Error('quick_actions must be a list of up to six actions.');
  for (const item of config.quick_actions) {
    if (item?.flow !== undefined) {
      if (!HOUSE_ROUTINES.includes(item.flow))
        throw new Error('Quick action flow must be away or sleeping.');
      if (item.entity || item.tap_action || item.action || item.confirm)
        throw new Error('A routine shortcut cannot also configure a device action.');
      if (
        [item.name, item.icon, item.note].some(
          (value) => value !== undefined && typeof value !== 'string'
        )
      )
        throw new Error('Quick action name, icon and note must be text.');
      continue;
    }
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      !/^[a-z_]+\.[a-z0-9_]+$/.test(item.entity || '')
    )
      throw new Error('Each quick action needs an entity.');
    if (
      [item.name, item.icon, item.note].some(
        (value) => value !== undefined && typeof value !== 'string'
      )
    )
      throw new Error('Quick action name, icon and note must be text.');
    if (item.confirm !== undefined && typeof item.confirm !== 'boolean')
      throw new Error('Quick action confirm must be true or false.');
    if (item.action !== undefined && !BEHAVIOURS.includes(item.action))
      throw new Error('Quick action action must be auto, toggle, turn_on or turn_off.');
    const domain = item.entity.split('.')[0];
    if (!item.tap_action && !QUICK_ACTION_DOMAINS.includes(domain))
      throw new Error('This quick action entity needs a tap_action.');
    if (!item.tap_action && RUN_DOMAINS.includes(domain) && item.action && item.action !== 'auto')
      throw new Error('Scenes, scripts and buttons use the automatic quick action.');
    validateActionConfigs(item);
  }
}

export const quickActionsConfigured = (config) =>
  !config?.single_widget && !!config?.quick_actions?.length;
export const quickActionsEnabled = (config) =>
  quickActionsConfigured(config) && config.quick_actions_swipe !== false;

export function quickActionAvailable(hass, item, config) {
  if (item.flow)
    return (
      HOUSE_ROUTINES.includes(item.flow) && !!config?.house_mode_entity && !config.single_widget
    );
  const state = hass?.states?.[item.entity];
  return (
    isAvailable(state, item.entity) && !(item.entity.startsWith('script.') && state.state === 'on')
  );
}

/** Reuse the normal HA action runner, including confirmation, explicit targets and failure feedback. */
export function quickActionConfig(item) {
  if (item.flow) return null;
  if (item.tap_action)
    return item.confirm && !item.tap_action.confirmation
      ? {...item, tap_action: {...item.tap_action, confirmation: true}}
      : item;
  const domain = item.entity.split('.')[0];
  const action = item.action || 'auto';
  const run = RUN_DOMAINS.includes(domain);
  const tap_action =
    !run && (action === 'auto' || action === 'toggle')
      ? {action: 'toggle'}
      : {
          action: 'perform-action',
          perform_action: run
            ? `${domain}.${domain === 'button' || domain === 'input_button' ? 'press' : 'turn_on'}`
            : `homeassistant.${action}`,
          target: {entity_id: item.entity}
        };
  if (item.confirm) tap_action.confirmation = true;
  return {...item, tap_action};
}
