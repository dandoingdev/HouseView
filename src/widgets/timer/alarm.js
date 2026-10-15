// The timer alarm: a card-level banner ("Kitchen timer finished · Tap to dismiss") plus the chime, hosted by the
// generic extension host (docs/widget-api.md). The host owns WHEN things happen; this file owns WHAT.
//
// State lives at `card._ext.timer` = {alarm, audio, states}; the original names `_alarm`, `_audio`, `_timerStates`
// and `_ring` are compat accessors onto it.
//   alarm   true while the banner shows
//   audio   the AudioContext, created lazily after a pointerdown, closed on disconnect
//   states  entity id -> {state, finish}: what the previous hass said, for finish detection
import {closeAudio, ring, unlockAudio} from './audio.js';

/** A countdown that ended this close to its `finishes_at` counts as "finished" (rather than cancelled). */
const FINISH_WINDOW_MS = 10000;

/**
 * Compare the new state of a timer with what was seen before and raise the alarm when an active timer has just
 * gone idle at its finish time. The previous state is kept here (not taken from Home Assistant's old state
 * object) because a hass update may mutate its state objects in place.
 * @param {{alarm: boolean, audio: AudioContext|null, states: Object}} ext
 * @param {string} entityId
 * @param {Object|undefined} state   the entity's new state object
 * @param {number} [now]
 * @returns {boolean} true when the alarm was raised
 */
export function noteTimerState(ext, entityId, state, now = Date.now()) {
  const previous = ext.states[entityId];
  let rang = false;
  if (
    previous?.state === 'active' &&
    state?.state === 'idle' &&
    Math.abs(now - new Date(previous.finish).valueOf()) < FINISH_WINDOW_MS
  ) {
    ext.alarm = true;
    ring(ext.audio);
    rang = true;
  }
  ext.states[entityId] = {state: state?.state, finish: state?.attributes?.finishes_at};
  return rang;
}

/** The banner; '' when no alarm is showing. It is a button so any tap (or Enter) dismisses it. */
function overlay(ctx) {
  if (!ctx.ext?.alarm) return '';
  return `<button class="timer-alarm" data-action="dismiss-alarm" role="alert">${ctx.esc(ctx.t('timer.alarm'))}</button>`;
}

export default {
  state: () => ({alarm: false, audio: null, states: {}}),
  compat: {
    _alarm: {
      get: (card) => card._ext.timer.alarm,
      set: (card, v) => (card._ext.timer.alarm = v)
    },
    _audio: {
      get: (card) => card._ext.timer.audio,
      set: (card, v) => (card._ext.timer.audio = v)
    },
    _timerStates: {
      get: (card) => card._ext.timer.states,
      set: (card, v) => (card._ext.timer.states = v)
    },
    _ring: {get: (card) => () => ring(card._ext.timer.audio)}
  },
  overlay,
  // A first touch anywhere on the card unlocks audio, but only when a timer widget is configured.
  onPointerDown(ctx) {
    if (ctx.config?.widgets?.some((w) => w.type === 'timer')) unlockAudio(ctx.ext);
  },
  // Re-renders keep the unlocked context (a new one would need another gesture); leaving the page closes it.
  dispose(ctx) {
    if (ctx.reason === 'disconnect') closeAudio(ctx.ext);
  },
  actions: {
    'dismiss-alarm': {
      immediate: true,
      run(ctx) {
        ctx.ext.alarm = false;
        ctx.q('.timer-alarm')?.remove();
      }
    }
  }
};
