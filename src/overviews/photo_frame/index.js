import {dateTimeFormatter} from '../../core/intl.js';
import {defineOverview} from '../../core/define-overview.js';
import {setText} from '../_shared/dom.js';
import strings from './strings.js';
import {listPhotos, normalizeFolder, photoUrl, shuffled, slotAt} from './library.js';

/** Weekday, day and month ("Thursday 15 October") of the display zone's calendar day, in the user's language. */
function dateText(ctx, ms) {
  const p = ctx.localParts(ms);
  return dateTimeFormatter(ctx.lang(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(Date.UTC(p.year, p.month - 1, p.day));
}

/** The face. Two stacked <img> layers (the new photo fades in over the old one); the hooks below fill them. */
function sceneHTML(ctx, mode) {
  const folder = normalizeFolder(ctx.options.folder);
  const note = folder
    ? ctx.t('photo_frame_overview.loading')
    : ctx.t('photo_frame_overview.no_folder');
  const clock =
    mode === 'screensaver' && ctx.options.show_time
      ? `<div class="ov-photo-clock"><p class="ov-photo-time" data-ov="photo-time">${ctx.esc(ctx.timeParts(ctx.now()).text)}</p>` +
        `<p class="ov-photo-date" data-ov="photo-date">${ctx.esc(dateText(ctx, ctx.now()))}</p></div>`
      : '';
  return (
    `<div class="ov-scene ov-photo_frame-scene" data-mode="${mode}">` +
    `<div class="ov-photo-frame" data-layer="a" data-state="${folder ? 'loading' : 'empty'}">` +
    `<img class="ov-photo-img ov-photo-a" data-img="a" alt="" decoding="async" draggable="false">` +
    `<img class="ov-photo-img ov-photo-b" data-img="b" alt="" decoding="async" draggable="false">` +
    `${mode === 'screensaver' ? '<div class="ov-photo-scrim"></div>' : '<i class="ov-photo-rim"></i>'}<p class="ov-photo-note">${ctx.esc(note)}</p>${clock}` +
    `</div></div>`
  );
}

const setNote = (ctx, text, state) => {
  const frame = ctx.el?.querySelector('.ov-photo-frame');
  if (!frame) return;
  frame.dataset.state = state;
  setText(frame, '.ov-photo-note', text);
};

/** Show `url` on the hidden layer; swap layers once it has loaded (the fade is CSS). */
function show(ctx, url, token) {
  const frame = ctx.el?.querySelector('.ov-photo-frame');
  if (!frame) return;
  const next = frame.dataset.layer === 'a' ? 'b' : 'a';
  const img = frame.querySelector(`[data-img="${next}"]`);
  img.onload = () => {
    if (ctx.store.get('token') !== token || !frame.isConnected) return;
    frame.dataset.layer = next;
    frame.dataset.state = 'ready';
  };
  img.onerror = () => {
    if (ctx.store.get('token') === token)
      setNote(ctx, ctx.t('photo_frame_overview.unavailable'), 'error');
  };
  img.src = url;
}

/**
 * Idempotent: called after a card-mode render and on every tick. The wall clock decides which photo is due, so the
 * only work on a tick is one division until the interval has passed.
 */
function advance(ctx) {
  const {el, store, hass, options} = ctx;
  if (!el || typeof hass?.callWS !== 'function') return;
  const folder = normalizeFolder(options.folder);
  if (!folder) return;
  if (store.get('folder') !== folder || store.get('recursive') !== options.recursive) {
    store.clear();
    store.set('folder', folder);
    store.set('recursive', options.recursive);
  }
  const photos = store.get('photos');
  if (!photos) {
    if (store.get('loading') || ctx.now() < (store.get('retryAt') || 0)) return;
    store.set('loading', true);
    listPhotos(hass, folder, {recursive: options.recursive, now: ctx.now()}).then(
      (list) => {
        store.set('loading', false);
        if (!list.length) return setNote(ctx, ctx.t('photo_frame_overview.empty'), 'empty');
        store.set('photos', options.shuffle ? shuffled(list, folder) : list);
        advance(ctx);
      },
      () => {
        store.set('loading', false);
        setNote(ctx, ctx.t('photo_frame_overview.unavailable'), 'error');
        // retry on a later tick, not in a tight loop
        store.set('retryAt', ctx.now() + 30000);
      }
    );
    return;
  }
  const slot = slotAt(ctx.now(), options.interval);
  if (store.get('slot') === slot) return;
  store.set('slot', slot);
  const token = {};
  store.set('token', token);
  photoUrl(hass, photos[slot % photos.length], {now: ctx.now()}).then(
    (url) => store.get('token') === token && show(ctx, url, token),
    () =>
      store.get('token') === token &&
      setNote(ctx, ctx.t('photo_frame_overview.unavailable'), 'error')
  );
}

export default defineOverview({
  type: 'photo_frame',
  label: 'Photo frame',
  order: 40,
  entity: 'none',
  domains: [],
  strings,

  options: {
    folder: {type: 'text', default: ''},
    interval: {type: 'number', default: 60, min: 5, max: 86400, step: 5},
    shuffle: {type: 'boolean', default: true},
    recursive: {type: 'boolean', default: false},
    show_time: {type: 'boolean', default: true}
  },

  render: (ctx) => sceneHTML(ctx, ctx.mode),

  // The photo rotates on the wall clock; the time (screensaver) changes with the minute.
  afterRender: (ctx) => advance(ctx),
  tick: {
    every: 1000,
    run(ctx) {
      advance(ctx);
      if (ctx.mode === 'screensaver' && ctx.options.show_time) {
        setText(ctx.el, '[data-ov="photo-time"]', ctx.timeParts(ctx.now()).text);
        setText(ctx.el, '[data-ov="photo-date"]', dateText(ctx, ctx.now()));
      }
    }
  },

  // The card is a photo; a tap opens the full-screen view (with the time), like the screensaver.
  tap: {card: 'open'}
});
