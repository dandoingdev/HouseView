import {defineOverview} from '../../core/define-overview.js';
import {cameraUrl} from '../../core/media-url.js';
import {setText} from '../_shared/dom.js';
import strings from './strings.js';

const DOMAINS = ['binary_sensor', 'event', 'button', 'input_button', 'input_boolean'];
/** A press recorded as a timestamp state (event, button) may be this far ahead of our clock. */
const SKEW_MS = 5000;
const RETRY_MS = 10000;

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
    `<img class="ov-doorbell-img" alt="" decoding="async" draggable="false">` +
    `<p class="ov-doorbell-note">${ctx.esc(note)}</p>` +
    `<div class="ov-doorbell-bar"><strong class="ov-doorbell-name">${ctx.esc(name)}</strong>` +
    `<span class="ov-doorbell-hint">${ctx.esc(hint)}</span></div></div>`
  );
}

/** Point the picture at the camera's stream. Idempotent: the token in the URL rotates, the path does not. */
function connect(ctx) {
  const scene = ctx.el?.querySelector('.ov-doorbell-scene');
  const img = scene?.querySelector('.ov-doorbell-img');
  const camera = ctx.options.camera;
  if (!img || !camera) return;
  const picture = ctx.attrsOf(camera).entity_picture;
  const url = cameraUrl(picture, ctx.hass);
  if (!url) {
    scene.dataset.state = 'error';
    setText(scene, '.ov-doorbell-note', ctx.t('doorbell_overview.unavailable'));
    return;
  }
  url.pathname = url.pathname.replace('/camera_proxy/', '/camera_proxy_stream/');
  const failed = Number(img.dataset.retryAt || 0);
  if (img.dataset.path === url.pathname && (!failed || ctx.now() < failed)) return;
  img.dataset.path = url.pathname;
  delete img.dataset.retryAt;
  img.onload = () => {
    scene.dataset.state = 'ready';
  };
  img.onerror = () => {
    img.dataset.retryAt = String(ctx.now() + RETRY_MS);
    scene.dataset.state = 'error';
    setText(scene, '.ov-doorbell-note', ctx.t('doorbell_overview.unavailable'));
  };
  img.src = url.href;
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
