import {swipeStep, SWIPE_CLICK_GUARD_MS} from '../../core/swipe.js';
import {buttonHTML} from '../../core/html.js';
import {BROWSE_MEDIA, PLAY_MEDIA, libraryArtwork, loadLibrary, shownItems} from './library-data.js';
import {stageMarkup, syncStage, paintStage, openStage, closeStage, stageKeydown} from './player.js';

const PAGE_SIZE = 6;
const valid = (ctx) => ctx.ext.open && ctx.config?.widgets?.[ctx.ext.index] === ctx.ext.widget;
const button = (ctx, action, icon, label, enabled = true) =>
  buttonHTML(
    action,
    ctx.ext.entity,
    `${ctx.icon(icon)}<span class="sr">${ctx.esc(label)}</span>`,
    'ml-key',
    enabled
  );

// One set of listeners per overlay; grid/artwork updates do not rebind them.
const swipeRoots = new WeakSet();
function bindSwipe(ctx, root) {
  if (swipeRoots.has(root)) return;
  swipeRoots.add(root);
  let start = null;
  let suppressUntil = 0;
  root.addEventListener('pointerdown', (event) => {
    start = null;
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (!event.target.closest('.ml-content')) return;
    start = {x: event.clientX, y: event.clientY, time: Date.now(), pointer: event.pointerId};
  });
  root.addEventListener('pointercancel', () => {
    start = null;
  });
  root.addEventListener('pointerup', (event) => {
    const gesture = start;
    start = null;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const step = swipeStep(gesture, event);
    if (!step) return;
    // Swallow the trailing click even at the first/last page: a swipe must never start music.
    suppressUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
    void ctx.act(
      step > 0 ? 'media-player-library-next' : 'media-player-library-prev',
      ctx.ext.entity
    );
  });
  root.addEventListener(
    'click',
    (event) => {
      if (event.detail === 0 || Date.now() >= suppressUntil) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    {capture: true}
  );
}

function close(ctx) {
  ctx.ext.open = false;
  ctx.ext.abort?.abort();
  ctx.ext.revision++;
  ctx.ext.returnFocus = true;
  ctx.render();
}

async function refresh(ctx) {
  const ext = ctx.ext;
  ext.abort?.abort();
  ext.abort = new AbortController();
  const revision = ++ext.revision;
  ext.loading = true;
  ext.error = '';
  ext.partial = false;
  paint(ctx);
  try {
    const result = await loadLibrary(ctx.hass, ext.entity, ext.abort.signal);
    if (!valid(ctx) || ext.revision !== revision) return;
    ext.items = shownItems(ext.widget, result.items);
    ext.partial = result.partial;
  } catch {
    if (valid(ctx) && ext.revision === revision) ext.error = ctx.t('media_player.browse_error');
  } finally {
    if (valid(ctx) && ext.revision === revision) {
      ext.loading = false;
      ext.page = 0;
      paint(ctx);
    }
  }
}

function markup(ctx) {
  const ext = ctx.ext;
  const heading =
    ext.widget?.name || ctx.attrsOf(ext.entity).friendly_name || ctx.t('media_player.label');
  return (
    `<section class="media-library" role="dialog" aria-modal="true" aria-label="${ctx.esc(ctx.t('media_player.browse'))}" tabindex="-1">` +
    `<header class="ml-header">${button(ctx, 'media-player-library-close', 'chevron-left', ctx.t('media_player.back'))}<div><small>${ctx.esc(heading)}</small><h2>${ctx.esc(ctx.t('media_player.playlists'))}</h2></div>${button(ctx, 'media-player-library-refresh', 'refresh', ctx.t('media_player.refresh'))}</header>` +
    '<div class="ml-content"></div><footer class="ml-footer"></footer></section>'
  );
}

/** Update this overlay only; normal HA state changes never recreate its grid or artwork connections. */
function paint(ctx) {
  const ext = ctx.ext;
  if (!ext.open) {
    if (ext.returnFocus && !ctx.isPending(ext.entity)) {
      ext.returnFocus = false;
      const browse = ext.player
        ? `.media-stage [data-action="media-player-browse-${ext.index}"]`
        : `[data-action="media-player-browse-${ext.index}"]`;
      ctx.focus(ctx.q(browse) ? browse : '.media-stage .ms-close');
    }
    return;
  }
  const root = ctx.q('.media-library');
  if (!root) return;
  if (!valid(ctx)) return close(ctx);
  bindSwipe(ctx, root);
  const content = root.querySelector('.ml-content');
  const online = ctx.availableOf(ext.entity);
  const playable =
    online &&
    !!(ctx.attrsOf(ext.entity).supported_features & PLAY_MEDIA) &&
    !ctx.isPending(ext.entity);
  const signature = JSON.stringify([ext.loading, ext.error, ext.items, ext.page, online]);
  if (ext.signature !== signature || !content.children.length) {
    ext.signature = signature;
    const message = ext.loading
      ? ctx.t('media_player.loading')
      : ext.error ||
        (!online
          ? ctx.t('media_player.speaker_unavailable')
          : !ext.items.length
            ? ctx.t('media_player.empty')
            : '');
    content.innerHTML = message
      ? `<p class="ml-empty" role="status">${ctx.esc(message)}</p>`
      : `<div class="ml-grid">${ext.items
          .slice(ext.page * PAGE_SIZE, (ext.page + 1) * PAGE_SIZE)
          .map((item, i) => {
            const index = ext.page * PAGE_SIZE + i;
            return buttonHTML(
              `media-player-library-play-${index}`,
              ext.entity,
              `<span class="ml-art" data-art="${index}">${ctx.icon('playlist-music')}</span><strong>${ctx.esc(item.title)}</strong>${item.can_play ? '' : `<small>${ctx.esc(ctx.t('media_player.item_missing'))}</small>`}`,
              'ml-item',
              playable && item.can_play === true
            );
          })
          .join('')}</div>`;
    for (const slot of content.querySelectorAll('[data-art]')) {
      const item = ext.items[Number(slot.dataset.art)];
      void libraryArtwork(ctx.hass, ext.entity, item).then((url) => {
        if (!url || !slot.isConnected || !valid(ctx)) return;
        const image = document.createElement('img');
        image.alt = '';
        image.draggable = false;
        image.referrerPolicy = 'no-referrer';
        image.decoding = 'async';
        image.loading = 'lazy';
        image.src = url;
        image.addEventListener('error', () => image.remove(), {once: true});
        slot.append(image);
      });
    }
  }
  for (const item of content.querySelectorAll('.ml-item')) {
    const index = Number(item.dataset.action.replace('media-player-library-play-', ''));
    item.disabled = !playable || ext.items[index]?.can_play !== true;
  }
  const pages = Math.max(1, Math.ceil(ext.items.length / PAGE_SIZE));
  const footer = root.querySelector('.ml-footer');
  const footerHTML = `${button(ctx, 'media-player-library-prev', 'chevron-left', ctx.t('media_player.previous_page'), !ext.loading && ext.page > 0)}<span>${ext.error ? '' : ext.partial ? ctx.esc(ctx.t('media_player.partial')) : `${ext.page + 1} / ${pages}`}</span>${button(ctx, 'media-player-library-next', 'chevron-right', ctx.t('media_player.next_page'), !ext.loading && ext.page + 1 < pages)}`;
  if (footer.innerHTML !== footerHTML) footer.innerHTML = footerHTML;
}

function afterRender(ctx) {
  paint(ctx);
  syncStage(ctx);
}

function libraryKeys(ctx, event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close(ctx);
    return true;
  }
  if (event.key === 'Tab') {
    const keys = [...ctx.q('.media-library').querySelectorAll('button:not(:disabled)')];
    const index = keys.indexOf(ctx.root.activeElement);
    const next = event.shiftKey
      ? index <= 0
        ? keys.length - 1
        : index - 1
      : (index + 1) % keys.length;
    event.preventDefault();
    keys[next]?.focus();
    return true;
  }
  return true;
}

function dispose(ctx) {
  if (ctx.reason !== 'disconnect') return;
  ctx.ext.open = false;
  ctx.ext.player = null;
  ctx.ext.playerKey = '';
  ctx.ext.seekStore = new Map();
  ctx.ext.abort?.abort();
  ctx.ext.revision++;
  ctx.ext.items = [];
  ctx.ext.signature = '';
}

export default {
  state: () => ({open: false, revision: 0, items: [], page: 0, player: null, playerKey: ''}),
  overlay: (ctx) => `${stageMarkup(ctx)}${ctx.ext.open ? markup(ctx) : ''}`,
  afterRender,
  tick: {every: 1000, when: (ext) => !!ext.player, run: paintStage},
  blocksNavigation: (ext) => !!(ext.open || ext.player),
  onKeydown(ctx, event) {
    if (ctx.ext.open) return libraryKeys(ctx, event);
    if (ctx.ext.player) return stageKeydown(ctx, event);
    return false;
  },
  dispose,
  actions: {
    'media-player-browse-*': {
      immediate: true,
      run(ctx, id) {
        const widget = ctx.config?.widgets?.[Number(ctx.param)];
        if (
          !/^\d+$/.test(ctx.param) ||
          widget?.type !== 'media_player' ||
          widget.entity !== id ||
          !ctx.availableOf(id) ||
          !(ctx.attrsOf(id).supported_features & BROWSE_MEDIA)
        )
          return;
        Object.assign(ctx.ext, {
          open: true,
          widget,
          index: Number(ctx.param),
          entity: id,
          items: [],
          page: 0,
          signature: '',
          returnFocus: false,
          focusReturn: ctx.root.activeElement
        });
        ctx.render();
        ctx.focus('.media-library .ml-key');
        void refresh(ctx);
      }
    },
    'media-player-expand-*': {immediate: true, run: openStage},
    'media-player-stage-close': {immediate: true, run: closeStage},
    'media-player-library-close': {immediate: true, run: close},
    'media-player-library-refresh': {
      immediate: true,
      run: (ctx) => {
        if (valid(ctx) && !ctx.ext.loading) return refresh(ctx);
      }
    },
    'media-player-library-prev': {
      immediate: true,
      run(ctx) {
        if (valid(ctx) && !ctx.ext.loading) {
          ctx.ext.page = Math.max(0, ctx.ext.page - 1);
          paint(ctx);
        }
      }
    },
    'media-player-library-next': {
      immediate: true,
      run(ctx) {
        if (valid(ctx) && !ctx.ext.loading) {
          ctx.ext.page = Math.min(
            Math.max(0, Math.ceil(ctx.ext.items.length / PAGE_SIZE) - 1),
            ctx.ext.page + 1
          );
          paint(ctx);
        }
      }
    },
    'media-player-library-play-*': {
      guard(ctx, id) {
        const item = ctx.ext.items[Number(ctx.param)];
        return (
          valid(ctx) &&
          id === ctx.ext.entity &&
          !ctx.ext.loading &&
          !ctx.ext.error &&
          /^\d+$/.test(ctx.param) &&
          item?.can_play === true &&
          !!(ctx.attrsOf(id).supported_features & PLAY_MEDIA)
        );
      },
      async run(ctx, id) {
        const item = ctx.ext.items[Number(ctx.param)];
        const revision = ctx.ext.revision;
        try {
          await ctx.call('media_player', 'play_media', {
            entity_id: id,
            media_content_id: item.media_content_id,
            media_content_type: item.media_content_type
          });
          if (valid(ctx) && ctx.ext.entity === id && ctx.ext.revision === revision) close(ctx);
        } catch (error) {
          if (valid(ctx) && ctx.ext.entity === id && ctx.ext.revision === revision) {
            ctx.ext.error = ctx.t('media_player.play_error');
            paint(ctx);
          }
          throw error;
        }
      }
    }
  }
};
