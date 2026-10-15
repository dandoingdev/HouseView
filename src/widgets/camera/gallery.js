// The camera gallery: a full-screen overlay with a grid of up to four cameras, a focus view for one of them, and a
// back button. Ported from HouseViewCard._galleryMarkup/_refreshGallery/_stopGallery and the camera-* branches of
// _act . Markup, class names and texts are byte-compatible.
//
// It plugs into the generic extension host (docs/widget-api.md, controller/extensions.js): the host owns
// WHEN things happen (render, tick, keydown, dispose), this file owns WHAT happens. State lives at
// `card._ext.camera` = {open, camera}; the original names `_galleryOpen`, `_galleryCamera` and `_refreshGallery`
// are compat accessors onto it.
import {buttonHTML, esc, iconHTML} from '../../core/html.js';
import {cameraUrl} from '../../core/media-url.js';

/** The gallery refreshes its pictures this often while it is open (the proxy URL carries a 5 s bucket). */
const REFRESH_MS = 5000;
/** A picture that has been loading this long is reported as "Camera not responding". */
const NOT_RESPONDING_MS = 20000;
/** A stream that failed is retried after this long. */
const STREAM_RETRY_MS = 30000;
/** The grid has two columns and two rows. */
const GRID_SLOTS = 4;
const GRID_COLUMNS = 2;

const BACK = '[data-action="camera-back"]';
const GRID_BUTTON = '[data-action="camera-grid"]';

// ---- configuration ------------------------------------------------------------------------------------------------

/** `camera_gallery` must be a list of one to four `{entity: 'camera.x'}` objects. Same message as the original. */
export function validateGalleryConfig(config) {
  const gallery = config.camera_gallery;
  if (!gallery) return;
  if (
    !Array.isArray(gallery) ||
    !gallery.length ||
    gallery.length > GRID_SLOTS ||
    gallery.some((c) => !c || typeof c.entity !== 'string' || !c.entity.startsWith('camera.'))
  ) {
    throw new Error('Camera view needs one to four camera entities.');
  }
}

const galleryOf = (config) => config?.camera_gallery || [];

// ---- markup -------------------------------------------------------------------------------------------------------

/** The cameras to show: configured order, one per entity, only the focused one in the focus view. */
function visibleCameras(config, ext) {
  const unique = [...new Map(galleryOf(config).map((c) => [c.entity, c])).values()];
  return unique.filter((c) => !ext.camera || c.entity === ext.camera);
}

/** The grid cell of a camera: its `slot` when valid (so a gap stays a gap), else its position. */
function cellStyle(camera, index, single) {
  if (single) return '';
  const slot = Number.isInteger(camera.slot) && camera.slot >= 0 && camera.slot < GRID_SLOTS;
  const position = slot ? camera.slot : index;
  const column = (position % GRID_COLUMNS) + 1;
  const row = Math.floor(position / GRID_COLUMNS) + 1;
  return `grid-column:${column};grid-row:${row}`;
}

function cameraTile(ctx, camera, index, single) {
  const friendly = ctx.attrsOf(camera.entity).friendly_name;
  const label = camera.name || friendly || 'camera';
  const title = camera.name || friendly || 'Camera';
  const status = ctx.availableOf(camera.entity)
    ? ctx.t('camera.gallery.loading')
    : ctx.t('state.unavailable');
  return (
    `<button style="${cellStyle(camera, index, single)}" class="gallery-camera" data-action="camera-focus" ` +
    `data-entity="${esc(camera.entity)}" data-camera-entity="${esc(camera.entity)}" ` +
    `aria-label="${esc(ctx.t('camera.gallery.expand', {name: label}))}">` +
    `<span class="gallery-camera-placeholder">${iconHTML('video-outline')}` +
    `<small class="gallery-camera-status">${esc(status)}</small></span>` +
    `<span class="gallery-camera-name">${esc(title)}</span></button>`
  );
}

/** The overlay markup; '' while the gallery is closed. */
export function galleryMarkup(ctx) {
  const ext = ctx.ext;
  if (!ext?.open) return '';
  const cameras = visibleCameras(ctx.config, ext);
  const single = cameras.length === 1;
  const backLabel = ext.camera ? ctx.t('camera.gallery.all') : ctx.t('camera.gallery.back');
  const back = buttonHTML(
    'camera-back',
    '',
    `${iconHTML('chevron-left')}<span>${esc(backLabel)}</span>`,
    'gallery-back',
    true
  );
  const heading = ext.camera
    ? esc(cameras[0]?.name || ctx.t('camera.gallery.camera'))
    : esc(ctx.t('camera.gallery.title'));
  const tiles = cameras.map((camera, index) => cameraTile(ctx, camera, index, single)).join('');
  return (
    `<section class="camera-gallery" role="dialog" aria-modal="true" aria-label="${esc(ctx.t('camera.gallery.label'))}">` +
    `<header>${back}<strong>${heading}</strong></header>` +
    `<div class="camera-gallery-grid ${single ? 'single' : ''}">${tiles}</div></section>`
  );
}

// ---- pictures -----------------------------------------------------------------------------------------------------

/** Create a tile's `<img>` with the load/error bookkeeping the refresh relies on (dataset.pending, retryAt). */
function createImage(tile, status, stream, failedText) {
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async'; // a big JPEG decodes off the main thread
  img.onload = () => {
    img.dataset.pending = 'false';
    tile.classList.add('has-image');
    status.textContent = '';
  };
  img.onerror = () => {
    img.dataset.pending = 'false';
    if (stream) img.dataset.retryAt = String(Date.now() + STREAM_RETRY_MS);
    if (!tile.classList.contains('has-image')) status.textContent = failedText;
  };
  tile.prepend(img);
  return img;
}

/** Point one gallery widget at its camera's picture (or stream) and keep its status text honest. */
function refreshTile(ctx, tile) {
  const id = tile.dataset.cameraEntity;
  const status = tile.querySelector('.gallery-camera-status');
  if (!status) return;
  if (!ctx.availableOf(id)) {
    tile.classList.remove('has-image');
    tile.querySelector('img')?.remove();
    status.textContent = ctx.t('state.unavailable');
    return;
  }
  // The picture must come from this Home Assistant and from the camera proxy (core/media-url.js).
  const url = cameraUrl(ctx.attrsOf(id).entity_picture, ctx.hass);
  if (!url) {
    status.textContent = ctx.t('camera.gallery.image_unavailable');
    return;
  }
  const stream = galleryOf(ctx.config).find((c) => c.entity === id)?.stream === true;
  if (stream) url.pathname = url.pathname.replace('/camera_proxy/', '/camera_proxy_stream/');
  else url.searchParams.set('hv_refresh', String(Math.floor(Date.now() / REFRESH_MS)));

  let img = tile.querySelector('img');
  if (!img) {
    img = createImage(tile, status, stream, ctx.t('camera.gallery.image_unavailable'));
  }
  if (img.naturalWidth > 0) {
    tile.classList.add('has-image');
    status.textContent = '';
  } else if (
    img.dataset.pending === 'true' &&
    Date.now() - Number(img.dataset.started || Date.now()) > NOT_RESPONDING_MS
  ) {
    status.textContent = ctx.t('camera.gallery.not_responding');
  }
  const retry = stream && img.dataset.retryAt && Date.now() >= Number(img.dataset.retryAt);
  if ((img.src !== url.href || retry) && img.dataset.pending !== 'true') {
    delete img.dataset.retryAt;
    img.dataset.pending = 'true';
    img.dataset.started = String(Date.now());
    img.src = url.href;
  }
}

/** Refresh every picture of the open gallery. Also reachable as `card._refreshGallery`. */
export function refreshGallery(ctx) {
  if (!ctx.ext?.open || !ctx.root) return;
  for (const tile of ctx.root.querySelectorAll('[data-camera-entity]')) refreshTile(ctx, tile);
}

/** Stop every gallery picture: detach handlers and drop the `src` so the browser closes the connections. */
export function stopGallery(ctx) {
  if (!ctx.root) return;
  for (const img of ctx.root.querySelectorAll('.camera-gallery img')) {
    img.onload = null;
    img.onerror = null;
    img.removeAttribute('src');
  }
}

// ---- the extension ------------------------------------------------------------------------------------------------

/** Open the gallery's back button for the keyboard and screen readers after a view change. */
function focusBack(ctx) {
  ctx.focus(BACK);
}

const actions = {
  // All three are `immediate`: they work without an entity state and bypass pending/availability, and the
  // dispatcher skips guards for immediate actions, so the original guards live inside `run`.
  'camera-grid': {
    immediate: true,
    run(ctx, id) {
      if (!galleryOf(ctx.config).length) return ctx.info(id);
      if (!ctx.ext) return undefined;
      ctx.ext.open = true;
      ctx.ext.camera = null;
      ctx.render();
      return focusBack(ctx);
    }
  },
  'camera-focus': {
    immediate: true,
    run(ctx, id) {
      if (!ctx.ext?.open || !galleryOf(ctx.config).some((c) => c.entity === id)) return undefined;
      ctx.ext.camera = id;
      ctx.render();
      return focusBack(ctx);
    }
  },
  'camera-back': {
    immediate: true,
    run(ctx) {
      if (!ctx.ext) return undefined;
      // focused camera -> all cameras -> closed
      if (ctx.ext.camera) ctx.ext.camera = null;
      else ctx.ext.open = false;
      ctx.render();
      return ctx.focus(ctx.ext.open ? BACK : GRID_BUTTON);
    }
  }
};

/** The context of the camera extension for a compat accessor (`card._refreshGallery`). */
const extensionContext = (card) => card._extensionContext('camera');

export default {
  configKeys: ['camera_gallery'],
  validateConfig: validateGalleryConfig,
  entities: (config) => galleryOf(config).map((c) => c.entity),
  state: () => ({open: false, camera: null}),
  compat: {
    _galleryOpen: {
      get: (card) => card._ext.camera.open,
      set: (card, v) => (card._ext.camera.open = !!v)
    },
    _galleryCamera: {
      get: (card) => card._ext.camera.camera,
      set: (card, v) => (card._ext.camera.camera = v)
    },
    _refreshGallery: {get: (card) => () => refreshGallery(extensionContext(card))}
  },
  shellClasses: (card) => (card._ext.camera.open ? ['camera-view-open'] : []),
  overlay: galleryMarkup,
  afterRender: refreshGallery,
  tick: {every: REFRESH_MS, when: (ext) => ext.open, run: refreshGallery},
  blocksNavigation: (ext) => !!ext.open,
  // Escape steps back (focused camera -> all cameras -> closed). Other keys fall through to the host, which
  // ignores arrows while navigation is blocked.
  onKeydown(ctx, event) {
    if (!ctx.ext.open || event.key !== 'Escape') return false;
    event.preventDefault();
    ctx.act('camera-back');
    return true;
  },
  dispose: stopGallery,
  actions
};
