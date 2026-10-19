// The music panel markup, shared by the tile and the full-screen stage opened from a tiny panel tile.
import {buttonHTML, esc} from '../../core/html.js';
import {isUsable} from '../../core/state.js';
import {canSetVolume} from '../../core/media-volume.js';
import {artworkHTML} from './artwork.js';
import {BROWSE_MEDIA} from './library-data.js';
import {progressOf, progressRow, bindProgress, paintProgress} from './progress.js';

export const PLAY = 512;
export const PREVIOUS_TRACK = 16;
export const NEXT_TRACK = 32;
export const SHUFFLE_SET = 32768;
export const REPEAT_SET = 262144;

// Matches the compact tile rules in style.css (four controls on a 480px panel are about 225×178).
export const TINY_MAX_WIDTH = 300;
export const TINY_MAX_HEIGHT = 260;

/** A laid-out tile is the NSPanel-style strip: too small for the cover and the full transport. */
export function isTinyPlayer(width, height) {
  return width > 0 && height > 0 && width <= TINY_MAX_WIDTH && height <= TINY_MAX_HEIGHT;
}

const SHUFFLE_ICONS = {true: 'shuffle-variant', false: 'shuffle-disabled'};
const REPEAT_ICONS = {off: 'repeat-off', all: 'repeat', one: 'repeat-once'};

function artistText(ctx) {
  return ctx.attrs.media_artist || (ctx.ok ? ctx.stateText() : ctx.t('state.unavailable'));
}

function titleText(ctx) {
  if (!ctx.ok) return ctx.t('media_player.speaker_unavailable');
  return ctx.attrs.media_title || ctx.t('media_player.ready');
}

const control = (ctx, action, icon, label, cls, enabled, extra = {}) =>
  ctx.btn(
    action,
    `${ctx.icon(icon)}<span class="sr">${ctx.esc(label)}</span>`,
    cls,
    enabled,
    extra
  );

const volumeText = (ctx) =>
  ctx.num(ctx.attrs.volume_level) ? `${Math.round(ctx.attrs.volume_level * 100)}%` : '—';

function transportRow(ctx) {
  const playing = ctx.state?.state === 'playing';
  const shuffle = ctx.attrs.shuffle === true;
  const repeat = REPEAT_ICONS[ctx.attrs.repeat] ? ctx.attrs.repeat : 'off';
  const aux = (action, icon, label, on, enabled) =>
    control(ctx, action, icon, label, `mc-aux${on ? ' is-on' : ''}`, enabled, {
      attrs: `aria-pressed="${on}" `
    });
  return (
    `<div class="mc-transport">` +
    aux(
      'media-player-shuffle',
      SHUFFLE_ICONS[shuffle],
      ctx.t('media_player.shuffle'),
      shuffle,
      ctx.feature(SHUFFLE_SET)
    ) +
    control(
      ctx,
      'media-prev',
      'rewind',
      ctx.t('media_player.previous'),
      'mc-skip',
      ctx.feature(PREVIOUS_TRACK)
    ) +
    control(
      ctx,
      'media',
      playing ? 'pause' : 'play',
      ctx.t('media_player.play_pause'),
      'mc-play play',
      ctx.ok
    ) +
    control(
      ctx,
      'media-next',
      'fast-forward',
      ctx.t('media_player.next'),
      'mc-skip',
      ctx.feature(NEXT_TRACK)
    ) +
    aux(
      'media-player-repeat',
      REPEAT_ICONS[repeat],
      ctx.t('media_player.repeat'),
      repeat !== 'off',
      ctx.feature(REPEAT_SET)
    ) +
    `</div>`
  );
}

const volumeButton = (ctx) =>
  ctx.btn(
    'media-player-volume-view',
    `${ctx.icon(ctx.attrs.is_volume_muted ? 'volume-off' : 'volume-high')}<span class="mc-volume-value">${volumeText(ctx)}</span>`,
    'mc-volume',
    ctx.ok && canSetVolume(ctx.attrs),
    {attrs: `aria-label="${ctx.esc(ctx.t('media_player.adjust_volume'))}" `}
  );

const optionsButton = (ctx) =>
  ctx.btn(
    'info',
    `${ctx.icon('dots-horizontal')}<span class="sr">${ctx.esc(ctx.t('media_player.options'))}${ctx.esc(ctx.t('media_player.more_controls'))}</span>`,
    'mc-more',
    ctx.ok
  );

/** Fields that change the controls. The moving playhead is painted separately so a drag is not reset. */
function structureKey(ctx) {
  const attrs = ctx.attrs;
  return JSON.stringify([
    ctx.ok,
    ctx.state?.state,
    attrs.media_title,
    attrs.media_artist,
    attrs.media_content_id,
    attrs.entity_picture,
    attrs.volume_level,
    attrs.is_volume_muted,
    attrs.shuffle,
    attrs.repeat,
    attrs.supported_features,
    attrs.media_duration,
    attrs.friendly_name,
    ctx.widget?.name,
    ctx.isPending(ctx.entityId)
  ]);
}

export function playerInner(ctx) {
  const art = artworkHTML(ctx) || ctx.icon('music-note');
  const browse = ctx.feature(BROWSE_MEDIA)
    ? ctx.btn(
        `media-player-browse-${ctx.index}`,
        `${ctx.icon('playlist-music')}<span>${ctx.esc(ctx.t('media_player.browse'))}</span>`,
        'mc-browse',
        true,
        {attrs: `aria-label="${ctx.esc(ctx.t('media_player.browse'))}" `}
      )
    : '';
  const top = `<div class="mc-top"><span class="sr">${ctx.name}</span>${volumeButton(ctx)}${browse}</div>`;
  const stage =
    `<div class="mc-stage"><div class="mc-cover"><div class="music-art">${art}</div>` +
    `<div class="mc-meta">${ctx.btn('info', `<strong class="mc-title">${ctx.esc(titleText(ctx))}</strong><span class="mc-artist">${ctx.esc(artistText(ctx))}</span>`, 'mc-details', ctx.ok, {attrs: `aria-label="${ctx.esc(ctx.t('media_player.options'))}${ctx.esc(ctx.t('media_player.more_controls'))}" `})}</div>${optionsButton(ctx)}</div></div>`;
  return `${top}${stage}${progressRow(ctx)}${transportRow(ctx)}`;
}

export function playerSection(ctx) {
  return ctx.root(
    'section',
    `music-panel mc${progressOf(ctx) ? ' mc-has-progress' : ''}`,
    `<div class="mc-body">${playerInner(ctx)}</div>`
  );
}

/** A render-shaped context for one configured player, built from the card-level extension context. */
function viewFrom(base, widget, index) {
  const entityId = widget.entity;
  const state = base.stateOf(entityId);
  const attrs = state?.attributes || {};
  const ok = isUsable(state, entityId, 'entity');
  const rawName = widget.name || attrs.friendly_name || 'Music';
  const btn = (action, content, extraClass = '', enabled = ok, opts = {}) => {
    const entity = opts.entity || entityId;
    return buttonHTML(action, entity, content, extraClass, enabled, {
      pending: base.isPending(entity),
      attrs: opts.attrs || ''
    });
  };
  return Object.assign({}, base, {
    widget,
    index,
    entityId,
    state,
    attrs,
    ok,
    name: esc(rawName),
    rawName,
    feature: (bit) => ok && !!(attrs.supported_features & bit),
    btn,
    stateText: () => {
      if (
        state &&
        base.config?.localized_states &&
        typeof base.hass?.formatEntityState === 'function'
      ) {
        return base.hass.formatEntityState(state);
      }
      return String(state?.state ?? '').replaceAll('_', ' ');
    }
  });
}

function stageView(ctx) {
  const player = ctx.ext?.player;
  if (!player) return null;
  const widget = ctx.config?.widgets?.[player.index];
  if (!widget || widget.type !== 'media_player' || widget.entity !== player.entity) return null;
  const view = viewFrom(ctx, widget, player.index);
  view.store = ctx.ext.seekStore ||= new Map();
  return view;
}

export function stageMarkup(ctx) {
  const view = stageView(ctx);
  if (!view) return '';
  ctx.ext.playerKey = structureKey(view);
  const close = buttonHTML(
    'media-player-stage-close',
    view.entityId,
    `${ctx.icon('close')}<span class="sr">${ctx.esc(ctx.t('media_player.close_player'))}</span>`,
    'ms-close',
    true
  );
  return (
    `<section class="media-stage" role="dialog" aria-modal="true" aria-label="${ctx.esc(ctx.t('media_player.open_player'))}" tabindex="-1">` +
    `<header class="ms-head">${close}<h2 class="ms-title">${ctx.esc(view.rawName)}</h2><span></span></header>` +
    `<section class="music-panel mc${progressOf(view) ? ' mc-has-progress' : ''}" data-widget="${view.index}"><div class="mc-body">${playerInner(view)}</div></section></section>`
  );
}

/** Keep the open stage in step with Home Assistant without rebuilding it on every playhead tick. */
export function syncStage(ctx) {
  const view = stageView(ctx);
  const root = ctx.q?.('.media-stage');
  if (!view || !root) return;
  const panel = root.querySelector('.mc');
  if (!panel) return;
  view.el = panel;
  const key = structureKey(view);
  bindProgress(view);
  if (ctx.ext.playerKey !== key && view.store.get('seek')?.pointer == null) {
    ctx.ext.playerKey = key;
    const body = panel.querySelector('.mc-body');
    if (body) body.innerHTML = playerInner(view);
    panel.classList.toggle('mc-has-progress', !!progressOf(view));
    const title = root.querySelector('.ms-title');
    if (title && title.textContent !== view.rawName) title.textContent = view.rawName;
    bindProgress(view);
  }
}

export function paintStage(ctx) {
  const view = stageView(ctx);
  const panel = ctx.q?.('.media-stage .mc');
  if (!view || !panel) return;
  view.el = panel;
  paintProgress(view);
}

export function openStage(ctx, id) {
  const index = Number(ctx.param);
  const widget = ctx.config?.widgets?.[index];
  if (!/^\d+$/.test(ctx.param) || widget?.type !== 'media_player' || widget.entity !== id) return;
  ctx.ext.player = {index, entity: id};
  ctx.ext.playerKey = '';
  ctx.render();
  ctx.focus('.media-stage .ms-close');
}

export function closeStage(ctx) {
  const index = ctx.ext.player?.index;
  ctx.ext.player = null;
  ctx.ext.playerKey = '';
  ctx.ext.seekStore = new Map();
  ctx.render();
  if (index != null) ctx.focus(`[data-widget="${index}"] .mc-details`);
}

/** Escape closes the stage. Tab stays inside it. Every other key stays off the page controls. */
export function stageKeydown(ctx, event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeStage(ctx);
    return true;
  }
  if (event.key === 'Tab') {
    const keys = [
      ...ctx.q('.media-stage').querySelectorAll('button:not(:disabled), input:not(:disabled)')
    ];
    if (!keys.length) return true;
    const index = keys.indexOf(ctx.root.activeElement);
    const next = event.shiftKey
      ? index <= 0
        ? keys.length - 1
        : index - 1
      : (index + 1) % keys.length;
    event.preventDefault();
    keys[next]?.focus();
  }
  return true;
}
