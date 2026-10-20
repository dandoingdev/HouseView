import assert from 'node:assert/strict';
import test from 'node:test';
import {
  armModes,
  canArm,
  canDisarm,
  codeBlocks,
  codeFormat,
  isArmed,
  modeOf,
  moodOf,
  needsCodeToArm,
  needsCodeToDisarm
} from '../../src/core/alarm.js';

const FULL = {supported_features: 1 | 2 | 4 | 32};
const home = modeOf('home');

test('modes follow the supported_features bits and keep their order', () => {
  assert.deepEqual(
    armModes(FULL).map((mode) => mode.key),
    ['home', 'away', 'night', 'vacation']
  );
  assert.deepEqual(
    armModes({supported_features: 2 | 8 | 16}).map((mode) => mode.key),
    ['away']
  );
  assert.deepEqual(armModes({}), []);
  assert.deepEqual(armModes({supported_features: '7'}), []);
  assert.equal(modeOf('nope'), undefined);
});

test('a code format is number or text, nothing else', () => {
  assert.equal(codeFormat({code_format: 'number'}), 'number');
  assert.equal(codeFormat({code_format: 'text'}), 'text');
  assert.equal(codeFormat({code_format: null}), null);
  assert.equal(codeFormat({code_format: 'pin'}), null);
  assert.equal(codeFormat(undefined), null);
});

test('arming needs a code unless the panel says it does not; disarming always does', () => {
  assert.equal(needsCodeToArm({code_format: 'number'}), true);
  assert.equal(needsCodeToArm({code_format: 'number', code_arm_required: true}), true);
  assert.equal(needsCodeToArm({code_format: 'number', code_arm_required: false}), false);
  assert.equal(needsCodeToArm({}), false);
  assert.equal(needsCodeToDisarm({code_format: 'text', code_arm_required: false}), true);
  assert.equal(needsCodeToDisarm({}), false);
});

test('arm starts from disarmed, with a supported mode and no code', () => {
  assert.equal(canArm({state: 'disarmed'}, FULL, home), true);
  assert.equal(canArm({state: 'armed_home'}, FULL, home), false);
  assert.equal(canArm({state: 'arming'}, FULL, home), false);
  assert.equal(canArm({state: 'disarmed'}, {supported_features: 2}, home), false);
  assert.equal(canArm({state: 'disarmed'}, {...FULL, code_format: 'number'}, home), false);
  assert.equal(
    canArm({state: 'disarmed'}, {...FULL, code_format: 'number', code_arm_required: false}, home),
    true
  );
  assert.equal(canArm({state: 'disarmed'}, FULL, undefined), false);
  assert.equal(canArm(undefined, FULL, home), false);
});

test('disarm works once armed, counting down or triggered, and not for a coded panel', () => {
  for (const state of ['armed_home', 'armed_custom_bypass', 'arming', 'pending', 'triggered'])
    assert.equal(canDisarm({state}, {}), true, state);
  for (const state of ['disarmed', 'disarming', 'unavailable', 'unknown'])
    assert.equal(canDisarm({state}, {}), false, state);
  assert.equal(canDisarm({state: 'armed_away'}, {code_format: 'number'}), false);
  assert.equal(canDisarm(undefined, {}), false);
});

test('code blocks only when a code is the sole thing in the way', () => {
  assert.equal(codeBlocks({state: 'disarmed'}, {...FULL, code_format: 'number'}), true);
  assert.equal(codeBlocks({state: 'disarmed'}, {code_format: 'number'}), false);
  assert.equal(
    codeBlocks({state: 'disarmed'}, {...FULL, code_format: 'number', code_arm_required: false}),
    false
  );
  assert.equal(codeBlocks({state: 'armed_away'}, {code_format: 'number'}), true);
  assert.equal(codeBlocks({state: 'armed_away'}, {}), false);
  assert.equal(codeBlocks({state: 'unavailable'}, {code_format: 'number'}), false);
  assert.equal(codeBlocks(undefined, {code_format: 'number'}), false);
});

test('armed means the state starts with armed', () => {
  assert.equal(isArmed({state: 'armed_night'}), true);
  assert.equal(isArmed({state: 'arming'}), false);
  assert.equal(isArmed(undefined), false);
});

test('mood follows the state and falls back sensibly', () => {
  assert.equal(moodOf({state: 'disarmed'}, true), 'disarmed');
  assert.equal(moodOf({state: 'armed_home'}, true), 'home');
  assert.equal(moodOf({state: 'armed_vacation'}, true), 'vacation');
  assert.equal(moodOf({state: 'armed_custom_bypass'}, true), 'armed');
  assert.equal(moodOf({state: 'arming'}, true), 'pending');
  assert.equal(moodOf({state: 'pending'}, true), 'pending');
  assert.equal(moodOf({state: 'triggered'}, true), 'triggered');
  assert.equal(moodOf({state: 'disarmed'}, false), 'unavailable');
  assert.equal(moodOf({state: 'weird'}, true), 'unavailable');
  assert.equal(moodOf(undefined, true), 'unavailable');
});
