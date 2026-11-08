import test from 'node:test';
import assert from 'node:assert/strict';
import photoFrame from '../../src/overviews/photo_frame/index.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
test('stale photo listings cannot replace a newly configured folder or connection', async () => {
  const pending = [];
  const makeHass = () => ({
    connection: {},
    callWS: () => new Promise((resolve, reject) => pending.push({resolve, reject}))
  });
  const frame = {dataset: {}, querySelector: () => null};
  const store = new Map();
  const ctx = {
    hass: makeHass(),
    options: {folder: 'First', shuffle: false},
    el: {querySelector: () => frame},
    store,
    now: () => 1000,
    t: (key) => key
  };
  photoFrame.afterRender(ctx);
  ctx.options = {...ctx.options, folder: 'Second'};
  photoFrame.afterRender(ctx);
  pending[0].resolve({
    children: [{media_class: 'image', media_content_id: 'old', title: 'old.jpg'}]
  });
  await flush();
  assert.equal(store.get('loading'), true);
  assert.equal(store.has('photos'), false);
  ctx.hass = makeHass();
  photoFrame.afterRender(ctx);
  pending[1].reject(Error('Stale connection'));
  await flush();
  assert.equal(store.get('loading'), true);
  assert.equal(store.has('retryAt'), false);
  pending[2].resolve({children: []});
  await flush();
  assert.equal(store.get('loading'), false);
  assert.equal(frame.dataset.state, 'empty');
});
