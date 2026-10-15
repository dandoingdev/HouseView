// Camera tile: a still picture that refreshes every 30 s; tapping it opens the camera grid (gallery.js) when
// `camera_gallery` is configured, otherwise the more-info dialog. Ported from renderWidget (camera branch),
// _camera and the widget-card camera special case of the original; markup and behaviour are byte-compatible.
import {defineWidget} from '../../core/define-widget.js';
import gallery from './gallery.js';
import {patchCameraTile, refreshSnapshot, SNAPSHOT_BUCKET_MS} from './snapshot.js';

export default defineWidget({
  type: 'camera',
  label: 'Camera',
  order: 40,
  layoutRoles: ['camera'],

  render(ctx) {
    const hasGallery = !!ctx.config.camera_gallery?.length;
    const content =
      `${ctx.icon('video-outline')}<span class="camera-label">${ctx.name}</span>` +
      `<small class="camera-status">${ctx.esc(ctx.t('camera.snapshot_unavailable'))}</small>`;
    // With a camera grid the tile stays usable while its own camera is offline: the other cameras may work.
    return ctx.btn(
      hasGallery ? 'camera-grid' : 'info',
      content,
      `tile ${ctx.cls}`,
      ctx.ok || hasGallery,
      {
        attrs: `${ctx.attr} `
      }
    );
  },

  // The picture is DOM work, never part of render: the <img> is added after the tile is inserted or patched
  // and then re-pointed every 30 s so a still never goes stale.
  afterRender: refreshSnapshot,
  tick: {every: SNAPSHOT_BUCKET_MS, run: refreshSnapshot},

  // The markup never changes with the picture, so the generic "markup unchanged" shortcut and the DOM morph are
  // both wrong for this tile (the morph would delete the <img>): patch it by hand on every update.
  patch: patchCameraTile,
  alwaysPatch: true,

  extension: gallery
});
