import {QUICK_ACTION_DOMAINS, QUICK_ACTION_LIMIT} from '../core/quick-actions.js';
import {field} from './form.js';

export const quickActionsData = (config) => ({
  quick_actions_swipe: config.quick_actions_swipe !== false,
  quick_actions_title: config.quick_actions_title || '',
  quick_actions: config.quick_actions || []
});

export const quickActionsSchema = () => [
  field('quick_actions_swipe', {boolean: {}}),
  field('quick_actions_title', {text: {}}),
  field('quick_actions', {
    object: {
      multiple: true,
      label_field: 'name',
      description_field: 'entity',
      fields: {
        flow: {
          selector: {
            select: {
              options: [
                {value: '', label: 'Device action'},
                {value: 'away', label: 'Leaving home · guided routine'},
                {value: 'sleeping', label: 'Good night · guided routine'}
              ]
            }
          }
        },
        entity: {selector: {entity: {domain: [...QUICK_ACTION_DOMAINS]}}},
        name: {selector: {text: {}}},
        icon: {selector: {icon: {}}},
        note: {selector: {text: {}}},
        action: {
          selector: {
            select: {
              options: [
                {value: 'auto', label: 'Automatic'},
                {value: 'toggle', label: 'Toggle'},
                {value: 'turn_on', label: 'Turn on'},
                {value: 'turn_off', label: 'Turn off'}
              ]
            }
          }
        },
        confirm: {selector: {boolean: {}}}
      }
    }
  })
];

/** Retain advanced YAML tap actions when the native form edits an existing item. Never truncate saved actions. */
export function applyQuickActions(config, value) {
  const next = {...config};
  if ('quick_actions_swipe' in value) {
    if (value.quick_actions_swipe === false) next.quick_actions_swipe = false;
    else delete next.quick_actions_swipe;
  }
  if ('quick_actions_title' in value) {
    if (value.quick_actions_title) next.quick_actions_title = value.quick_actions_title;
    else delete next.quick_actions_title;
  }
  if (Array.isArray(value.quick_actions)) {
    if (value.quick_actions.length > QUICK_ACTION_LIMIT)
      throw new Error('Choose up to six quick actions.');
    next.quick_actions = value.quick_actions.map((item, index) => {
      const clean = Object.fromEntries(
        Object.entries(item).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      );
      if (clean.flow) {
        delete clean.entity;
        delete clean.action;
        delete clean.confirm;
        delete clean.tap_action;
        return clean;
      }
      const previous =
        config.quick_actions?.[index]?.entity === item.entity
          ? config.quick_actions[index]
          : config.quick_actions?.find((saved) => saved.entity === item.entity);
      if (previous?.tap_action && !clean.tap_action) clean.tap_action = previous.tap_action;
      return clean;
    });
  }
  return next;
}
