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

test('remembered doorbell presses are isolated by connection and bounded', async () => {
  const {PRESS_CACHE_LIMIT} = await import('../../src/overviews/doorbell/index.js');
  const connection = {};
  const make = (entity, state, owner = connection) => ({
    ...ctx({entity, state, last_changed: new Date(T0).toISOString(), now: T0 + 100}),
    hass: {connection: owner}
  });
  assert.equal(overview.autoShow(make('binary_sensor.shared', 'on')), true);
  assert.equal(overview.autoWake(make('binary_sensor.shared', 'off')), false);
  assert.equal(overview.autoWake(make('binary_sensor.shared', 'off', {})), true);
  for (let i = 0; i < PRESS_CACHE_LIMIT; i++)
    overview.autoShow(make(`binary_sensor.test${i}`, 'on'));
  assert.equal(overview.autoWake(make('binary_sensor.shared', 'off')), true, 'old press evicted');
  assert.equal(overview.autoWake(make(`binary_sensor.test${PRESS_CACHE_LIMIT - 1}`, 'off')), false);
});

test('warm camera stills reuse recent images and release evicted image work', async () => {
  const {STILL_CACHE_LIMIT} = await import('../../src/overviews/doorbell/index.js');
  const images = [];
  const oldImage = globalThis.Image;
  const oldWindow = globalThis.window;
  globalThis.window = {location: {origin: 'http://ha.local', href: 'http://ha.local/'}};
  globalThis.Image = class {
    constructor() {
      images.push(this);
      this.naturalWidth = 0;
    }
    removeAttribute(name) {
      if (name === 'src') this.src = '';
    }
  };
  try {
    const connection = {};
    const make = (camera, owner = connection) => ({
      ...ctx({entity: 'binary_sensor.stills', state: 'off', now: T0}),
      hass: {connection: owner},
      options: {camera},
      attrsOf: () => ({entity_picture: `/api/camera_proxy/${camera}?token=synthetic`})
    });
    for (let i = 0; i < STILL_CACHE_LIMIT; i++) overview.autoShow(make(`camera.test${i}`));
    assert.equal(images.length, STILL_CACHE_LIMIT);
    overview.autoShow(make('camera.test0'));
    assert.equal(images.length, STILL_CACHE_LIMIT);
    overview.autoShow(make('camera.new'));
    assert.ok(images[0].src, 'recent image retained');
    assert.equal(images[1].src, '', 'evicted image stopped');
    assert.equal(images[1].onload, null);
    overview.autoShow(make('camera.test0', {}));
    assert.equal(images.length, STILL_CACHE_LIMIT + 2, 'other connection loads its own image');
  } finally {
    globalThis.Image = oldImage;
    globalThis.window = oldWindow;
  }
});
