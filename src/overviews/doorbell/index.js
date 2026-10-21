import {defineOverview} from '../../core/define-overview.js';
import {cameraUrl} from '../../core/media-url.js';
import {setText} from '../_shared/dom.js';
import strings from './strings.js';

const DOMAINS = ['binary_sensor', 'event', 'button', 'input_button', 'input_boolean'];
/** A press recorded as a timestamp state (event, button) may be this far ahead of our clock. */
const SKEW_MS = 5000;
const RETRY_MS = 10000;
/** A fresh still while the dashboard is open, so a ring has a picture before the stream starts. */
const STILL_MS = 3000;

const domainOf = (id) => String(id).split('.')[0];
const levelDomain = (id) => {
  const domain = domainOf(id);
  return domain === 'binary_sensor' || domain === 'input_boolean';
};

/**
 * Rising edge of a binary sensor or input boolean, keyed by entity. Those states fall back to off after a short
 * pulse (an occupancy doorbell is Detected for about a second), and `last_changed` then points at the clear, not
 * the press. The press time has to be remembered or the camera would close with the pulse.
 */
const presses = new Map();
/** camera id -> {img, href}. The decoded still is kept off-screen and reused when the overlay opens. */
const stills = new Map();

/** The camera proxy URL, or null when it is missing or not from this Home Assistant. */
function proxyUrl(picture, hass) {
  return cameraUrl(picture, hass);
}

/** A still that changes every few seconds. The bucket is part of the URL so the browser refetches. */
function stillUrl(picture, hass, now) {
  const url = proxyUrl(picture, hass);
  if (!url) return null;
  url.searchParams.set('hv_refresh', String(Math.floor(now / STILL_MS)));
  return url;
}

/** The MJPEG stream for the same camera. */
function liveUrl(picture, hass) {
  const url = proxyUrl(picture, hass);
  if (!url) return null;
  url.pathname = url.pathname.replace('/camera_proxy/', '/camera_proxy_stream/');
  return url;
}

/** Keep one decoded still for this camera. A newer still loads beside it, so the shown frame is never cleared. */
function warmStill(ctx) {
  if (typeof Image !== 'function') return null;
  const camera = ctx.options?.camera;
  if (!camera) return null;
  const url = stillUrl(ctx.attrsOf(camera).entity_picture, ctx.hass, ctx.now());
  if (!url) return null;
  let entry = stills.get(camera);
  if (!entry) {
    entry = {img: new Image(), href: '', next: null, nextHref: ''};
    entry.img.decoding = 'async';
    entry.img.alt = '';
    stills.set(camera, entry);
  }
  if (entry.href === url.href || entry.nextHref === url.href) return entry;
  // The decoded frame stays put. The next one replaces it only after it has loaded.
  if (entry.img.naturalWidth && entry.href) {
    const next = entry.next || new Image();
    entry.next = next;
    entry.nextHref = url.href;
    next.onload = () => {
      if (entry.nextHref !== url.href) return;
      entry.img = next;
      entry.href = url.href;
      entry.next = null;
      entry.nextHref = '';
    };
    next.src = url.href;
    return entry;
  }
  entry.href = url.href;
  entry.img.src = url.href;
  return entry;
}

const windowOf = (ctx) => (Number(ctx.options.duration) || 30) * 1000;

/** Milliseconds since the press, or null when this state is not a press. */
function pressAge(ctx) {
  const state = ctx.state?.state;
  if (!state || state === 'unavailable' || state === 'unknown') return null;
  if (!levelDomain(ctx.entityId)) {
    const since = Date.parse(state);
    return Number.isNaN(since) ? null : ctx.now() - since;
  }
  const changed = Date.parse(ctx.state.last_changed);
  if (state === 'on') {
    if (!Number.isNaN(changed)) presses.set(ctx.entityId, changed);
    else return 0; // on, but no timestamp: still a press
  }
  const since = presses.get(ctx.entityId);
  if (since == null) return null;
  return ctx.now() - since;
}

/** The camera stays up from the press until `duration` elapses, including after the sensor has turned off. */
function held(ctx) {
  const age = pressAge(ctx);
  return age != null && age >= -SKEW_MS && age < windowOf(ctx);
}

/**
 * Arm the overlay on a new press. A binary sensor or input boolean arms only while it is on, so the clear after a
 * pulse is a false -> true edge for the next press. The hold itself is `held`: that is what keeps the camera up.
 */
function ringing(ctx) {
  warmStill(ctx);
  const state = ctx.state?.state;
  if (!state || state === 'unavailable' || state === 'unknown') return false;
  if (levelDomain(ctx.entityId)) return state === 'on' && held(ctx);
  return held(ctx);
}

function sceneHTML(ctx, mode) {
  const name = ctx.options.name || ctx.attrsOf(ctx.options.camera).friendly_name || ctx.rawName;
  const note = ctx.options.camera
    ? ctx.t('doorbell_overview.loading')
    : ctx.t('doorbell_overview.no_camera');
  const hint = mode === 'screensaver' ? ctx.t('doorbell_overview.tap_to_close') : '';
  return (
    `<div class="ov-scene ov-doorbell-scene" data-mode="${mode}" data-state="${ctx.options.camera ? 'loading' : 'empty'}">` +
    `<img class="ov-doorbell-still" alt="" decoding="async" draggable="false">` +
    `<img class="ov-doorbell-stream" alt="" decoding="async" draggable="false">` +
    `<p class="ov-doorbell-note">${ctx.esc(note)}</p>` +
    `<div class="ov-doorbell-bar"><strong class="ov-doorbell-name">${ctx.esc(name)}</strong>` +
    `<span class="ov-doorbell-hint">${ctx.esc(hint)}</span></div></div>`
  );
}

/**
 * Show a still immediately, then the stream over it. A still that was already decoded (the dashboard keeps one
 * warm) is on screen before this request returns. The stream is started in parallel and covers the still once a
 * frame is actually loaded. Idempotent: the token in the URL rotates, the path does not.
 */
function connect(ctx) {
  const warm = warmStill(ctx);
  const scene = ctx.el?.querySelector('.ov-doorbell-scene');
  const still = scene?.querySelector('.ov-doorbell-still');
  const stream = scene?.querySelector('.ov-doorbell-stream');
  const camera = ctx.options.camera;
  if (!still || !stream || !camera) return;
  const picture = ctx.attrsOf(camera).entity_picture;
  const snap = stillUrl(picture, ctx.hass, ctx.now());
  const live = liveUrl(picture, ctx.hass);
  if (!snap || !live) {
    scene.dataset.state = 'error';
    setText(scene, '.ov-doorbell-note', ctx.t('doorbell_overview.unavailable'));
    return;
  }
  const showStill = () => {
    if (scene.dataset.state !== 'live') scene.dataset.state = 'still';
  };
  if (!still.dataset.bound) {
    still.dataset.bound = '1';
    still.onload = () => showStill();
    still.onerror = () => {
      if (scene.dataset.state === 'loading') {
        scene.dataset.state = 'error';
        setText(scene, '.ov-doorbell-note', ctx.t('doorbell_overview.unavailable'));
      }
    };
    stream.onload = () => {
      scene.dataset.state = 'live';
    };
    stream.onerror = () => {
      stream.dataset.retryAt = String(ctx.now() + RETRY_MS);
    };
  }
  if (warm?.img.naturalWidth && still.src !== warm.href) {
    still.dataset.path = new URL(warm.href).pathname;
    still.src = warm.href;
    showStill();
  } else if (still.src !== snap.href) {
    still.dataset.path = snap.pathname;
    still.src = snap.href;
  }
  const failed = Number(stream.dataset.retryAt || 0);
  if (stream.dataset.path === live.pathname && (!failed || ctx.now() < failed)) return;
  stream.dataset.path = live.pathname;
  delete stream.dataset.retryAt;
  stream.src = live.href;
}

export default defineOverview({
  type: 'doorbell',
  label: 'Doorbell camera',
  order: 140,
  entity: 'required',
  // Extra functionality, configured by the card's `doorbell` option: not offered in the screensaver list.
  selectable: false,
  domains: DOMAINS,
  strings,

  // An event overview: it comes up by itself when the doorbell rings and goes after `duration` seconds.
  activation: 'event',
  // Always shows: it closes the camera grid, menus and the like instead of waiting for them.
  interrupt: true,
  autoShow: ringing,
  autoWake: (ctx) => !held(ctx),

  options: {
    camera: {type: 'entity', domains: ['camera']},
    duration: {type: 'number', default: 30, min: 5, max: 600, step: 5}
  },
  watch: (options) => (options.camera ? [options.camera] : []),

  render: (ctx) => sceneHTML(ctx, ctx.mode),

  afterRender: connect,
  tick: {every: 1000, run: connect},

  tap: {card: 'open'}
});
