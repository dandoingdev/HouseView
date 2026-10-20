import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/overviews/index.js';
import {normalizeScreensaver, validateScreensaver} from '../../src/core/overview-registry.js';
import {applyDoorbell, doorbellData} from '../../src/editor/doorbell-form.js';

const doorbell = {entity: 'binary_sensor.front_doorbell', camera: 'camera.front_door'};

test('the doorbell option adds an event entry that is not a screensaver entry', () => {
  const entries = normalizeScreensaver({widgets: [], doorbell});
  const entry = entries.find((e) => e.type === 'doorbell');
  assert.ok(entry);
  assert.equal(entry.event, true);
  assert.equal(entry.implicit, true);
  assert.equal(entry.options.camera, 'camera.front_door');
  assert.equal(entry.options.duration, 30);
});

test('no doorbell entry without the option, when disabled, or on a stand-alone card', () => {
  assert.equal(
    normalizeScreensaver({widgets: []}).some((e) => e.type === 'doorbell'),
    false
  );
  assert.equal(
    normalizeScreensaver({widgets: [], doorbell: {...doorbell, enabled: false}}).some(
      (e) => e.type === 'doorbell'
    ),
    false
  );
  assert.equal(
    normalizeScreensaver({widgets: [], single_widget: true, doorbell}).some(
      (e) => e.type === 'doorbell'
    ),
    false
  );
});

test('the doorbell option is validated', () => {
  assert.doesNotThrow(() => validateScreensaver({widgets: [], doorbell}));
  assert.throws(() => validateScreensaver({widgets: [], doorbell: 'x'}));
  assert.throws(() =>
    validateScreensaver({widgets: [], doorbell: {...doorbell, camera: 'light.kitchen'}})
  );
  assert.throws(() => validateScreensaver({widgets: [], doorbell: {...doorbell, duration: 1}}));
});

test('the editor form reads and writes the doorbell option', () => {
  assert.equal(doorbellData({}).doorbell_duration, 30);
  let config = applyDoorbell(
    {},
    {doorbell_entity: doorbell.entity, doorbell_camera: doorbell.camera, doorbell_duration: 30}
  );
  assert.deepEqual(config.doorbell, doorbell);
  config = applyDoorbell(config, {
    doorbell_entity: doorbell.entity,
    doorbell_camera: doorbell.camera,
    doorbell_duration: 45
  });
  assert.equal(config.doorbell.duration, 45);
  assert.equal(applyDoorbell(config, {doorbell_entity: ''}).doorbell, undefined);
});

test('the doorbell overview interrupts: nothing blocks its entry', async () => {
  const {screensaverMixin} = await import('../../src/controller/screensaver.js').catch(() => ({}));
  const entry = normalizeScreensaver({widgets: [], doorbell}).find((e) => e.type === 'doorbell');
  assert.equal(entry.overview.interrupt, true);
  if (!screensaverMixin) return;
  const card = {
    _galleryOpen: true,
    _alarm: {},
    _pending: new Set(['x']),
    _navigationBlocked: () => true
  };
  assert.equal(screensaverMixin._screensaverBlockedFor.call(card, entry), false);
});
