import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  validateQuickActions,
  quickActionsEnabled,
  quickActionsConfigured,
  quickActionConfig
} from '../../src/core/quick-actions.js';
import {applyQuickActions, quickActionsSchema} from '../../src/editor/quick-actions-form.js';
import {watchedIds} from '../../src/core/hass-signature.js';

test('quick actions are opt-in, bounded and validated without mutating caller configuration', () => {
  const item = Object.freeze({entity: 'light.demo', action: 'turn_off', name: 'All lights off'});
  const config = Object.freeze({quick_actions: Object.freeze([item])});
  assert.doesNotThrow(() => validateQuickActions(config));
  assert.equal(quickActionsEnabled(config), true);
  assert.equal(quickActionsEnabled({}), false);
  assert.equal(quickActionsEnabled({...config, quick_actions_swipe: false}), false);
  assert.equal(quickActionsConfigured({...config, quick_actions_swipe: false}), true);
  assert.equal(quickActionsEnabled({...config, single_widget: true}), false);
  for (const bad of [
    {quick_actions: {}},
    {quick_actions: Array(7).fill(item)},
    {quick_actions: [{name: 'Missing entity'}]},
    {quick_actions_swipe: 'yes'},
    {quick_actions: [{entity: 'light.demo', action: 'bad'}]},
    {quick_actions: [{entity: 'script.demo', action: 'turn_off'}]},
    {quick_actions: [{entity: 'light.demo', tap_action: {action: 'perform-action'}}]}
  ])
    assert.throws(() => validateQuickActions(bad));
});

test('light off is explicit, helpers toggle and routines run their exact services', () => {
  assert.deepEqual(quickActionConfig({entity: 'light.all', action: 'turn_off'}).tap_action, {
    action: 'perform-action',
    perform_action: 'homeassistant.turn_off',
    target: {entity_id: 'light.all'}
  });
  assert.equal(quickActionConfig({entity: 'input_boolean.guest'}).tap_action.action, 'toggle');
  assert.equal(
    quickActionConfig({entity: 'script.night'}).tap_action.perform_action,
    'script.turn_on'
  );
  assert.equal(
    quickActionConfig({entity: 'scene.night'}).tap_action.perform_action,
    'scene.turn_on'
  );
  assert.equal(
    quickActionConfig({entity: 'input_button.test'}).tap_action.perform_action,
    'input_button.press'
  );
  assert.equal(
    quickActionConfig({entity: 'light.all', confirm: true}).tap_action.confirmation,
    true
  );
  const custom = {
    entity: 'light.demo',
    tap_action: {
      action: 'perform-action',
      perform_action: 'light.turn_on',
      data: {brightness_pct: 35}
    }
  };
  assert.equal(quickActionConfig(custom), custom);
});

test('native settings preserve order, advanced actions and unrelated dashboard settings', () => {
  const a = {entity: 'light.demo', name: 'Custom', tap_action: {action: 'none'}};
  const config = {wallpaper: 'teal', quick_actions: [a, {entity: 'input_boolean.guest'}]};
  const next = applyQuickActions(config, {
    quick_actions: [{entity: 'input_boolean.guest'}, {entity: 'light.demo', name: 'Renamed'}],
    quick_actions_swipe: false
  });
  assert.equal(next.wallpaper, 'teal');
  assert.equal(next.quick_actions_swipe, false);
  assert.equal(next.quick_actions[0].entity, 'input_boolean.guest');
  assert.equal(next.quick_actions[1].tap_action, a.tap_action);
  assert.equal(config.quick_actions[0], a);
  assert.throws(() => applyQuickActions(config, {quick_actions: Array(7).fill(a)}));
  assert.equal(
    quickActionsSchema().find((f) => f.name === 'quick_actions').selector.object.multiple,
    true
  );
});

test('quick-action-only entities participate in HA change detection', () => {
  assert.deepEqual(
    watchedIds({
      widgets: [],
      quick_actions: [
        {entity: 'input_boolean.guest'},
        {entity: 'input_boolean.guest'},
        {entity: 'script.night'}
      ]
    }),
    ['input_boolean.guest', 'script.night']
  );
});
