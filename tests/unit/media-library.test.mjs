import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  browse,
  loadLibrary,
  shownItems,
  mediaKey,
  libraryArtwork
} from '../../src/widgets/media_player/library-data.js';
import {libraryEditor} from '../../src/widgets/media_player/library-editor.js';

const item = (id, title = id) => ({
  title,
  media_content_id: id,
  media_content_type: 'favorite_item_id',
  can_play: true
});
const folder = (id, type = 'favorites_folder') => ({
  media_content_id: id,
  media_content_type: type,
  title: 'Favourites',
  can_expand: true,
  can_play: false
});
test('Sonos nested favourites, dedupe, opaque IDs, no playback and no expanding playable playlists', async () => {
  const reads = [];
  const songs = [item('FV:2/3', 'Evening'), item('FV:4', 'Radio')];
  const hass = {
    callService() {
      assert.fail('No services during browse');
    },
    async callWS(message) {
      reads.push(message);
      return message.media_content_type === 'favorites_folder'
        ? {children: [...songs, {...songs[0], can_expand: true}]}
        : message.media_content_type === 'favorites'
          ? {children: [folder('playlists')]}
          : {children: [folder('', 'favorites')]};
    }
  };
  const result = await loadLibrary(hass, 'media_player.kitchen');
  assert.deepEqual(result.items, songs);
  assert.equal(reads.length, 3);
  assert.ok(
    reads.every(
      (r) => r.entity_id === 'media_player.kitchen' && r.type === 'media_player/browse_media'
    )
  );
  assert.equal(reads[1].media_content_id, '');
});
test('curation is exact, ordered and per-widget; removed entries never become playable', () => {
  const a = item('a'),
    b = item('b');
  const widget = {
    playlist_mode: 'selected',
    playlists: [mediaKey(b), mediaKey(a), mediaKey(b), 'removed']
  };
  const selected = shownItems(widget, [a, b]);
  assert.deepEqual(selected.slice(0, 2), [b, a]);
  assert.equal(selected.length, 3);
  assert.equal(selected[2].can_play, false);
  assert.deepEqual(shownItems({playlist_mode: 'selected', playlists: []}, [a]), []);
  assert.deepEqual(shownItems({}, [a, b]), [a, b]);
});
test('native selector preserves saved missing items and offers draggable ordering', () => {
  const a = item('a');
  const schema = libraryEditor.schema({}, {playlists: ['missing']}, [{name: 'playlist_mode'}], {
    items: [a]
  });
  const select = schema[1].selector.select;
  assert.equal(select.multiple, true);
  assert.equal(select.reorder, true);
  assert.equal(select.options[0].value, mediaKey(a));
  assert.equal(select.options[1].value, 'missing');
});
test('failed discovery reports partial data and does not crawl arbitrary libraries', async () => {
  const hass = {
    callWS: async (m) => {
      if (m.media_content_type) throw Error('offline');
      return {children: [folder('', 'favorites'), folder('all', 'library')]};
    }
  };
  const result = await loadLibrary(hass, 'media_player.test');
  assert.equal(result.partial, true);
  assert.deepEqual(result.items, []);
});
test('closing/cancelling a stalled read rejects promptly and suppresses later folders', async () => {
  const abort = new AbortController();
  let calls = 0;
  const pending = browse(
    {
      callWS: () => {
        calls++;
        return new Promise(() => {});
      }
    },
    'media_player.test',
    undefined,
    abort.signal
  );
  abort.abort();
  await assert.rejects(pending, /Cancelled/);
  assert.equal(calls, 1);
});
test('playlist artwork uses the original provider URL without inventing proxy IDs or authentication', async () => {
  const hass = {
    hassUrl: () => 'https://ha.example/',
    callWS: () => assert.fail('No signed proxy for a Sonos favourite')
  };
  const provider = 'https://covers.example/playlist/FV%3A123.jpg?size=300';
  assert.equal(
    await libraryArtwork(hass, 'media_player.test', {...item('FV:a/b'), thumbnail: provider}),
    provider
  );
  const proxy = '/api/media_player_proxy/media_player.test/browse_media/album/123?token=test';
  assert.equal(
    await libraryArtwork(hass, 'media_player.test', {...item('a'), thumbnail: proxy}),
    'https://ha.example' + proxy
  );
  for (const thumbnail of [
    '',
    undefined,
    'javascript:alert(1)',
    'data:image/svg+xml,foo',
    'file:///tmp/cover.png',
    'https://user:password@example.com/cover.png',
    'https://[invalid'
  ]) {
    assert.equal(await libraryArtwork(hass, 'media_player.test', {...item('a'), thumbnail}), null);
  }
});
