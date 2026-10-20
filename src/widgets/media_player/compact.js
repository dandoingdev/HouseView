// A tiny panel tile keeps its quick keys. Tapping or holding the track opens the full-screen player.
// Speaker settings stay on the title inside that player (the dots are hidden on the tile).
import {isTinyPlayer} from './player.js';

const optionsLabel = (ctx) =>
  `${ctx.t('media_player.options')}${ctx.t('media_player.more_controls')}`;

function applyCompact(ctx, el) {
  if (!el.isConnected) return;
  const tiny = isTinyPlayer(el.clientWidth, el.clientHeight);
  el.classList.toggle('mc-compact', tiny);
  const details = el.querySelector('.mc-details');
  if (!details) return;
  if (tiny) {
    details.dataset.action = `media-player-expand-${ctx.index}`;
    const title = details.querySelector('.mc-title')?.textContent?.trim() || '';
    const artist = details.querySelector('.mc-artist')?.textContent?.trim() || '';
    const track = [title, artist].filter(Boolean).join(', ');
    details.setAttribute(
      'aria-label',
      track ? `${track}. ${ctx.t('media_player.open_player')}` : ctx.t('media_player.open_player')
    );
    return;
  }
  details.dataset.action = 'info';
  details.setAttribute('aria-label', optionsLabel(ctx));
}

/** Measure the tile whenever it is laid out. A large player keeps the track as speaker settings. */
export function bindCompact(ctx) {
  const el = ctx.el;
  if (!el) return;
  let watch = ctx.store.get('compact');
  if (!watch || watch.el !== el) {
    watch?.observer?.disconnect();
    watch = {el, ctx, observer: null};
    if (typeof ResizeObserver === 'function') {
      watch.observer = new ResizeObserver(() => {
        if (!el.isConnected) {
          watch.observer.disconnect();
          return;
        }
        applyCompact(watch.ctx, el);
      });
      watch.observer.observe(el);
    }
    ctx.store.set('compact', watch);
  }
  watch.ctx = ctx;
  applyCompact(ctx, el);
}
