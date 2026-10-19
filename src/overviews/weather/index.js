import {defineOverview} from '../../core/define-overview.js';
import {forecastSpec} from '../../core/subscriptions.js';
import {setText} from '../_shared/dom.js';
import strings from './strings.js';
import {DEFAULT_DETAILS, DETAIL_KEYS, viewOf} from './model.js';
import {skyFor} from './sky.js';

const MAX_DETAILS = 6;

/**
 * An icon sized by the scene. The size is an inline style on the <ha-icon> itself: the shell's own rule
 * `.adaptive ha-icon {--mdc-icon-size: 42px; margin-bottom: 16px}` would win over any class of ours.
 */
const glyph = (ctx, name) =>
  ctx.icon(name).replace('<ha-icon ', '<ha-icon style="--mdc-icon-size:var(--ov-icon);margin:0" ');

/** Which of the two puff arrangements a cloud uses (style.css), so neighbours never look alike. */
const SHAPES = ['a', 'b'];

/** "r,g,b" halfway between two "r,g,b" strings: the middle band of a cloud's shading. */
const mean = (a, b) =>
  a
    .split(',')
    .map((v, i) => Math.round((Number(v) + Number(b.split(',')[i])) / 2))
    .join(',');

const cloud = ({x, y, w, ar, o, lit, shade, hi}, index) =>
  `<i class="ov-cloud ov-cloud-${SHAPES[index % SHAPES.length]}" style="--x:${x};--y:${y};--w:${w};` +
  `--ar:${ar};--o:${o.toFixed(2)};--lit:${lit};--mid:${mean(lit, shade)};--shade:${shade};--hi:${hi}"></i>`;

/** All clouds share one drifting layer; its pace is the mean of the presets' (a gale drifts faster than a haze). */
const deck = (clouds) =>
  clouds.length
    ? `<div class="ov-clouds" style="--drift:${Math.round(
        clouds.reduce((sum, c) => sum + c.drift, 0) / clouds.length
      )}s">${clouds.map(cloud).join('')}</div>`
    : '';

function sceneHTML(ctx, view) {
  const sky = skyFor(view.ok ? view.condition : null, view.day);
  const [a, b, c] = sky.sky;
  const layers = [
    `<div class="ov-sky ov-sky-${sky.orb || 'none'}" style="--sky-a:${a};--sky-b:${b};--sky-c:${c};--haze:${sky.haze}"></div>`,
    sky.stars ? '<i class="ov-stars"></i>' : '',
    sky.orb ? `<i class="ov-orb ov-${sky.orb}"></i>` : '',
    deck(sky.clouds),
    sky.fx ? `<i class="ov-fx ov-fx-${sky.fx[0]}" data-level="${sky.fx[1]}"></i>` : '',
    `<div class="ov-scrim" style="--scrim:${sky.scrim}"></div>`
  ].join('');

  const hl = view.hl ? `<span class="ov-hl">${ctx.esc(view.hl)}</span>` : '';
  const top =
    `<header class="ov-top"><div class="ov-cond"><span class="ov-cond-line">` +
    `<span class="ov-ico">${glyph(ctx, view.icon)}</span>` +
    `<span class="ov-cond-text">${ctx.esc(view.label)}</span></span>${hl}</div>` +
    (view.time
      ? `<div class="ov-time"><span data-ov="time-main">${ctx.esc(view.time.main)}</span>` +
        (view.time.period
          ? `<span class="ov-period" data-ov="time-period">${ctx.esc(view.time.period)}</span>`
          : '') +
        '</div>'
      : '') +
    '</header>';

  // frosted: a transparent copy of the digits underneath carries the soft shadow (no CSS filter on large text)
  const temp = view.ok
    ? (ctx.options.frosted
        ? `<div class="ov-temp-shade" aria-hidden="true">${ctx.esc(view.temperature)}</div>`
        : '') +
      `<div class="ov-temp${ctx.options.frosted ? '' : ' ov-temp-solid'}">${ctx.esc(view.temperature)}</div>`
    : '<div class="ov-temp-space"></div>';

  const cols = view.details.length > 4 ? 3 : Math.max(1, view.details.length);
  const details = view.details.length
    ? `<footer class="ov-details" style="--ov-cols:${cols}">` +
      view.details
        .map(
          (d) =>
            `<div class="ov-detail" data-detail="${ctx.esc(d.key)}">` +
            `<span class="ov-detail-icon">${glyph(ctx, d.icon)}</span>` +
            `<span class="ov-detail-value">${ctx.esc(d.value)}</span>` +
            `<span class="ov-detail-label">${ctx.esc(d.label)}</span></div>`
        )
        .join('') +
      '</footer>'
    : '<footer class="ov-details ov-details-empty"></footer>';

  const state = view.ok ? '' : ' data-unavailable="true"';
  return (
    `<div class="ov-scene ov-weather-scene" data-group="${sky.group}" data-tod="${view.day ? 'day' : 'night'}"${state}>` +
    `${layers}<div class="ov-content">${top}${temp}${details}</div></div>`
  );
}

/**
 * The compact face (card option `display: tile`): condition icon, condition text and today's range on a flat
 * slate tile. Tapping it opens the full scene (the `overview-open` action).
 */
function tileHTML(ctx, view) {
  const state = view.ok ? '' : ' data-unavailable="true"';
  const range = view.hl ? `<span class="ov-tile-hl">${ctx.esc(view.hl)}</span>` : '';
  return (
    `<div class="ov-tile-face" data-group="${view.day ? 'day' : 'night'}"${state}>` +
    `<span class="ov-tile-ico">${glyph(ctx, view.icon)}</span>` +
    `<span class="ov-tile-text"><span class="ov-tile-cond">${ctx.esc(view.label)}</span>${range}</span></div>`
  );
}

export default defineOverview({
  type: 'weather',
  label: 'Weather overview',
  order: 10,
  entity: 'required',
  domains: ['weather'],
  strings,

  options: {
    sun_entity: {type: 'entity', domains: ['sun'], default: 'sun.sun'},
    details: {type: 'enum_list', values: DETAIL_KEYS, default: DEFAULT_DETAILS, max: MAX_DETAILS},
    show_time: {type: 'boolean', default: true},
    show_unit: {type: 'boolean', default: false},
    frosted: {type: 'boolean', default: true},
    daylight: {
      type: 'enum',
      values: ['auto', 'day', 'night'],
      default: 'auto',
      error: 'Weather overview daylight must be auto, day or night.'
    }
  },

  watch: (options) => [options.sun_entity],

  // Forecast subscriptions: shared, refcounted, and served from attributes.forecast when there is no websocket.
  data: ({entityId}) =>
    entityId
      ? {daily: forecastSpec(entityId, 'daily'), hourly: forecastSpec(entityId, 'hourly')}
      : {},

  render: (ctx) => sceneHTML(ctx, viewOf(ctx)),

  tile: (ctx) => tileHTML(ctx, viewOf(ctx)),

  // Only the clock changes between hass updates: patch two text nodes, never re-render. The clock shows hours and
  // minutes, so this runs when the minute changes (`align`), not once a second.
  tick: {
    every: 60000,
    align: 'minute',
    run(ctx) {
      if (!ctx.options.show_time) return;
      const {main, period} = ctx.timeParts(ctx.now());
      setText(ctx.el, '[data-ov="time-main"]', main);
      setText(ctx.el, '[data-ov="time-period"]', period);
    }
  },

  tap: {card: 'info'},
  // Opened from the weather widget or the tile: stay until the close button. The idle screensaver still wakes on a tap.
  manualClose: true
});
