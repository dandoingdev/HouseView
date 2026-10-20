import {defineOverview} from '../../core/define-overview.js';
import {cameraUrl} from '../../core/media-url.js';
import {setText} from '../_shared/dom.js';
import strings from './strings.js';

const DOMAINS = ['binary_sensor', 'event', 'button', 'input_button', 'input_boolean'];
/** A press recorded as a timestamp state (event, button) may be this far ahead of our clock. */
const SKEW_MS = 5000;
const RETRY_MS = 10000;

const domainOf = (id) => String(id).split('.')[0];

/**
 * Is the doorbell ringing now: pressed within `duration` seconds. `event`, `button` and `input_button` entities
 * keep the time of the last press as their state; a `binary_sensor` or `input_boolean` rings while it is on.
 */
function ringing(ctx) {
  const state = ctx.state?.state;
  if (!state || state === 'unavailable' || state === 'unknown') return false;
  const window = (Number(ctx.options.duration) || 30) * 1000;
  const domain = domainOf(ctx.entityId);
  const since =
    domain === 'binary_sensor' || domain === 'input_boolean'
      ? state === 'on'
        ? Date.parse(ctx.state.last_changed)
        : null
      : Date.parse(state);
  if (since === null) return false;
  if (Number.isNaN(since)) return domain === 'binary_sensor' || domain === 'input_boolean';
  const age = ctx.now() - since;
  return age >= -SKEW_MS && age < window;
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
  autoWake: (ctx) => !ringing(ctx),

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
