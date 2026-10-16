// Tap / hold / double-tap detection for a widget that configures hold_action or double_tap_action
// (opt-in HA tranche, docs/architecture.md). Pure logic fed with pointer events: no DOM access, timers
// and the clock are injectable, so it runs in plain Node tests.
//
//   const gesture = createGestureDetector({
//     hold: true, doubleTap: true,
//     onTap, onHold, onDoubleTap,
//     suppressClick: (until) => { card._suppressClickUntil = until; }   // the existing swipe seam
//   });
//   element.addEventListener('pointerdown', gesture.down);  // ...move, up, cancel
//
// A press that moves more than 10 px is not a gesture (it is a swipe or a scroll). Once the detector handles a
// press it asks the host to suppress the click that follows, so the tile's own action does not also run.

export const HOLD_MS = 500;
export const DOUBLE_TAP_MS = 250;
export const MOVE_TOLERANCE_PX = 10;
const CLICK_SUPPRESS_MS = 400;

/**
 * @param {Object} options
 * @param {boolean} [options.hold]        a hold action is configured
 * @param {boolean} [options.doubleTap]   a double tap action is configured
 * @param { => void} [options.onTap]
 * @param { => void} [options.onHold]
 * @param { => void} [options.onDoubleTap]
 * @param {(until: number) => void} [options.suppressClick]   called with the time until which clicks are dead
 * @param { => number} [options.now]
 * @param {typeof setTimeout} [options.setTimer]
 * @param {typeof clearTimeout} [options.clearTimer]
 */
export function createGestureDetector({
  hold = false,
  doubleTap = false,
  onTap,
  onHold,
  onDoubleTap,
  suppressClick,
  now = () => Date.now(),
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (id) => globalThis.clearTimeout(id)
} = {}) {
  let start = null; // {x, y} of the press in progress
  let holdTimer = null;
  let tapTimer = null; // a tap waiting to learn whether a second one follows
  let consumed = false; // the press in progress already produced a hold

  const suppress = () => suppressClick?.(now() + CLICK_SUPPRESS_MS);

  const stopHold = () => {
    if (holdTimer !== null) clearTimer(holdTimer);
    holdTimer = null;
  };
  const stopTap = () => {
    if (tapTimer !== null) clearTimer(tapTimer);
    tapTimer = null;
  };

  function down(event) {
    // a second pointer (pinch) or a non-primary mouse button is not a tap
    if (event.pointerType === 'mouse' && event.button !== undefined && event.button !== 0) return;
    start = {x: event.clientX, y: event.clientY};
    consumed = false;
    stopHold();
    if (hold) {
      holdTimer = setTimer(() => {
        holdTimer = null;
        if (!start) return;
        consumed = true;
        suppress();
        onHold?.();
      }, HOLD_MS);
    }
  }

  function move(event) {
    if (!start || consumed) return;
    const far = Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE_PX;
    if (far) cancel();
  }

  function up() {
    if (!start) return;
    const wasHold = consumed;
    start = null;
    consumed = false;
    stopHold();
    suppress();
    if (wasHold) return;
    if (!doubleTap) {
      onTap?.();
      return;
    }
    if (tapTimer !== null) {
      stopTap();
      onDoubleTap?.();
      return;
    }
    tapTimer = setTimer(() => {
      tapTimer = null;
      onTap?.();
    }, DOUBLE_TAP_MS);
  }

  function cancel() {
    start = null;
    consumed = false;
    stopHold();
  }

  /** Forget everything in flight (the card was disconnected or re-rendered). */
  function dispose() {
    cancel();
    stopTap();
  }

  return {down, move, up, cancel, dispose};
}
