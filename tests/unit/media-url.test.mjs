// Which image URLs a tile may load.
import {afterEach, beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {installWindow} from '../fixtures/node-env.mjs';
import {allowedOrigins, cameraUrl, mediaArtUrl, sameOriginUrl} from '../../src/core/media-url.js';

const ORIGIN = 'http://127.0.0.1:8123';
let restore;
beforeEach(() => {
  restore = installWindow(ORIGIN);
});
afterEach(() => restore());

const hassWith = (base) => ({hassUrl: (path = '') => new URL(path, base).href});

describe('sameOriginUrl', () => {
  it('accepts relative paths and absolute URLs of the page origin', () => {
    assert.equal(sameOriginUrl('/api/x?a=1').href, `${ORIGIN}/api/x?a=1`);
    assert.equal(sameOriginUrl(`${ORIGIN}/api/x`).href, `${ORIGIN}/api/x`);
  });

  it('rejects another origin, scheme, port or host', () => {
    for (const src of [
      'http://evil.example/api/x',
      'https://127.0.0.1:8123/api/x',
      'http://127.0.0.1:9999/api/x',
      'http://localhost:8123/api/x',
      '//evil.example/x',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA'
    ]) {
      assert.equal(sameOriginUrl(src), null, src);
    }
  });

  it('rejects missing and non-string input', () => {
    for (const src of [undefined, null, '', 5, {}])
      assert.equal(sameOriginUrl(src), null, String(src));
  });

  it('also accepts the origin of hass.hassUrl("/") (the configured base URL)', () => {
    const hass = hassWith('https://ha.example.net:8443');
    assert.equal(
      sameOriginUrl('https://ha.example.net:8443/api/camera_proxy/camera.a', hass).origin,
      'https://ha.example.net:8443'
    );
    assert.equal(sameOriginUrl('https://other.example.net/x', hass), null);
    assert.equal(
      sameOriginUrl('/api/x', hass).origin,
      ORIGIN,
      'relative paths still resolve to the page origin'
    );
  });

  it('a broken hassUrl adds nothing and does not throw', () => {
    const broken = {
      hassUrl: () => {
        throw new Error('no base url');
      }
    };
    assert.equal(sameOriginUrl(`${ORIGIN}/ok`, broken).href, `${ORIGIN}/ok`);
    assert.deepEqual([...allowedOrigins({hassUrl: () => 'not a url'})], [ORIGIN]);
  });

  it('works without a window (only absolute URLs can resolve)', () => {
    restore();
    assert.equal(sameOriginUrl('/api/x'), null);
    assert.equal(
      sameOriginUrl('http://a.example/x', hassWith('http://a.example')).origin,
      'http://a.example'
    );
    restore = installWindow(ORIGIN);
  });
});

describe('cameraUrl', () => {
  it('needs a /camera_proxy/ path (also /camera_proxy_stream/ does not count)', () => {
    assert.ok(cameraUrl('/api/camera_proxy/camera.a?token=abc'));
    assert.ok(cameraUrl('/some/prefix/camera_proxy/camera.a'));
    assert.equal(cameraUrl('/api/camera_proxy_stream/camera.a'), null);
    assert.equal(cameraUrl('/local/photo.jpg'), null);
    assert.equal(cameraUrl('http://evil.example/api/camera_proxy/camera.a'), null);
  });
});

describe('mediaArtUrl', () => {
  it('needs the media_player_proxy prefix at the start of the path', () => {
    assert.ok(mediaArtUrl('/api/media_player_proxy/media_player.a?token=1'));
    assert.equal(mediaArtUrl('/x/api/media_player_proxy/media_player.a'), null);
    assert.equal(mediaArtUrl('/api/image/serve/abc'), null);
    assert.equal(mediaArtUrl('http://evil.example/api/media_player_proxy/a'), null);
    assert.equal(mediaArtUrl(undefined), null);
  });

  it('accepts the hassUrl origin', () => {
    const hass = hassWith('https://ha.example.net');
    assert.ok(mediaArtUrl('https://ha.example.net/api/media_player_proxy/a', hass));
  });
});
