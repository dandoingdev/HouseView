// Music card: a large rounded album cover with the title and artist over its lower edge, a progress bar
// with elapsed and remaining time, shuffle / previous / play-pause / next / repeat, a volume button and an options
// button. The actions of (media, media-prev, media-next, volume-up, volume-down, info) are unchanged; shuffle and
// repeat are new. The progress bar is moved by a 1 s tick (a bare render could not advance it between state changes).
import {defineWidget} from '../../core/define-widget.js';
import library from './library.js';
import {libraryEditor} from './library-editor.js';
import {canSetVolume, canMuteVolume} from '../../core/media-volume.js';
import {canSeek, bindProgress, paintProgress} from './progress.js';
import {bindCompact} from './compact.js';
import {playerSection, PLAY, SHUFFLE_SET, REPEAT_SET} from './player.js';
export {progressOf} from './progress.js';

// One volume press moves the level by 5 percentage points.
const VOLUME_STEP = 0.05;

// Only these states have something to play or pause; any other tap opens more-info.
const TRANSPORT_STATES = ['playing', 'paused'];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

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

  // `.mc` is the size container the layout reacts to (a container cannot restyle itself).
  render: (ctx) => playerSection(ctx),

  afterRender(ctx) {
    bindProgress(ctx);
    bindCompact(ctx);
  },
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
