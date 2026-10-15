// The camera widget's snapshot picture. Ported from HouseViewCard._camera and the camera branch of
// houseview-widget-card.update.
//
// Home Assistant serves a camera still at `entity_picture` (`/api/camera_proxy/<entity>?token=...`). The token
// stays valid for a while, so the card re-requests the same URL with a `hv_refresh` bucket that changes every
// 30 s: the browser never shows a stale frame and never hammers the camera.
import {cameraUrl} from '../../core/media-url.js';

/** A new snapshot is requested when the 30 s bucket changes. */
export const SNAPSHOT_BUCKET_MS = 30000;

const statusOf = (tile) => tile.querySelector('.camera-status');

/** The same-origin `/camera_proxy/` URL of the current snapshot, with the refresh bucket, or null. */
export function snapshotUrl(ctx) {
  const picture = ctx.attrs.entity_picture;
  if (!ctx.ok || !picture) return null;
  const url = cameraUrl(picture, ctx.hass);
  if (!url) return null;
  url.searchParams.set('hv_refresh', String(Math.floor(Date.now() / SNAPSHOT_BUCKET_MS)));
  return url;
}

/** Create the tile's `<img>` once; it then stays in the tile across renders (see patchCameraTile). */
function ensureImage(ctx, tile) {
  let img = tile.querySelector('img');
  if (img) return img;
  img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async'; // a big JPEG decodes off the main thread
  img.onload = () => {
    tile.classList.add('has-image');
    statusOf(tile).textContent = '';
  };
  img.onerror = () => {
    tile.classList.remove('has-image');
    statusOf(tile).textContent = ctx.t('camera.snapshot_unavailable');
  };
  tile.prepend(img);
  return img;
}

/**
 * afterRender and 30 s tick: point the tile's `<img>` at the current snapshot. An unavailable camera, a missing
 * picture or a foreign origin leaves the tile as it is.
 */
export function refreshSnapshot(ctx) {
  const tile = ctx.el;
  if (!tile) return;
  const url = snapshotUrl(ctx);
  if (!url) return;
  const img = ensureImage(ctx, tile);
  if (img.src === url.href) return;
  if (!tile.classList.contains('has-image')) {
    statusOf(tile).textContent = ctx.t('camera.loading_snapshot');
  }
  img.src = url.href;
}

/**
 * `patch` hook (with `alwaysPatch`): update the embedded camera widget in place WITHOUT morphing its markup, because
 * the generic morph would remove the `<img>` the snapshot refresh added. Only the pieces that can change are
 * touched: disabled state, label, and the "no picture" fallback.
 * @returns {true} always handled
 */
export function patchCameraTile(ctx, tile) {
  const hasGallery = !!ctx.config.camera_gallery?.length;
  tile.disabled = ctx.isPending(ctx.entityId) || (!ctx.ok && !hasGallery);
  const label = tile.querySelector('.camera-label');
  if (label) label.textContent = ctx.rawName;
  if (!ctx.ok || !ctx.attrs.entity_picture) {
    tile.querySelector('img')?.remove();
    tile.classList.remove('has-image');
    const status = statusOf(tile);
    if (status) status.textContent = ctx.t('camera.snapshot_unavailable');
  }
  return true;
}
