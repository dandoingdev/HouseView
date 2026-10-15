// The cover art overview in plain Node: the model, the markup, eligible and autoWake (no DOM, no browser).
import {afterEach, beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {installWindow} from '../fixtures/node-env.mjs';
import coverArt from '../../src/overviews/cover_art/index.js';
import {ART, ART_NEXT, variants} from '../../src/overviews/cover_art/fixtures.js';
import {artworkOf, coverModel, isLive, lineOf} from '../../src/overviews/cover_art/model.js';
import {contextFor} from '../../src/core/define-overview.js';
import {registerStrings} from '../../src/core/i18n.js';
import strings from '../../src/overviews/cover_art/strings.js';

registerStrings(strings);

const ORIGIN = 'http://127.0.0.1:8123';
let restore;
beforeEach(() => {
  restore = installWindow(ORIGIN);
});
afterEach(() => restore());

const ctxOf = (variant, mode = 'screensaver') =>
  contextFor(coverArt, {
    hass: {states: structuredClone(variant.states)},
    config: {},
    raw: variant.options,
    mode
  });
const modelOf = (name) => {
  const ctx = ctxOf(variants[name]);
  return coverModel({state: ctx.state, attrs: ctx.attrs, hass: ctx.hass, name: ctx.rawName});
};
const sceneOf = (name, mode = 'screensaver') => coverArt.render(ctxOf(variants[name], mode), mode);
const textOf = (html, cls) => new RegExp(`class="${cls}"[^>]*>([^<]*)<`).exec(html)?.[1];

describe('the overview definition', () => {
  it('is an idle overview with priority 10 over weather, for media_player entities', () => {
    assert.equal(coverArt.type, 'cover_art');
    assert.equal(coverArt.priority, 10);
    assert.equal(coverArt.activation, 'idle');
    assert.equal(coverArt.entity, 'required');
    assert.deepEqual([...coverArt.domains], ['media_player']);
    assert.equal(coverArt.widget.type, 'cover_art_overview');
  });

  it('has no options: nothing to configure, nothing to validate', () => {
    assert.deepEqual({...coverArt.options}, {});
  });
});

describe('lineOf', () => {
  it('collapses whitespace and accepts strings and finite numbers only', () => {
    assert.equal(lineOf('  Blue   in\n Green '), 'Blue in Green');
    assert.equal(lineOf(1999), '1999');
    for (const bad of [undefined, null, NaN, Infinity, {}, [], true]) assert.equal(lineOf(bad), '');
  });
});

describe('artworkOf: the same-origin rule', () => {
  it('accepts the proxy path as a relative or absolute URL of the page origin and returns the href', () => {
    assert.equal(artworkOf({entity_picture: ART}, {}), `${ORIGIN}${ART}`);
    assert.equal(
      artworkOf({entity_picture: `${ORIGIN}/api/media_player_proxy/media_player.x?token=1`}, {}),
      `${ORIGIN}/api/media_player_proxy/media_player.x?token=1`
    );
  });

  it('accepts the origin of hass.hassUrl() too', () => {
    const hass = {hassUrl: (path = '') => new URL(path, 'https://ha.example.org').href};
    assert.equal(
      artworkOf(
        {entity_picture: 'https://ha.example.org/api/media_player_proxy/media_player.x?t=1'},
        hass
      ),
      'https://ha.example.org/api/media_player_proxy/media_player.x?t=1'
    );
  });

  it('rejects a foreign origin, another scheme or port, protocol-relative, data and javascript URLs', () => {
    for (const src of [
      'https://images.example.com/cover.jpg',
      'http://evil.example/api/media_player_proxy/media_player.x',
      'https://127.0.0.1:8123/api/media_player_proxy/media_player.x',
      'http://127.0.0.1:9999/api/media_player_proxy/media_player.x',
      '//evil.example/api/media_player_proxy/media_player.x',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)'
    ]) {
      assert.equal(artworkOf({entity_picture: src}, {}), null, src);
    }
  });

  it('rejects the own origin outside the media proxy path', () => {
    assert.equal(artworkOf({entity_picture: '/local/cover.jpg'}, {}), null);
    assert.equal(artworkOf({entity_picture: '/api/camera_proxy/camera.x'}, {}), null);
  });

  it('falls back to entity_picture_local when entity_picture names a foreign picture', () => {
    assert.equal(
      artworkOf(
        {entity_picture: 'https://images.example.com/c.jpg', entity_picture_local: ART},
        {}
      ),
      `${ORIGIN}${ART}`
    );
    assert.equal(
      artworkOf(
        {
          entity_picture: 'https://a.example/c.jpg',
          entity_picture_local: 'https://b.example/c.jpg'
        },
        {}
      ),
      null
    );
  });

  it('is null without attributes or pictures', () => {
    assert.equal(artworkOf(undefined, {}), null);
    assert.equal(artworkOf({}, {}), null);
    assert.equal(artworkOf({entity_picture: ''}, {}), null);
  });
});

describe('coverModel', () => {
  it('playing with art: the track, the artist and the artwork', () => {
    assert.deepEqual(modelOf('ok'), {
      status: 'playing',
      title: 'Questions',
      artist: 'Maisie Peters',
      art: `${ORIGIN}${ART}`
    });
  });

  it('paused and buffering keep the same content', () => {
    assert.equal(modelOf('paused').status, 'paused');
    assert.equal(modelOf('paused').title, 'Questions');
    assert.equal(modelOf('buffering').status, 'buffering');
    assert.equal(modelOf('buffering').art, `${ORIGIN}${ART}`);
  });

  it('idle, off, standby and on are "idle": no content', () => {
    for (const state of ['idle', 'off', 'standby', 'on']) {
      const model = coverModel({
        state: {state, attributes: {media_title: 'x', entity_picture: ART}},
        attrs: {media_title: 'x', entity_picture: ART}
      });
      assert.deepEqual(model, {status: 'idle', title: '', artist: '', art: null}, state);
    }
  });

  it('missing, unavailable and unknown are "unavailable"', () => {
    for (const state of [undefined, {state: 'unavailable'}, {state: 'unknown'}, {state: ''}]) {
      assert.equal(coverModel({state}).status, 'unavailable');
    }
    assert.equal(modelOf('unavailable').status, 'unavailable');
    assert.equal(modelOf('missing').status, 'unavailable');
  });

  it('a foreign picture is no artwork', () => {
    assert.equal(modelOf('foreignArt').art, null);
    assert.equal(modelOf('foreignArt').status, 'playing');
    assert.equal(modelOf('noArt').art, null);
  });

  it('the artist falls back to album_artist and then series title; the title to the channel', () => {
    const model = (attrs) => coverModel({state: {state: 'playing'}, attrs});
    assert.equal(model({media_artist: 'A', media_album_artist: 'B'}).artist, 'A');
    assert.equal(model({media_album_artist: 'B'}).artist, 'B');
    assert.equal(model({media_series_title: 'Show'}).artist, 'Show');
    assert.equal(model({media_channel: 'Radio 4'}).title, 'Radio 4');
    assert.equal(model({media_title: 'T', media_channel: 'Radio 4'}).title, 'T');
  });

  it('a player with no metadata names itself; one with only an artist leaves the title empty', () => {
    assert.equal(
      coverModel({state: {state: 'playing'}, attrs: {}, name: 'Living room'}).title,
      'Living room'
    );
    assert.equal(
      coverModel({state: {state: 'playing'}, attrs: {media_artist: 'A'}, name: 'Living room'})
        .title,
      ''
    );
    assert.equal(modelOf('noMetadata').title, 'Living room');
  });

  it('isLive is true for playing, paused and buffering only', () => {
    for (const state of ['playing', 'paused', 'buffering']) assert.equal(isLive({state}), true);
    for (const state of ['idle', 'off', 'on', 'standby', 'unavailable', 'unknown', '']) {
      assert.equal(isLive({state}), false, state);
    }
    assert.equal(isLive(undefined), false);
  });
});

describe('eligible: the screensaver may pick it only while it has something to show', () => {
  const eligible = (name) => coverArt.eligible(ctxOf(variants[name]));

  it('is true for a playing speaker with usable artwork', () => {
    assert.equal(eligible('ok'), true);
    assert.equal(eligible('longTitle'), true);
    assert.equal(eligible('hostile'), true);
    assert.equal(eligible('remoteWithLocal'), true);
  });

  it('is false for paused, buffering, idle, off, unavailable and a missing entity', () => {
    for (const name of ['paused', 'buffering', 'idle', 'off', 'unavailable', 'missing']) {
      assert.equal(eligible(name), false, name);
    }
  });

  it('is false for a playing speaker without usable artwork (none, or a foreign origin)', () => {
    assert.equal(eligible('noArt'), false);
    assert.equal(eligible('foreignArt'), false);
  });

  it('returns a boolean', () => {
    for (const name of Object.keys(variants)) assert.equal(typeof eligible(name), 'boolean', name);
  });
});

describe('autoWake: dismissed when nothing is playing or paused any more', () => {
  const wake = (name) => coverArt.autoWake(ctxOf(variants[name]));

  it('keeps the layer for playing, paused and buffering (the gap between two tracks)', () => {
    for (const name of ['ok', 'paused', 'buffering', 'noArt', 'longTitle']) {
      assert.equal(wake(name), false, name);
    }
  });

  it('dismisses it for idle, off, unavailable, unknown, standby and a missing entity', () => {
    for (const name of ['idle', 'off', 'unavailable', 'missing'])
      assert.equal(wake(name), true, name);
    for (const state of ['standby', 'unknown', 'on']) {
      const variant = {
        options: variants.ok.options,
        states: {'media_player.living_room': {state, attributes: {}}}
      };
      assert.equal(coverArt.autoWake(ctxOf(variant)), true, state);
    }
  });
});

describe('markup', () => {
  it('playing: the picture in a frame, the title and the artist', () => {
    const html = sceneOf('ok');
    assert.match(html, /^<div class="ov-scene ov-cover_art-scene" data-status="playing">/);
    assert.match(
      html,
      /<img class="ov-cover_art-img" src="http:\/\/127\.0\.0\.1:8123\/api\/media_player_proxy\//
    );
    assert.match(html, /alt="" decoding="async"/);
    assert.equal(textOf(html, 'ov-cover_art-title'), 'Questions');
    assert.equal(textOf(html, 'ov-cover_art-artist'), 'Maisie Peters');
    assert.doesNotMatch(html, /ov-cover_art-tile/);
  });

  it('paused renders the same face with its own status', () => {
    const html = sceneOf('paused');
    assert.match(html, /data-status="paused"/);
    assert.equal(textOf(html, 'ov-cover_art-title'), 'Questions');
    assert.match(html, /<img /);
  });

  it('the structure does not change with the track: the same elements, other src and text', () => {
    const shape = (html) => html.replace(/src="[^"]*"/g, 'src=""').replace(/>[^<]+</g, '><');
    const a = coverArt.render(ctxOf(variants.ok), 'screensaver');
    const next = {
      options: variants.ok.options,
      states: {
        'media_player.living_room': {
          state: 'playing',
          attributes: {media_title: 'Another', media_artist: 'Someone', entity_picture: ART_NEXT}
        }
      }
    };
    const b = coverArt.render(ctxOf(next), 'screensaver');
    assert.notEqual(a, b);
    assert.equal(shape(a), shape(b));
    assert.match(b, /cache=91be/);
    assert.equal(textOf(b, 'ov-cover_art-title'), 'Another');
  });

  it('no artwork (none or foreign): a dark tile with the music note, the text stays', () => {
    for (const name of ['noArt', 'foreignArt']) {
      const html = sceneOf(name, 'card');
      assert.doesNotMatch(html, /<img /, name);
      assert.doesNotMatch(html, /images\.example\.com/, name);
      assert.match(
        html,
        /class="ov-cover_art-tile"><ha-icon style="--mdc-icon-size:var\(--ov-ca-note\);margin:0" icon="mdi:music-note"/,
        name
      );
      assert.equal(textOf(html, 'ov-cover_art-title'), 'Questions', name);
    }
  });

  it('card and screensaver mode draw the same face', () => {
    assert.equal(sceneOf('ok', 'card'), sceneOf('ok', 'screensaver'));
  });

  it('nothing playing and unavailable: a calm face with "Nothing playing", no picture', () => {
    for (const name of ['idle', 'off', 'unavailable', 'unknown', 'missing']) {
      const html = sceneOf(name, 'card');
      assert.equal(textOf(html, 'ov-cover_art-empty'), 'Nothing playing', name);
      assert.doesNotMatch(html, /<img |ov-cover_art-frame/, name);
    }
    assert.match(sceneOf('idle'), /data-status="idle"/);
    assert.match(sceneOf('missing'), /data-status="unavailable"/);
  });

  it('hostile text is escaped: no element is created from a title, an artist or a name', () => {
    const html = sceneOf('hostile');
    assert.doesNotMatch(html, /<script|<b[ >]|<img src=x/);
    assert.equal((html.match(/<img /g) ?? []).length, 1, 'only the one <img> the overview writes');
    assert.equal(
      textOf(html, 'ov-cover_art-title'),
      '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot;'
    );
    assert.match(html, /&lt;\/p&gt;&lt;b onclick=&quot;x\(\)&quot;&gt;Mallory&lt;\/b&gt;/);
  });

  it('a hostile entity name is escaped when it stands in for a missing title', () => {
    const variant = {
      options: variants.ok.options,
      states: {
        'media_player.living_room': {
          state: 'playing',
          attributes: {friendly_name: '<svg onload=alert(1)>', entity_picture: ART}
        }
      }
    };
    const html = coverArt.render(ctxOf(variant), 'screensaver');
    assert.doesNotMatch(html, /<svg onload/);
    assert.equal(textOf(html, 'ov-cover_art-title'), '&lt;svg onload=alert(1)&gt;');
  });

  it('a very long title and artist are kept whole in the markup (the clamp is CSS)', () => {
    assert.ok(textOf(sceneOf('longTitle'), 'ov-cover_art-title').endsWith('cannot fit'));
    assert.ok(textOf(sceneOf('longArtist'), 'ov-cover_art-artist').endsWith('The Orchestra'));
  });

  it('is pure: it has no call, no fetch and no timers (the render only reads the context)', () => {
    assert.equal(typeof ctxOf(variants.ok).call, 'undefined');
    assert.equal(sceneOf('ok'), sceneOf('ok'));
  });
});
