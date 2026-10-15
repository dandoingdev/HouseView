// Idle detection for the screensaver. Pure logic: no DOM, no timers of its own.
// The host feeds it ticks from the shared 1 s ticker (core/ticker.js) and activity from its listeners.
// Deadline based (`now - lastActivity >= timeout`), so it survives device sleep and needs no per-card timer.

export const DEFAULT_IDLE_SECONDS = 120;
/** A gap this long between two ticks means the page was suspended (hidden tab, device sleep): count it as activity. */
export const SUSPEND_GAP_MS = 5000;

/**
 * @param {Object} o
 * @param {(tick:=>void)=>(=>void)} o.subscribe   adds `tick` to the shared ticker, returns the unsubscribe function
 * @param {=>number} [o.now]                         Date.now by default; tests inject a fake clock
 * @param {=>boolean} [o.blocked]                    true while something else owns the screen (edit mode, gallery, alarm, pending call)
 * @param {=>void} o.onActivate
 * @param {(reason:string)=>void} o.onDeactivate       'wake' | 'blocked' | 'hidden' | 'api' | 'dispose' (the host adds 'tap', 'key', 'auto')
 * @param {(now:number, active:boolean)=>void} [o.onTick]   piggy-back work for the same tick (overview tick hooks)
 * @param {number} [o.timeout]                         seconds; 0 = never activate by itself
 */
export function createIdleManager({
  subscribe,
  now = Date.now,
  blocked = () => false,
  onActivate,
  onDeactivate,
  onTick,
  timeout = DEFAULT_IDLE_SECONDS
}) {
  let timeoutMs = timeout * 1000;
  let enabled = true;
  let active = false;
  let lastActivity = now();
  let lastTick = lastActivity;
  let unsubscribe = null;

  const wake = (reason = 'wake') => {
    if (!active) return false;
    active = false;
    lastActivity = now(); // the idle timer restarts from the wake
    onDeactivate(reason);
    return true;
  };

  const tick = () => {
    const t = now();
    if (t - lastTick > SUSPEND_GAP_MS) lastActivity = t;
    lastTick = t;
    if (active) {
      if (blocked()) wake('blocked'); // gallery opened, alarm rang, edit mode switched on...
    } else if (enabled && timeoutMs > 0) {
      if (blocked()) {
        lastActivity = t; // being busy counts as activity: the full timeout restarts afterwards
      } else if (t - lastActivity >= timeoutMs) {
        active = true;
        onActivate();
      }
    }
    onTick?.(t, active);
  };

  const start = () => {
    lastActivity = lastTick = now();
    unsubscribe ||= subscribe(tick);
  };

  const stop = () => {
    unsubscribe?.();
    unsubscribe = null;
  };

  return {
    start,
    stop,
    /** A user event on the card. Ignored while active: only wake ends the screensaver. */
    activity() {
      if (active) return false;
      lastActivity = now();
      return true;
    },
    wake,
    /** Show immediately (preview mode, tests, `card.showScreensaver`). */
    activate() {
      if (active) return false;
      active = true;
      onActivate();
      return true;
    },
    /** document.visibilitychange: hide = deactivate quietly, show = activity. */
    visibility(hidden) {
      if (hidden) wake('hidden');
      else if (!active) lastActivity = now();
    },
    configure({timeout: seconds, enabled: on} = {}) {
      if (typeof seconds === 'number') timeoutMs = seconds * 1000;
      if (typeof on === 'boolean') enabled = on;
      if (!enabled) wake('api');
    },
    dispose() {
      wake('dispose');
      stop();
    },
    get active() {
      return active;
    },
    tick
  };
}
