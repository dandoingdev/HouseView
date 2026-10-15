// Kitchen timer, in the same quiet language as the blinds and thermostat widgets: the name and a big countdown in the
// middle (a press opens more-info, where Home Assistant lets you pick any duration) and one row of plain keys underneath:
// the presets (5, 10, 15, 30 minutes) while the timer is idle, pause or resume and cancel while it runs.
//
// The countdown text is DOM work, not markup: render always writes the idle label and `refreshCountdown`
// (afterRender + a 1 s tick) fills in the time. The alarm banner, chime and finish detection live in alarm.js and
// audio.js behind the card-level `extension`.
import {defineWidget} from '../../core/define-widget.js';
import alarm, {noteTimerState} from './alarm.js';

/** Minutes offered by the preset buttons, in render order. */
const PRESET_MINUTES = [5, 10, 15, 30];

/** States in which pause/resume and cancel make sense. */
const RUNNING_STATES = ['paused', 'active'];

/** Plain line glyphs, drawn inline so they look the same with and without Home Assistant's icon set. */
const GLYPHS = {
  pause:
    '<rect x="7" y="6" width="3.4" height="12" rx="1.2"/><rect x="13.6" y="6" width="3.4" height="12" rx="1.2"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.2"/>'
};
const glyph = (name) =>
  `<svg class="ts-glyph" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[name]}</svg>`;

const presetButton = (ctx, minutes) =>
  ctx.btn(
    `timer-start-${minutes}`,
    `<span class="preset-number">${minutes}</span><span class="preset-unit">${ctx.esc(ctx.t('timer.unit_min'))}</span>`,
    'timer-preset ts-preset'
  );

/** Pause, or Resume when the timer is paused. Both are disabled unless the timer is running or paused. */
function pauseResumeButton(ctx, running) {
  const paused = ctx.state?.state === 'paused';
  const label = paused ? ctx.t('timer.resume') : ctx.t('timer.pause');
  return ctx.btn(
    paused ? 'timer-resume' : 'timer-pause',
    `${glyph(paused ? 'play' : 'pause')}<span class="sr">${ctx.esc(label)}</span>`,
    'ts-key',
    running
  );
}

const cancelButton = (ctx, running) =>
  ctx.btn(
    'timer-cancel',
    `${glyph('stop')}<span class="sr">${ctx.esc(ctx.t('timer.cancel'))}</span>`,
    'ts-key',
    running
  );

/** "m:ss" for the seconds left until `finishesAt`, never below 0:00. */
function timeLeft(finishesAt, now) {
  const seconds = Math.max(0, Math.ceil((new Date(finishesAt).valueOf() - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** What the countdown shows: unavailable, Ready, the live time, the paused remainder, or the raw state. */
function countdownText(ctx) {
  if (!ctx.ok) return ctx.t('state.unavailable');
  const {state, attrs} = ctx;
  if (state.state === 'idle') return ctx.t('timer.ready');
  // An active timer counts down to finishes_at; a paused one reports `remaining` as "H:MM:SS".
  if (state.state === 'active' && attrs.finishes_at) return timeLeft(attrs.finishes_at, Date.now());
  return attrs.remaining || state.state;
}

/** Write the countdown into the mounted tile. Idempotent; does nothing when the tile is not on the page. */
function refreshCountdown(ctx) {
  const target = ctx.el?.querySelector('[data-timer]');
  if (!target) return;
  const text = countdownText(ctx);
  if (target.textContent !== text) target.textContent = text;
}

export default defineWidget({
  type: 'timer',
  label: 'Timer',
  order: 150,
  layoutRoles: ['timer'],

  render(ctx) {
    const running = ctx.ok && RUNNING_STATES.includes(ctx.state?.state);
    const presets = PRESET_MINUTES.map((minutes) => presetButton(ctx, minutes)).join('');
    const keys = pauseResumeButton(ctx, running) + cancelButton(ctx, running);
    // The middle is one big key: it opens more-info (custom durations live there).
    const main = ctx.btn(
      'info',
      `<strong class="ts-name">${ctx.name}</strong>` +
        `<span class="timer-remaining ts-time" data-timer="${ctx.esc(ctx.entityId)}">${ctx.esc(ctx.ok ? ctx.t('timer.ready') : ctx.t('state.unavailable'))}</span>` +
        `<span class="sr">${ctx.esc(ctx.t('timer.custom_suffix'))}</span>`,
      'ts-main',
      ctx.ok
    );
    return ctx.root(
      'section',
      `timer-panel timer-simple ${running ? 'is-running' : 'is-idle'}`,
      `${main}<div class="timer-presets ts-presets">${presets}</div><div class="transport ts-keys">${keys}</div>`
    );
  },

  afterRender: refreshCountdown,
  tick: {every: 1000, run: refreshCountdown},

  // Finish detection: an active timer that goes idle within 10 s of its finishes_at has run out (a cancelled one
  // goes idle far from it). Runs for every configured timer, also on pages that are not showing.
  onHass(ctx, previous, next) {
    if (ctx.ext) noteTimerState(ctx.ext, ctx.entityId, next);
  },

  actions: {
    // Starting a timer on top of a running one asks first; the service restarts it with the new duration.
    'timer-start-*': {
      confirm: (ctx, id) =>
        ctx.stateOf(id)?.state !== 'idle' ? ctx.t('timer.confirm_replace') : null,
      run: (ctx, id) =>
        ctx.call('timer', 'start', {entity_id: id, duration: Number(ctx.param) * 60})
    },
    'timer-pause': {run: (ctx, id) => ctx.call('timer', 'pause', {entity_id: id})},
    // timer.start without a duration resumes a paused timer with its remaining time.
    'timer-resume': {run: (ctx, id) => ctx.call('timer', 'start', {entity_id: id})},
    'timer-cancel': {run: (ctx, id) => ctx.call('timer', 'cancel', {entity_id: id})}
  },

  extension: alarm
});
