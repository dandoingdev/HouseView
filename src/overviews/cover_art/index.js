import {defineOverview} from '../../core/define-overview.js';
import strings from './strings.js';
import {coverModel, isLive} from './model.js';

/**
 * The music note of the dark tile (card mode, or a track without a picture): mdi:music-note through the same
 * <ha-icon> every overview uses. Its size is an inline style on the element itself, because the shell's own rule
 * `.adaptive ha-icon {--mdc-icon-size: 42px; margin-bottom: 16px}` would win over any class of ours.
 */
const note = (ctx) =>
  ctx
    .icon('music-note')
    .replace('<ha-icon ', '<ha-icon style="--mdc-icon-size:var(--ov-ca-note);margin:0" ');

const viewOf = (ctx) =>
  coverModel({state: ctx.state, attrs: ctx.attrs, hass: ctx.hass, name: ctx.rawName});

/**
 * The face. The structure is the same for every track, so a track change patches the picture's src and the two
 * texts in place (the controller's patcher keeps the <img>, and the browser keeps showing the old cover until the
 * new one has loaded). Nothing playing is a calm black face with one line of text.
 */
function sceneHTML(ctx) {
  const view = viewOf(ctx);
  if (view.status === 'idle' || view.status === 'unavailable') {
    return (
      `<div class="ov-scene ov-cover_art-scene" data-status="${view.status}">` +
      `<p class="ov-cover_art-empty">${ctx.esc(ctx.t('cover_art_overview.nothing_playing'))}</p></div>`
    );
  }
  const picture = view.art
    ? `<img class="ov-cover_art-img" src="${ctx.esc(view.art)}" alt="" decoding="async" draggable="false">`
    : `<div class="ov-cover_art-tile">${note(ctx)}</div>`;
  return (
    `<div class="ov-scene ov-cover_art-scene" data-status="${view.status}">` +
    `<div class="ov-cover_art-frame">${picture}<div class="ov-cover_art-scrim"></div>` +
    `<div class="ov-cover_art-text"><p class="ov-cover_art-title" dir="auto">${ctx.esc(view.title)}</p>` +
    `<p class="ov-cover_art-artist" dir="auto">${ctx.esc(view.artist)}</p></div></div></div>`
  );
}

export default defineOverview({
  type: 'cover_art',
  label: 'Cover art',
  order: 30,
  entity: 'required',
  // An automatic display: shown by its widget, not picked from the screensaver list.
  selectable: false,
  domains: ['media_player'],
  strings,

  // Idle overview with a priority: weather (0) stays the default screensaver and this one (10) takes over only while a
  // speaker is playing with a usable picture (see docs/overview-api.md).
  priority: 10,
  // Idle seconds before it starts while the music card's own page is showing (and music is playing).
  onPageIdle: 5,
  eligible: (ctx) => {
    const view = viewOf(ctx);
    return view.status === 'playing' && view.art !== null;
  },
  // It goes when nothing is playing any more. A paused speaker keeps it (and so does the gap between two tracks).
  autoWake: (ctx) => !isLive(ctx.state),

  options: {},

  render: (ctx) => sceneHTML(ctx),

  tap: {card: 'info'}
});
