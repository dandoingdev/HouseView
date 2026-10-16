// Music card: a large rounded album cover with the title and artist over its lower edge, a progress bar
// with elapsed and remaining time, shuffle / previous / play-pause / next / repeat, a volume pill and an options
// button. The actions of (media, media-prev, media-next, volume-up, volume-down, info) are unchanged; shuffle and
// repeat are new. The progress bar is moved by a 1 s tick (a bare render could not advance it between state changes).
import {defineWidget} from '../../core/define-widget.js';
import {artworkHTML} from './artwork.js';
import library from './library.js';
import {libraryEditor} from './library-editor.js';
import {BROWSE_MEDIA} from './library-data.js';

// MediaPlayerEntityFeature bits in `supported_features` (Home Assistant core).
const VOLUME_SET = 4;
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

/** "1:35", or "1:02:03" past an hour. */
function clockText(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * Where the track is now: Home Assistant reports `media_position` as of `media_position_updated_at`, and a playing
 * player keeps moving after that. Null when the player has no duration (radio, line-in).
 * @returns {{position: number, duration: number}|null}
 */
export function progressOf(ctx) {
  const {
    media_duration: duration,
    media_position: reported,
    media_position_updated_at: at
  } = ctx.attrs;
  if (!ctx.ok || !ctx.num(duration) || duration <= 0) return null;
  let position = ctx.num(reported) ? reported : 0;
  if (ctx.state?.state === 'playing' && at) {
    const since = ctx.time(at);
    if (!Number.isNaN(since)) position += Math.max(0, (ctx.now() - since) / 1000);
  }
  return {position: Math.min(duration, Math.max(0, position)), duration};
}

/** Progress bar and the two times. Empty (but present, so the layout does not jump) without a duration. */
function progressRow(ctx) {
  const progress = progressOf(ctx);
  const fraction = progress ? progress.position / progress.duration : 0;
  const label = ctx.esc(ctx.t('media_player.progress'));
  return (
    `<div class="mc-progress"${progress ? ` role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${Math.round(progress.duration)}" aria-valuenow="${Math.round(progress.position)}"` : ' aria-hidden="true"'}>` +
    `<i class="mc-track"><b class="mc-fill" style="transform:scaleX(${fraction.toFixed(4)})"></b></i>` +
    `<span class="mc-elapsed">${progress ? clockText(progress.position) : ''}</span>` +
    `<span class="mc-remaining">${progress ? '-' + clockText(progress.duration - progress.position) : ''}</span></div>`
  );
}

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

const volumePill = (ctx) => {
  const down = control(
    ctx,
    'volume-down',
    'volume-minus',
    ctx.t('media_player.volume_down'),
    'mc-vbtn',
    ctx.feature(VOLUME_SET)
  );
  const up = control(
    ctx,
    'volume-up',
    'volume-plus',
    ctx.t('media_player.volume_up'),
    'mc-vbtn',
    ctx.feature(VOLUME_SET)
  );
  return `<div class="mc-volume" role="group" aria-label="${ctx.esc(ctx.t('media_player.volume'))}">${down}${ctx.icon('volume-high')}<span class="mc-volume-value">${volumeText(ctx)}</span>${up}</div>`;
};

/** "Speaker options" (the dots over the cover) opens the more-info dialog. */
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
    // The speaker name is only for screen readers; the volume pill is the one control in the top row.
    const top = `<div class="mc-top"><span class="sr">${ctx.name}</span>${volumePill(ctx)}${ctx.feature(BROWSE_MEDIA) ? ctx.btn(`media-player-browse-${ctx.index}`, `${ctx.icon('playlist-music')}<span>${ctx.esc(ctx.t('media_player.browse'))}</span>`, 'mc-browse') : ''}</div>`;
    const stage =
      `<div class="mc-stage"><div class="mc-cover"><div class="music-art">${art}</div>` +
      `<div class="mc-meta"><strong class="mc-title">${ctx.esc(titleText(ctx))}</strong>` +
      `<span class="mc-artist">${ctx.esc(artistText(ctx))}</span></div>${optionsButton(ctx)}</div></div>`;
    // `.mc-body` is the grid: the root is the size container the layout reacts to (a container cannot restyle itself).
    return ctx.root(
      'section',
      'music-panel mc',
      `<div class="mc-body">${top}${stage}${progressRow(ctx)}${transportRow(ctx)}</div>`
    );
  },

  // Move the progress bar and the two times between state changes: only when something differs, and only while the
  // tile is mounted. Costs one scaleX and two text nodes a second for a playing player, nothing otherwise.
  tick: {
    every: 1000,
    run(ctx) {
      const el = ctx.el;
      const progress = progressOf(ctx);
      if (!el || !progress) return;
      const bar = el.querySelector('.mc-progress');
      if (!bar) return;
      const set = (selector, text) => {
        const node = el.querySelector(selector);
        if (node && node.textContent !== text) node.textContent = text;
      };
      set('.mc-elapsed', clockText(progress.position));
      set('.mc-remaining', `-${clockText(progress.duration - progress.position)}`);
      const fill = el.querySelector('.mc-fill');
      const scale = `scaleX(${(progress.position / progress.duration).toFixed(4)})`;
      if (fill && fill.style.transform !== scale) fill.style.transform = scale;
      bar.setAttribute('aria-valuenow', String(Math.round(progress.position)));
    }
  },

  actions: {
    // `media` is a un-prefixed action name kept for compatibility (docs/widget-api.md).
    media: {
      // Idle, off or standby players have nothing to pause: open more-info instead.
      guard: (ctx, id) => (TRANSPORT_STATES.includes(ctx.stateOf(id)?.state) ? true : 'info'),
      run: (ctx, id) => ctx.call('media_player', 'media_play_pause', {entity_id: id})
    },
    'media-prev': trackAction('media_previous_track'),
    'media-next': trackAction('media_next_track'),
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
