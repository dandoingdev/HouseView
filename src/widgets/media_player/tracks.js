import {buttonHTML} from '../../core/html.js';
import {PLAY_MEDIA} from './library-data.js';
import {hasSonosQueue, readQueue, readPlaylist} from './tracks-data.js';
import {trapTab} from './player.js';

const valid = (ctx, view = ctx.ext.tracks) =>
  view?.open && ctx.ext.tracks === view && ctx.config?.widgets?.[view.index] === view.widget;
const key = (ctx, action, icon, label) =>
  buttonHTML(
    action,
    ctx.ext.tracks.entity,
    `${ctx.icon(icon)}<span class="sr">${ctx.esc(label)}</span>`,
    'ov-panel-key',
    true
  );

export function tracksMarkup(ctx) {
  if (!valid(ctx)) return '';
  return (
    `<section class="media-library media-tracks" role="dialog" aria-modal="true" aria-label="${ctx.esc(ctx.t('media_player.tracks'))}" tabindex="-1">` +
    `<header class="ml-header">${key(ctx, 'media-player-tracks-close', 'chevron-left', ctx.t('media_player.back'))}<div><small>${ctx.esc(ctx.t('media_player.current_playlist'))}</small><h2 class="mt-title"></h2></div>${key(ctx, 'media-player-tracks-refresh', 'refresh', ctx.t('media_player.refresh_tracks'))}</header>` +
    `<div class="mt-summary" role="status"></div><div class="mt-content" tabindex="0"></div></section>`
  );
}

export function closeTracks(ctx) {
  const view = ctx.ext.tracks;
  if (!view) return;
  view.open = false;
  view.abort?.abort();
  view.revision++;
  view.returnFocus = true;
  view.items = [];
  ctx.render();
}

async function refresh(ctx) {
  const view = ctx.ext.tracks;
  if (!valid(ctx)) return;
  view.abort?.abort();
  view.abort = new AbortController();
  const revision = ++view.revision;
  view.loading = true;
  view.error = '';
  paintTracks(ctx);
  try {
    const items = view.queue
      ? await readQueue(ctx.hass, view.entity, view.abort.signal)
      : await readPlaylist(ctx.hass, view.entity, view.playlist, view.abort.signal);
    if (!valid(ctx, view) || revision !== view.revision) return;
    view.items = items;
  } catch {
    if (valid(ctx, view) && revision === view.revision)
      view.error = ctx.t('media_player.tracks_error');
  } finally {
    if (valid(ctx, view) && revision === view.revision) {
      view.loading = false;
      paintTracks(ctx);
    }
  }
}

/** Only list contents change on a read; playback updates preserve rows, focus and scroll position. */
export function paintTracks(ctx) {
  const view = ctx.ext.tracks;
  if (!view) return;
  if (!view.open) {
    if (view.returnFocus && !ctx.isPending(view.entity)) {
      view.returnFocus = false;
      const prefix = ctx.ext.player ? '.media-stage ' : '';
      ctx.focus(`${prefix}[data-action="media-player-show-tracks-${view.index}"]`);
    }
    return;
  }
  if (!valid(ctx)) return closeTracks(ctx);
  const root = ctx.q('.media-tracks');
  if (!root) return;
  const attrs = ctx.attrsOf(view.entity);
  const online = ctx.availableOf(view.entity);
  const heading =
    attrs.media_playlist ||
    view.playlist?.title ||
    attrs.friendly_name ||
    ctx.t('media_player.label');
  const title = root.querySelector('.mt-title');
  if (title.textContent !== heading) title.textContent = heading;
  const content = root.querySelector('.mt-content');
  const message = !online
    ? ctx.t('media_player.speaker_unavailable')
    : view.loading
      ? ctx.t('media_player.loading_tracks')
      : view.error ||
        (!view.items.length
          ? view.queue || view.playlist
            ? ctx.t('media_player.tracks_empty')
            : ctx.t('media_player.choose_playlist')
          : '');
  if (view.paintedItems !== view.items || view.message !== message || !content.children.length) {
    view.paintedItems = view.items;
    view.message = message;
    view.paintedState = '';

    content.innerHTML = message
      ? `<p class="ml-empty" role="status">${ctx.esc(message)}</p>`
      : `<ol class="mt-list">${view.items
          .map(
            (item, index) =>
              `<li>${buttonHTML(
                `media-player-track-play-${index}`,
                view.entity,
                `<span class="mt-number" aria-hidden="true">${index + 1}</span>` +
                  `<span class="mt-label"><strong>${ctx.esc(item.title || ctx.t('media_player.untitled_track'))}</strong><small>${ctx.esc(item.artist || item.album)}</small></span>` +
                  `<span class="mt-indicator" aria-hidden="true">${ctx.icon('play')}</span>`,
                'mt-track',
                item.can_play
              )}</li>`
          )
          .join('')}</ol>`;
  }
  const summary = root.querySelector('.mt-summary');
  const summaryText = message ? '' : ctx.t('media_player.track_count', {n: view.items.length});
  if (summary.textContent !== summaryText) summary.textContent = summaryText;
  root.querySelector('[data-action="media-player-tracks-refresh"]').disabled = view.loading;
  const stateKey = JSON.stringify([
    attrs.queue_position,
    attrs.media_content_id,
    online,
    ctx.isPending(view.entity),
    attrs.supported_features
  ]);
  if (view.paintedState === stateKey) return;
  view.paintedState = stateKey;
  for (const row of content.querySelectorAll('.mt-track')) {
    const index = Number(row.dataset.action.replace('media-player-track-play-', ''));
    const item = view.items[index];
    const current =
      view.queue && Number.isInteger(attrs.queue_position)
        ? attrs.queue_position === item.position + 1
        : !!attrs.media_content_id && attrs.media_content_id === item.media_content_id;
    if (current && !row.hasAttribute('aria-current')) row.setAttribute('aria-current', 'true');
    else if (!current && row.hasAttribute('aria-current')) row.removeAttribute('aria-current');
    const disabled =
      !online ||
      ctx.isPending(view.entity) ||
      !item.can_play ||
      (!view.queue && !(attrs.supported_features & PLAY_MEDIA));
    if (row.disabled !== disabled) row.disabled = disabled;
  }
}

export function tracksKeydown(ctx, event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeTracks(ctx);
  } else if (event.key === 'Tab') {
    trapTab(ctx, event, '.media-tracks', 'button:not(:disabled), [tabindex="0"]');
  }
  return true;
}

export function disposeTracks(ctx) {
  const view = ctx.ext.tracks;
  view?.abort?.abort();
  if (view) view.revision++;
  ctx.q('.media-tracks')?.remove();
  ctx.ext.tracks = null;
  // One selection per configured widget; no persisted metadata or cross-card cache.
  ctx.ext.selections = new WeakMap();
}

export const tracksActions = {
  'media-player-show-tracks-*': {
    immediate: true,
    run(ctx, id) {
      const index = Number(ctx.param);
      const widget = ctx.config?.widgets?.[index];
      if (
        !/^\d+$/.test(ctx.param) ||
        widget?.type !== 'media_player' ||
        widget.entity !== id ||
        !ctx.availableOf(id) ||
        ctx.isPending(id)
      )
        return;
      ctx.ext.tracks?.abort?.abort();
      ctx.ext.tracks = {
        open: true,
        index,
        widget,
        entity: id,
        items: [],
        revision: 0,
        queue: hasSonosQueue(ctx.hass, id),
        playlist: ctx.ext.selections.get(widget)
      };
      ctx.render();
      ctx.focus('.media-tracks [data-action="media-player-tracks-close"]');
      void refresh(ctx);
    }
  },
  'media-player-tracks-close': {immediate: true, run: closeTracks},
  'media-player-tracks-refresh': {
    immediate: true,
    run(ctx) {
      if (valid(ctx) && !ctx.ext.tracks.loading) return refresh(ctx);
    }
  },
  'media-player-track-play-*': {
    guard(ctx, id) {
      const view = ctx.ext.tracks;
      return !!(
        valid(ctx) &&
        id === view.entity &&
        !view.loading &&
        !view.error &&
        /^\d+$/.test(ctx.param) &&
        view.items[Number(ctx.param)]?.can_play &&
        (view.queue ? hasSonosQueue(ctx.hass, id) : ctx.attrsOf(id).supported_features & PLAY_MEDIA)
      );
    },
    async run(ctx, id) {
      const view = ctx.ext.tracks;
      const item = view.items[Number(ctx.param)];
      if (view.queue) {
        // A different app may have edited the queue. Never jump to an unchecked stale position.
        try {
          const queue = await readQueue(ctx.hass, id, view.abort.signal);
          if (!valid(ctx, view) || ctx.ext.tracks !== view) return;
          if (
            queue[item.position]?.media_content_id !== item.media_content_id ||
            !ctx.availableOf(id)
          ) {
            view.items = queue;
            view.error = ctx.t('media_player.queue_changed');
            paintTracks(ctx);
            return;
          }
        } catch {
          if (!valid(ctx, view)) return;
          view.error = ctx.t('media_player.tracks_error');
          paintTracks(ctx);
          return;
        }
      }
      closeTracks(ctx);
      if (view.queue)
        await ctx.call('sonos', 'play_queue', {entity_id: id, queue_position: item.position});
      else
        await ctx.call('media_player', 'play_media', {
          entity_id: id,
          media_content_id: item.media_content_id,
          media_content_type: item.media_content_type
        });
    }
  }
};
