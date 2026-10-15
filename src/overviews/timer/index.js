import {defineOverview} from '../../core/define-overview.js';
import {setText} from '../_shared/dom.js';
import strings from './strings.js';
import {durationParts, formatClock, parseTime, timerModel} from './model.js';
import {ringMarkup, TICKS} from './ring.js';

/** The caption's duration, "15 MIN", "45 SEC", "1 H 30 MIN", "1 H". Empty when the timer has no length. */
const durationText = (ctx, seconds) =>
  durationParts(seconds)
    .map(([unit, n]) => ctx.t(`timer_overview.unit.${unit}`, {n}))
    .join(' ');

/**
 * Everything the face shows, as plain text and numbers (not markup). render writes it, the tick hook patches it
 * in; both call this, so a patched face is always what a fresh render would have drawn.
 */
function faceOf(ctx) {
  const model = timerModel({state: ctx.state, attrs: ctx.attrs, now: ctx.now()});
  const duration = durationText(ctx, model.total);
  const clock = formatClock(model.remaining);
  let time = clock;
  let caption = duration;
  const aria = ctx.t(`timer_overview.aria.${model.status}`, {name: ctx.rawName, time: clock});
  if (model.status === 'unavailable') {
    time = ctx.t('timer_overview.unavailable');
    caption = '';
  } else if (model.status === 'paused') {
    caption = duration
      ? ctx.t('timer_overview.paused_caption', {duration})
      : ctx.t('timer_overview.paused');
  } else if (model.status === 'idle') {
    caption = ctx.t('timer_overview.ready');
  }
  return {
    status: model.status,
    lit: model.lit,
    time,
    caption,
    aria,
    long: model.status !== 'unavailable' && model.remaining >= 3600
  };
}

function sceneHTML(ctx) {
  const face = faceOf(ctx);
  return (
    `<div class="ov-scene ov-timer-scene" data-status="${face.status}" data-lit="${face.lit}" role="timer" ` +
    `aria-label="${ctx.esc(face.aria)}">` +
    `<div class="ov-timer-stage"><div class="ov-timer-ring" aria-hidden="true">${ringMarkup(face.lit)}</div>` +
    `<div class="ov-timer-face"><span class="ov-timer-time${face.long ? ' ov-timer-long' : ''}" data-ov="time">` +
    `${ctx.esc(face.time)}</span><span class="ov-timer-cap" data-ov="caption">${ctx.esc(face.caption)}</span></div>` +
    '</div></div>'
  );
}

/** Once a second: patch the text, the caption, the aria label and the lit ticks, each only when it changed. */
function refresh(ctx) {
  const scene = ctx.el?.querySelector('.ov-timer-scene');
  if (!scene) return;
  const face = faceOf(ctx);
  if (scene.dataset.status !== face.status) scene.dataset.status = face.status;
  if (scene.getAttribute('aria-label') !== face.aria) scene.setAttribute('aria-label', face.aria);
  setText(scene, '[data-ov="time"]', face.time);
  setText(scene, '[data-ov="caption"]', face.caption);
  const time = scene.querySelector('[data-ov="time"]');
  if (time && time.classList.contains('ov-timer-long') !== face.long) {
    time.classList.toggle('ov-timer-long', face.long);
  }
  if (scene.dataset.lit !== String(face.lit)) {
    scene.dataset.lit = String(face.lit);
    const ticks = scene.querySelectorAll('.ov-timer-tick');
    for (let i = 0; i < TICKS.length; i++) ticks[i]?.classList.toggle('on', i < face.lit);
  }
}

export default defineOverview({
  type: 'timer',
  label: 'Timer display',
  order: 20,
  entity: 'required',
  // An automatic display: shown by its widget, not picked from the screensaver list.
  selectable: false,
  domains: ['timer'],
  strings,

  // Never started by idle time: it comes up by itself while the timer runs (see docs/overview-api.md).
  activation: 'event',
  // 'active' alone is not enough: after a sleep, or with a late 'idle' from Home Assistant, the state can still say
  // 'active' for a timer whose finishes_at is long past. That timer is over; the display must not pop up for it.
  autoShow: (ctx) => {
    if (ctx.state?.state !== 'active') return false;
    const finish = parseTime(ctx.attrs?.finishes_at);
    return finish === null || finish > ctx.now();
  },
  // It goes when the timer is over or cancelled. A paused timer keeps it (it says PAUSED).
  autoWake: (ctx) => ctx.state?.state !== 'active' && ctx.state?.state !== 'paused',

  options: {},

  render: (ctx) => sceneHTML(ctx),

  afterRender: refresh,
  tick: {every: 1000, run: refresh},

  tap: {card: 'info'}
});
