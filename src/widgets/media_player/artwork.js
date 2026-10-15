// Album artwork for the music panel.
// Home Assistant serves media pictures through `/api/media_player_proxy/...` on its own origin. An entity can name any
// URL in `entity_picture`, so the card only loads the ones that pass core/media-url.js (same origin, proxy path).
import {mediaArtUrl} from '../../core/media-url.js';

/**
 * The `<img>` for the current artwork, or '' when the entity has none or names a foreign URL.
 * @param {import('../../core/context.js').RenderContext} ctx
 */
export function artworkHTML(ctx) {
  const url = mediaArtUrl(ctx.attrs.entity_picture, ctx.hass);
  return url
    ? `<img src="${ctx.esc(url.href)}" alt="${ctx.esc(ctx.t('media_player.artwork'))}">`
    : '';
}
