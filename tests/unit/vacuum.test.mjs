import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FAN_SPEED_LIMIT,
  batteryPercent,
  canReturn,
  canStart,
  canStop,
  fanSpeeds,
  moodOf,
  startService,
  stopService
} from '../../src/core/vacuum.js';

const features = (bits, extra = {}) => ({supported_features: bits, ...extra});
const START = 8192;
const STOP = 8;
const RETURN_HOME = 16;
const FAN_SPEED = 32;
const TURN_ON = 1;
const TURN_OFF = 2;

test('battery percent clamps numbers and ignores anything else', () => {
  assert.equal(batteryPercent({battery_level: 72.4}), 72);
  assert.equal(batteryPercent({battery_level: 150}), 100);
  assert.equal(batteryPercent({battery_level: -4}), 0);
  assert.equal(batteryPercent({battery_level: '72'}), null);
  assert.equal(batteryPercent({}), null);
});

test('fan speeds keep the first strings and drop the rest', () => {
  const list = ['Quiet', '', ' ', 3, 'Balanced', 'Turbo', 'Max', 'Mop', 'Auto', 'Silent'];
  assert.deepEqual(fanSpeeds({fan_speed_list: list}), [
    'Quiet',
    'Balanced',
    'Turbo',
    'Max',
    'Mop',
    'Auto'
  ]);
  assert.equal(FAN_SPEED_LIMIT, 6);
  assert.deepEqual(fanSpeeds({}), []);
});

test('mood follows the activity, and charging sits with docked', () => {
  assert.equal(moodOf({state: 'cleaning'}, true), 'cleaning');
  assert.equal(moodOf({state: 'charging'}, true), 'docked');
  assert.equal(moodOf({state: 'mopping'}, true), 'idle');
  assert.equal(moodOf({state: 'docked'}, false), 'unavailable');
  assert.equal(moodOf(undefined, true), 'unavailable');
});

test('start, stop and return follow the activity and the feature bits', () => {
  const modern = features(START | STOP | RETURN_HOME);
  assert.equal(canStart({state: 'docked'}, modern), true);
  assert.equal(canStart({state: 'cleaning'}, modern), false);
  assert.equal(canStart({state: 'paused'}, modern), true);
  assert.equal(startService(modern), 'start');
  assert.equal(canStop({state: 'cleaning'}, modern), true);
  assert.equal(canStop({state: 'docked'}, modern), false);
  assert.equal(stopService(modern), 'stop');
  assert.equal(canReturn({state: 'cleaning'}, modern), true);
  assert.equal(canReturn({state: 'docked'}, modern), false);
  assert.equal(canReturn({state: 'charging'}, modern), false);
  assert.equal(canReturn({state: 'returning'}, modern), false);

  const legacy = features(TURN_ON | TURN_OFF);
  assert.equal(canStart({state: 'idle'}, legacy), true);
  assert.equal(startService(legacy), 'turn_on');
  assert.equal(canStop({state: 'docked'}, legacy), true);
  assert.equal(stopService(legacy), 'turn_off');
  assert.equal(canStart({state: 'docked'}, features(FAN_SPEED)), false);
});
