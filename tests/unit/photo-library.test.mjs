import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {location: {origin: 'http://ha.local'}};
const {normalizeFolder, shuffled, slotAt, listPhotos, photoUrl, resetPhotoCache} =
  await import('../../src/overviews/photo_frame/library.js');

test('normalizeFolder accepts the forms people type', () => {
  const want = 'media-source://media_source/local/Photos';
  for (const value of [
    want,
    `${want}/`,
    '/media/Photos',
    'media/Photos',
    'local/Photos',
    'Photos',
    ' Photos '
  ]) {
    assert.equal(normalizeFolder(value), want, value);
  }
  assert.equal(normalizeFolder(''), '');
  assert.equal(normalizeFolder(undefined), '');
});

test('shuffle is deterministic per folder and keeps every photo', () => {
  const list = Array.from({length: 20}, (_, i) => ({id: String(i)}));
  assert.deepEqual(shuffled(list, 'x'), shuffled(list, 'x'));
  assert.notDeepEqual(shuffled(list, 'x'), shuffled(list, 'y'));
  assert.deepEqual(
    shuffled(list, 'x')
      .map((p) => p.id)
      .sort(),
    list.map((p) => p.id).sort()
  );
});

test('the wall clock decides the slot', () => {
  assert.equal(slotAt(0, 60), 0);
  assert.equal(slotAt(59999, 60), 0);
  assert.equal(slotAt(60000, 60), 1);
  assert.equal(slotAt(120000, 0), 120); // a bad interval counts as one second
});

test('listing keeps images, skips other files, recurses only when asked, and caches', async () => {
  resetPhotoCache();
  let calls = 0;
  const hass = {
    callWS: async ({media_content_id: id}) => {
      calls++;
      if (id.endsWith('/Photos'))
        return {
          children: [
            {title: 'b.jpg', media_class: 'image', media_content_id: 'b'},
            {title: 'notes.txt', media_class: 'document', media_content_id: 'n'},
            {title: 'a.png', media_class: 'image', media_content_id: 'a'},
            {
              title: 'Trip',
              media_class: 'directory',
              can_expand: true,
              media_content_id: 'media-source://media_source/local/Photos/Trip'
            }
          ]
        };
      return {children: [{title: 'c.jpg', media_class: 'image', media_content_id: 'c'}]};
    }
  };
  const folder = 'media-source://media_source/local/Photos';
  assert.deepEqual(
    (await listPhotos(hass, folder, {now: 0})).map((p) => p.id),
    ['a', 'b']
  );
  assert.deepEqual(
    (await listPhotos(hass, folder, {now: 1000})).map((p) => p.id),
    ['a', 'b']
  );
  assert.equal(calls, 1, 'cached');
  assert.deepEqual(
    (await listPhotos(hass, folder, {recursive: true, now: 0})).map((p) => p.id),
    ['a', 'b', 'c']
  );
});

test('a photo URL must be served by Home Assistant itself', async () => {
  resetPhotoCache();
  const make = (url) => ({callWS: async () => ({url})});
  assert.equal(
    await photoUrl(make('/media/local/a.jpg?authSig=1'), {id: 'a'}, {now: 0}),
    'http://ha.local/media/local/a.jpg?authSig=1'
  );
  await assert.rejects(photoUrl(make('https://evil.example/a.jpg'), {id: 'b'}, {now: 0}));
});
