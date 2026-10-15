// Minimal browser-ish environment for running widget render code in plain Node.
//
// Render functions must be pure strings, so almost nothing is needed: the media artwork helpers read
// `window.location.origin`, and date-like widgets read `new Date`. Everything else is deliberately absent
// (or a throwing trap, see `trapDom`) so accidental DOM use in a render function is caught.

import process from 'node:process';

export const ORIGIN = 'http://127.0.0.1:8123';

/** The fixed clock shared with tools/style-snapshot.html: 2026-10-15 10:10 in Europe/London (BST). */
export const FIXED_NOW = Date.UTC(2026, 9, 15, 9, 10, 0);

/** Make Intl/Date output independent of the machine zone. Call before any Date is formatted. */
export function pinTimeZone(zone = 'Europe/London') {
  process.env.TZ = zone;
}

/** Install a `window` with a location when none exists. Returns a restore function. */
export function installWindow(origin = ORIGIN) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const url = new URL(origin);
  globalThis.window = {
    location: {
      origin: url.origin,
      href: url.href,
      protocol: url.protocol,
      host: url.host,
      hostname: url.hostname
    },
    // the confirm seam looks window.confirm up at call time; tests decide per case, the default declines
    confirm: () => false
  };
  return () => {
    if (had) Object.defineProperty(globalThis, 'window', had);
    else delete globalThis.window;
  };
}

/**
 * Freeze `new Date` / `Date.now` at `ms`. Returns a restore function.
 * Explicit-argument constructors and statics still work.
 */
export function freezeDate(ms = FIXED_NOW) {
  const Real = globalThis.Date;
  class FrozenDate extends Real {
    constructor(...args) {
      if (args.length === 0) super(ms);
      else super(...args);
    }
    static now() {
      return ms;
    }
  }
  globalThis.Date = FrozenDate;
  return () => {
    globalThis.Date = Real;
  };
}

/**
 * Run `fn` with a frozen clock and a window stub, restoring both afterwards (sync or async).
 * @template T
 * @param { => T} fn
 * @param {{now?: number, origin?: string}} [opts]
 * @returns {T}
 */
export function withEnv(fn, {now = FIXED_NOW, origin = ORIGIN} = {}) {
  const restoreWindow = installWindow(origin);
  const restoreDate = freezeDate(now);
  const done = () => {
    restoreDate();
    restoreWindow();
  };
  let result;
  try {
    result = fn();
  } catch (e) {
    done();
    throw e;
  }
  if (result && typeof result.then === 'function') return /** @type {any} */ (result.finally(done));
  done();
  return result;
}

/**
 * While `fn` runs, any use of `document` throws and `window` only exposes `location`. Used by the contract
 * suite to prove render functions do not touch the DOM. Returns the list of violations as well as the result.
 * @template T
 * @param { => T} fn
 * @returns {{result: T, violations: string[]}}
 */
export function trapDom(fn) {
  const violations = [];
  const realWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const realDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const location = globalThis.window?.location;
  const deny = (what) => {
    violations.push(what);
    throw new Error(`render touched ${what}`);
  };
  const trap = (name) =>
    new Proxy(function () {}, {
      get: (_, key) => deny(`${name}.${String(key)}`),
      set: (_, key) => deny(`${name}.${String(key)} (write)`),
      apply: () => deny(`${name}()`)
    });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: trap('document')
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: new Proxy(
      {location},
      {
        get: (target, key) => (key in target ? target[key] : deny(`window.${String(key)}`)),
        set: (_, key) => deny(`window.${String(key)} (write)`)
      }
    )
  });
  try {
    return {result: fn(), violations};
  } finally {
    if (realDocument) Object.defineProperty(globalThis, 'document', realDocument);
    else delete globalThis.document;
    if (realWindow) Object.defineProperty(globalThis, 'window', realWindow);
    else delete globalThis.window;
  }
}

/** Recursively freeze plain data so a render that mutates its inputs throws (modules are strict). */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}
