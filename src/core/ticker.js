// The single shared 1 s ticker. Every card (and every nested controller of a standalone card) subscribes here
// instead of owning an interval, so ten cards cost one timer.
//
//   const token = subscribe((now) => { ... });   // truthy; keep it in card._timer
//   unsubscribe(token);                           // card._timer = null
//
// The interval runs only while someone is subscribed AND the document is visible. Hidden documents do no
// work; when the page becomes visible again every subscriber gets one immediate tick. The clock, the
// interval functions and the visibility source can be replaced for tests with _configure.

const TICK_MS = 1000;

/** token -> callback */
const subscribers = new Map();
let nextToken = 1;
let handle;
let running = false;
let listening = false;
const failed = new WeakSet();

const realEnvironment = {
  // looked up at call time: the browser test harness replaces globalThis.setInterval
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h),
  now: () => Date.now(),
  hidden: () => typeof document !== 'undefined' && document.hidden === true,
  onVisibility: (listener) => {
    if (typeof document === 'undefined') return () => {};
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  }
};
let env = {...realEnvironment};
let stopListening = () => {};

/** Run every subscriber once. A failing subscriber is logged once and never stops the others. */
function tick() {
  const now = env.now();
  for (const callback of [...subscribers.values()]) {
    try {
      callback(now);
    } catch (error) {
      if (!failed.has(callback)) {
        failed.add(callback);
        console.error('[HouseView] ticker subscriber failed', error);
      }
    }
  }
}

function startInterval() {
  if (running) return;
  running = true;
  handle = env.setInterval(tick, TICK_MS);
}

function stopInterval() {
  if (!running) return;
  running = false;
  env.clearInterval(handle);
  handle = undefined;
}

function onVisibilityChange() {
  if (env.hidden()) {
    stopInterval();
    return;
  }
  if (subscribers.size) {
    startInterval();
    tick();
  }
}

function attach() {
  if (!listening) {
    listening = true;
    stopListening = env.onVisibility(onVisibilityChange);
  }
  if (!env.hidden()) startInterval();
}

function detach() {
  stopInterval();
  if (listening) {
    stopListening();
    stopListening = () => {};
    listening = false;
  }
}

/**
 * Call `callback(now)` about once a second.
 * @param {(now: number) => void} callback
 * @returns {number} a truthy token for unsubscribe
 */
export function subscribe(callback) {
  if (typeof callback !== 'function') throw new TypeError('ticker.subscribe needs a function');
  const token = nextToken++;
  subscribers.set(token, callback);
  if (subscribers.size === 1) attach();
  return token;
}

/** Stop a subscription. Unknown, null or repeated tokens are ignored. */
export function unsubscribe(token) {
  if (!subscribers.delete(token)) return;
  if (!subscribers.size) detach();
}

/** Number of live subscriptions. */
export function subscriberCount() {
  return subscribers.size;
}

// ---- test seams ------------------------------------------------------------------------------------------------

/** Run one tick now, as if the interval had fired (a hidden document still runs nothing in production). */
export function _pump() {
  tick();
}

/** Live subscriptions (alias used by the browser harnesses). */
export function _count() {
  return subscribers.size;
}

/**
 * Replace parts of the environment: {setInterval, clearInterval, now, hidden, onVisibility}.
 * Call _reset afterwards to restore the real one.
 */
export function _configure(overrides) {
  const wasRunning = running;
  detach();
  env = {...env, ...overrides};
  if (wasRunning || subscribers.size) attach();
}

/** Drop every subscriber and restore the real environment. */
export function _reset() {
  detach();
  subscribers.clear();
  env = {...realEnvironment};
}
