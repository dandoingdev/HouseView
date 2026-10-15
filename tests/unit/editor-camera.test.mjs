import test from 'node:test';
import assert from 'node:assert/strict';
import './editor-env.mjs';

const {applySlot, cameraAt, slotData, slotSchema, slotHeadingKey} =
  await import('../../src/editor/camera-forms.js');

const gallery = [
  {entity: 'camera.a', name: 'A', stream: false, slot: 0},
  {entity: 'camera.b', name: 'B', stream: true, slot: 1},
  {entity: 'camera.c', name: '', stream: false, slot: 3}
];

test('slot data: existing camera by slot (or list position), empty defaults otherwise', () => {
  assert.deepEqual(slotData(gallery, 1), {entity: 'camera.b', name: 'B', stream: true, slot: 1});
  assert.deepEqual(slotData(gallery, 2), {entity: '', stream: false});
  assert.deepEqual(slotData(undefined, 0), {entity: '', stream: false});
  // entries without `slot` take their index
  assert.equal(cameraAt([{entity: 'camera.x'}, {entity: 'camera.y'}], 1).entity, 'camera.y');
});

test('slot schema: camera entity picker first, as the browser suite expects', () => {
  const schema = slotSchema();
  assert.deepEqual(
    schema.map((f) => f.name),
    ['entity', 'name', 'stream']
  );
  assert.deepEqual(schema[0].selector.entity.domain, ['camera']);
  assert.equal(slotHeadingKey(2), 'editor.camera_slot.2');
});

test('replacing a camera keeps the other positions and sorts by slot', () => {
  const {gallery: next} = applySlot(gallery, 3, {entity: 'camera.new', name: 'New', stream: true});
  assert.deepEqual(
    next.map((c) => [c.slot, c.entity]),
    [
      [0, 'camera.a'],
      [1, 'camera.b'],
      [3, 'camera.new']
    ]
  );
  assert.deepEqual(next[2], {entity: 'camera.new', name: 'New', stream: true, slot: 3});
});

test('clearing a slot removes only that camera; an empty gallery becomes undefined', () => {
  const {gallery: next} = applySlot(gallery, 0, {entity: ''});
  assert.equal(next.length, 2);
  assert.equal(
    next.some((c) => c.slot === 3),
    true
  );
  assert.equal(applySlot([gallery[0]], 0, {entity: ''}).gallery, undefined);
});

test('adding fills a free slot; entries without slot are numbered by position first', () => {
  const {gallery: next} = applySlot([{entity: 'camera.x'}], 2, {entity: 'camera.y'});
  assert.deepEqual(
    next.map((c) => [c.slot, c.entity]),
    [
      [0, 'camera.x'],
      [2, 'camera.y']
    ]
  );
});

test('rejects non-camera entities and cameras already used in another slot', () => {
  assert.deepEqual(applySlot(gallery, 2, {entity: 'light.x'}), {error: 'select_camera'});
  assert.deepEqual(applySlot(gallery, 2, {entity: 'camera.a'}), {error: 'camera_duplicate'});
  // the slot's own camera is not a duplicate of itself
  assert.equal(
    applySlot(gallery, 0, {entity: 'camera.a', name: 'Renamed'}).gallery[0].name,
    'Renamed'
  );
  // name defaults to '' and stream to false
  const {gallery: next} = applySlot(undefined, 1, {entity: 'camera.z'});
  assert.deepEqual(next, [{entity: 'camera.z', name: '', stream: false, slot: 1}]);
});
