// Music card: a large rounded album cover with the title and artist over its lower edge, a progress bar
// with elapsed and remaining time, shuffle / previous / play-pause / next / repeat, a volume button and an options
// button. The actions of (media, media-prev, media-next, volume-up, volume-down, info) are unchanged; shuffle and
// repeat are new. The progress bar is moved by a 1 s tick (a bare render could not advance it between state changes).
import {defineWidget} from '../../core/define-widget.js';
import {artworkHTML} from './artwork.js';
import library from './library.js';
import {libraryEditor} from './library-editor.js';
import {canSetVolume, canMuteVolume} from '../../core/media-volume.js';
import {BROWSE_MEDIA} from './library-data.js';
import {canSeek, progressOf, progressRow, bindProgress, paintProgress} from './progress.js';
export {progressOf} from './progress.js';

// MediaPlayerEntityFeature bits in `supported_features` (Home Assistant core).
const PLAY = 512;
const PREVIOUS_TRACK = 16;
const NEXT_TRACK = 32;
const SHUFFLE_SET = 32768;
const REPEAT_SET = 262144;

// One volume press moves the level by 5 percentage points.
const VOLUME_STEP = 0.05;

// Only these states have something to play or pause; any other tap opens more-info.
const TRANSPORT_STATES = ['playing', 'paused'];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Third line under the track: the artist, else the raw player state. */
function artistText(ctx) {
  return ctx.attrs.media_artist || (ctx.ok ? ctx.stateText() : ctx.t('state.unavailable'));
}

function titleText(ctx) {
  if (!ctx.ok) return ctx.t('media_player.speaker_unavailable');
  return ctx.attrs.media_title || ctx.t('media_player.ready');
}

/** Icon button with a screen-reader label. `cls` styles it, `extra` adds attributes. */
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

const SHUFFLE_ICONS = {true: 'shuffle-variant', false: 'shuffle-disabled'};
const REPEAT_ICONS = {off: 'repeat-off', all: 'repeat', one: 'repeat-once'};

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

/** Holding "Speaker options" (the dots over the cover) opens the more-info dialog. */
const optionsButton = (ctx) =>
  ctx.btn(
    'info',
    `${ctx.icon('dots-horizontal')}<span class="sr">${ctx.esc(ctx.t('media_player.options'))}${ctx.esc(ctx.t('media_player.more_controls'))}</span>`,
    'mc-more',
    ctx.ok
  );

/** volume_set payload for a press of volume-up / volume-down; a missing level counts as 0. */
const steppedVolume = (ctx, id, direction) =>
  clamp01((ctx.attrsOf(id).volume_level || 0) + direction * VOLUME_STEP);

const volumeAction = (direction) => ({
  run: (ctx, id) =>
    ctx.call('media_player', 'volume_set', {
      entity_id: id,
      volume_level: steppedVolume(ctx, id, direction)
    })
});

const trackAction = (service) => ({
  run: (ctx, id) => ctx.call('media_player', service, {entity_id: id})
});

export default defineWidget({
  type: 'media_player',
  label: 'Music',
  order: 130,
  cardRows: 6,
  standaloneHeight: 380,

  options: {playlist_mode: {type: 'enum', values: ['all', 'selected']}},
  editor: libraryEditor,
  extension: library,
  validate(widget) {
    if (
      widget.playlists !== undefined &&
      (!Array.isArray(widget.playlists) ||
        widget.playlists.some((item) => typeof item !== 'string'))
    )
      throw new Error('Shown playlists must be a list of saved media IDs.');
  },

  render(ctx) {
    const art = artworkHTML(ctx) || ctx.icon('music-note');
    // The speaker name is only for screen readers; volume and Browse share the top row.
    const top = `<div class="mc-top"><span class="sr">${ctx.name}</span>${volumeButton(ctx)}${ctx.feature(BROWSE_MEDIA) ? ctx.btn(`media-player-browse-${ctx.index}`, `${ctx.icon('playlist-music')}<span>${ctx.esc(ctx.t('media_player.browse'))}</span>`, 'mc-browse', true, {attrs: `aria-label="${ctx.esc(ctx.t('media_player.browse'))}" `}) : ''}</div>`;
    const stage =
      `<div class="mc-stage"><div class="mc-cover"><div class="music-art">${art}</div>` +
      `<div class="mc-meta">${ctx.btn('info', `<strong class="mc-title">${ctx.esc(titleText(ctx))}</strong><span class="mc-artist">${ctx.esc(artistText(ctx))}</span>`, 'mc-details', ctx.ok, {attrs: `aria-label="${ctx.esc(ctx.t('media_player.options'))}${ctx.esc(ctx.t('media_player.more_controls'))}" `})}</div>${optionsButton(ctx)}</div></div>`;
    // `.mc-body` is the grid: the root is the size container the layout reacts to (a container cannot restyle itself).
    return ctx.root(
      'section',
      `music-panel mc${progressOf(ctx) ? ' mc-has-progress' : ''}`,
      `<div class="mc-body">${top}${stage}${progressRow(ctx)}${transportRow(ctx)}</div>`
    );
  },

  afterRender: bindProgress,
  tick: {every: 1000, run: paintProgress},

  actions: {
    'media-player-seek-*': {
      guard: (ctx, id) =>
        canSeek(ctx.stateOf(id)) &&
        /^\d{1,8}$/.test(ctx.param) &&
        Number(ctx.param) <= Math.floor(ctx.attrsOf(id).media_duration),
      run: (ctx, id) =>
        ctx.call('media_player', 'media_seek', {
          entity_id: id,
          seek_position: Number(ctx.param)
        })
    },
    // `media` is a un-prefixed action name kept for compatibility (docs/widget-api.md).
    media: {
      // An idle speaker can resume its queue when it supports PLAY; other inactive devices need settings.
      guard: (ctx, id) =>
        TRANSPORT_STATES.includes(ctx.stateOf(id)?.state) ||
        (ctx.stateOf(id)?.state === 'idle' && ctx.attrsOf(id).supported_features & PLAY)
          ? true
          : 'info',
      run: (ctx, id) =>
        ctx.call(
          'media_player',
          ctx.stateOf(id)?.state === 'idle' ? 'media_play' : 'media_play_pause',
          {entity_id: id}
        )
    },
    'media-prev': trackAction('media_previous_track'),
    'media-next': trackAction('media_next_track'),
    'media-player-volume-set-*': {
      guard: (ctx, id) =>
        /^\d{1,3}$/.test(ctx.param) && Number(ctx.param) <= 100 && canSetVolume(ctx.attrsOf(id)),
      run: (ctx, id) =>
        ctx.call('media_player', 'volume_set', {
          entity_id: id,
          volume_level: Number(ctx.param) / 100
        })
    },
    'media-player-volume-mute': {
      guard: (ctx, id) => canMuteVolume(ctx.attrsOf(id)),
      run: (ctx, id) =>
        ctx.call('media_player', 'volume_mute', {
          entity_id: id,
          is_volume_muted: !ctx.attrsOf(id).is_volume_muted
        })
    },
    'volume-up': volumeAction(1),
    'volume-down': volumeAction(-1),
    'media-player-shuffle': {
      guard: (ctx, id) => (ctx.attrsOf(id).supported_features & SHUFFLE_SET ? true : false),
      run: (ctx, id) =>
        ctx.call('media_player', 'shuffle_set', {
          entity_id: id,
          shuffle: ctx.attrsOf(id).shuffle !== true
        })
    },
    'media-player-repeat': {
      guard: (ctx, id) => (ctx.attrsOf(id).supported_features & REPEAT_SET ? true : false),
      run: (ctx, id) => {
        const order = ['off', 'all', 'one'];
        const now = order.indexOf(ctx.attrsOf(id).repeat);
        return ctx.call('media_player', 'repeat_set', {
          entity_id: id,
          repeat: order[(now + 1) % order.length]
        });
      }
    }
  }
});
