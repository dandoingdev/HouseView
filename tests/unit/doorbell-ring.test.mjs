// A binary doorbell (occupancy: Clear -> Detected) is only on for about a second. The overlay must arm on that
// edge and stay up for `duration` after the sensor is off again.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/overviews/index.js';
import {getOverview} from '../../src/core/overview-registry.js';

const overview = getOverview('doorbell');
const T0 = Date.parse('2026-10-21T10:27:52.498Z');

const ctx = ({entity, state, last_changed, now, duration = 30}) => ({
  entityId: entity,
  state: {state, last_changed},
  options: {duration},
  now: () => now
});

test('a one-second Clear -> Detected pulse keeps the camera up for the duration', () => {
  const entity = 'binary_sensor.bell_occupancy_pulse';
  const pressed = new Date(T0).toISOString();
  const cleared = new Date(T0 + 1000).toISOString();
  const on = ctx({entity, state: 'on', last_changed: pressed, now: T0 + 200});
  assert.equal(overview.autoShow(on), true);
  assert.equal(overview.autoWake(on), false);

  const off = ctx({entity, state: 'off', last_changed: cleared, now: T0 + 1000});
  assert.equal(overview.autoShow(off), false, 'the clear is not a new press');
  assert.equal(overview.autoWake(off), false, 'the camera stays up after the pulse');

  const later = ctx({entity, state: 'off', last_changed: cleared, now: T0 + 29000});
  assert.equal(overview.autoWake(later), false);
  const done = ctx({entity, state: 'off', last_changed: cleared, now: T0 + 30000});
  assert.equal(overview.autoWake(done), true);

  const again = ctx({
    entity,
    state: 'on',
    last_changed: new Date(T0 + 31000).toISOString(),
    now: T0 + 31100
  });
  assert.equal(overview.autoShow(again), true, 'the next press arms another show');
});

test('a binary sensor that is already clear, and was never seen on, does not ring', () => {
  const entity = 'binary_sensor.bell_occupancy_idle';
  const idle = ctx({
    entity,
    state: 'off',
    last_changed: new Date(T0).toISOString(),
    now: T0 + 500
  });
  assert.equal(overview.autoShow(idle), false);
  assert.equal(overview.autoWake(idle), true);
});

test('an event doorbell still rings from its timestamp state', () => {
  const entity = 'event.doorbell_ring';
  const pressed = new Date(T0).toISOString();
  const recent = ctx({entity, state: pressed, last_changed: pressed, now: T0 + 3000});
  assert.equal(overview.autoShow(recent), true);
  assert.equal(overview.autoWake(recent), false);
  const old = ctx({entity, state: pressed, last_changed: pressed, now: T0 + 30000});
  assert.equal(overview.autoShow(old), false);
  assert.equal(overview.autoWake(old), true);
});
