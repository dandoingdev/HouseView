import {applyQuickActions} from '../../src/editor/quick-actions-form.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  routineChecks,
  routineFix,
  validateRoutineChecks,
  suggestedRoutineChecks,
  routineExpected
} from '../../src/core/house-routines.js';
import {
  validateQuickActions,
  quickActionAvailable,
  quickActionConfig
} from '../../src/core/quick-actions.js';
import {houseModesData, applyHouseModes} from '../../src/editor/house-modes-form.js';
import {watchedIds} from '../../src/core/hass-signature.js';
const checks = [
  {kind: 'opening', entity: 'binary_sensor.window'},
  {kind: 'light', entity: 'light.hall'},
  {kind: 'lock', entity: 'lock.front'},
  {kind: 'climate', entity: 'climate.home'},
  {kind: 'alarm', entity: 'alarm_control_panel.home'}
];
const config = {
  house_mode_entity: 'input_select.mode',
  house_modes: [{mode: 'away', description: 'Leave', checks}]
};
const hass = {
  states: {
    'binary_sensor.window': {state: 'on', attributes: {}},
    'light.hall': {state: 'off', attributes: {}},
    'lock.front': {state: 'unlocked', attributes: {}},
    'climate.home': {state: 'heat', attributes: {hvac_modes: ['off', 'heat']}},
    'alarm_control_panel.home': {state: 'unavailable', attributes: {}}
  }
};
test('readiness checks distinguish ready, exceptions, missing states and disconnected reports', () => {
  assert.deepEqual(
    routineChecks(config, 'away', hass).map((row) => row.status),
    ['attention', 'ready', 'attention', 'attention', 'unknown']
  );
  assert.ok(routineChecks(config, 'away', {states: {}}).every((row) => row.status === 'unknown'));
  assert.ok(
    routineChecks(config, 'away', {...hass, connected: false}).every(
      (row) => row.status === 'unknown'
    )
  );
  assert.equal(routineExpected(checks[4], 'sleeping'), 'armed_home');
  assert.equal(
    routineExpected({...checks[4], expected_state: 'armed_night'}, 'sleeping'),
    'armed_night'
  );
});
test('fixes are explicit, supported and never unlock, arm or operate contacts', () => {
  const rows = routineChecks(config, 'away', hass);
  assert.equal(routineFix(rows[0], hass), null);
  assert.equal(routineFix(rows[1], hass), null);
  assert.equal(routineFix(rows[2], hass).tap_action.perform_action, 'lock.lock');
  assert.deepEqual(routineFix(rows[3], hass).tap_action.data, {hvac_mode: 'off'});
  assert.equal(routineFix({...rows[2], actual: 'jammed'}, hass), null);
  assert.equal(routineFix({...rows[3], expected: 'heat'}, hass), null);
  assert.equal(routineFix(rows[4], hass), null);
});
test('check validation is bounded, typed and rejects duplicate entities and unsupported expectations', () => {
  assert.doesNotThrow(() => validateRoutineChecks(config.house_modes[0]));
  for (const mode of [
    {mode: 'home', checks},
    {mode: 'away', checks: Array(25).fill(checks[0])},
    {mode: 'away', checks: [checks[0], checks[0]]},
    {mode: 'away', checks: [{kind: 'opening', entity: 'light.hall'}]},
    {mode: 'away', checks: [{kind: 'light', entity: 'light.hall', expected_state: 'on'}]},
    {mode: 'away', checks: [{kind: '__proto__', entity: 'sensor.x'}]}
  ])
    assert.throws(() => validateRoutineChecks(mode));
});
test('check IDs are watched, custom expectations survive the editor and suggestions do not mutate config', () => {
  for (const check of checks) assert.ok(watchedIds(config).includes(check.entity));
  assert.deepEqual(applyHouseModes(config, houseModesData(config)), config);
  const source = {
    home_attention: [checks[0]],
    widgets: [
      {type: 'light', entity: 'light.hall'},
      {type: 'light', entity: 'light.hall'},
      {type: 'climate', entity: 'climate.home'}
    ]
  };
  const snapshot = structuredClone(source);
  assert.equal(suggestedRoutineChecks(source).length, 3);
  assert.deepEqual(source, snapshot);
});
test('quick routine shortcuts are non-executable routes, with strict shape validation', () => {
  assert.doesNotThrow(() =>
    validateQuickActions({quick_actions: [{flow: 'away'}, {flow: 'sleeping'}]})
  );
  for (const action of [
    {flow: 'home'},
    {flow: 'away', entity: 'light.hall'},
    {flow: 'sleeping', tap_action: {action: 'toggle'}}
  ])
    assert.throws(() => validateQuickActions({quick_actions: [action]}));
  assert.equal(quickActionAvailable(hass, {flow: 'away'}, config), true);
  assert.equal(quickActionAvailable(hass, {flow: 'away'}, {}), false);
  assert.equal(quickActionConfig({flow: 'away'}), null);
});

test('editor routine pins remove former device commands and nested empty check fields are cleaned', () => {
  const changed = applyQuickActions(
    {quick_actions: [{entity: 'light.hall', tap_action: {action: 'toggle'}}]},
    {quick_actions: [{flow: 'away', entity: 'light.hall', action: 'turn_off', confirm: true}]}
  );
  assert.deepEqual(changed.quick_actions, [{flow: 'away'}]);
  assert.doesNotThrow(() => validateQuickActions(changed));
  const data = houseModesData(config);
  data.house_modes = data.house_modes.map((mode) =>
    mode.mode === 'away'
      ? {...mode, checks: mode.checks.map((check) => ({...check, expected_state: ''}))}
      : mode
  );
  const cleaned = applyHouseModes(config, data);
  assert.equal(cleaned.house_mode_entity, config.house_mode_entity);
  assert.deepEqual(cleaned.house_modes.find((mode) => mode.mode === 'away').checks, checks);
});
