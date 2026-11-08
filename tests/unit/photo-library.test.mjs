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
  await assert.rejects(photoUrl(make(undefined), {id: 'missing'}, {now: 0}));
  await assert.rejects(photoUrl(make(''), {id: 'empty'}, {now: 0}));
  await assert.rejects(
    photoUrl(
      {...make(undefined), hassUrl: (path) => `http://ha.local/${path}`},
      {id: 'base'},
      {now: 0}
    )
  );
});

test('photo caches share only within a connection and protect cached lists from mutation', async () => {
  resetPhotoCache();
  let calls = 0;
  const callWS = async () => {
    calls++;
    return {children: [{title: 'a.jpg', media_class: 'image', media_content_id: 'a'}]};
  };
  const connection = {};
  const first = listPhotos({connection, callWS}, 'Photos', {now: 0});
  assert.equal(listPhotos({connection, callWS}, 'Photos', {now: 1}), first);
  const photos = await first;
  assert.throws(() => photos.push({id: 'other'}), TypeError);
  assert.throws(() => {
    photos[0].id = 'other';
  }, TypeError);
  await listPhotos({connection: {}, callWS}, 'Photos', {now: 1});
  assert.equal(calls, 2);
  const resolve = async () => ({url: `/media/photo-${++calls}.jpg`});
  const a = await photoUrl({connection, callWS: resolve}, {id: 'a'}, {now: 0});
  assert.equal(await photoUrl({connection, callWS: resolve}, {id: 'a'}, {now: 1}), a);
  assert.notEqual(await photoUrl({connection: {}, callWS: resolve}, {id: 'a'}, {now: 1}), a);
});

test('folder and signed URL caches evict the least recently used entry and expire on read', async () => {
  const {FOLDER_CACHE_LIMIT, URL_CACHE_LIMIT, LIST_TTL_MS, URL_EXPIRES_S} =
    await import('../../src/overviews/photo_frame/library.js');
  for (const [limit, request, expire] of [
    [FOLDER_CACHE_LIMIT, (h, id, now) => listPhotos(h, id, {now}), LIST_TTL_MS],
    [URL_CACHE_LIMIT, (h, id, now) => photoUrl(h, {id}, {now}), URL_EXPIRES_S * 1000]
  ]) {
    let calls = 0;
    const hass = {
      connection: {},
      callWS: async () => {
        calls++;
        return {children: [], url: '/media/a.jpg'};
      }
    };
    for (let i = 0; i < limit; i++) await request(hass, String(i), 0);
    await request(hass, '0', 1);
    await request(hass, 'new', 1);
    assert.equal(calls, limit + 1);
    await request(hass, '0', 2);
    assert.equal(calls, limit + 1, 'recent entry survives');
    await request(hass, '1', 2);
    assert.equal(calls, limit + 2, 'oldest entry is fetched again');
    await request(hass, '0', expire);
    assert.equal(calls, limit + 3, 'expired entry is fetched again');
  }
});

test('a stale rejected request cannot remove its replacement', async () => {
  const {LIST_TTL_MS} = await import('../../src/overviews/photo_frame/library.js');
  let rejectFirst;
  let calls = 0;
  const hass = {
    connection: {},
    callWS: () => {
      calls++;
      return calls === 1
        ? new Promise((_, reject) => {
            rejectFirst = reject;
          })
        : Promise.resolve({children: []});
    }
  };
  const old = listPhotos(hass, 'Photos', {now: 0});
  const replacement = listPhotos(hass, 'Photos', {now: LIST_TTL_MS});
  rejectFirst(Error('Old request failed'));
  await assert.rejects(old);
  await replacement;
  assert.equal(listPhotos(hass, 'Photos', {now: LIST_TTL_MS + 1}), replacement);
  assert.equal(calls, 2);
});
