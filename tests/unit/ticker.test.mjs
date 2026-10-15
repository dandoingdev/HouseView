// The shared ticker: one interval for any number of subscribers, paused while hidden, injectable clock.
import {afterEach, beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as ticker from '../../src/core/ticker.js';

/** A fake environment: manual interval, clock and document visibility. */
function fakeEnvironment() {
  const env = {
    intervals: new Map(),
    nextHandle: 1,
    time: 1000,
    hidden: false,
    listeners: new Set(),
    setIntervalCalls: 0,
    clearIntervalCalls: 0
  };
  env.api = {
    setInterval: (fn, ms) => {
      env.setIntervalCalls++;
      const handle = env.nextHandle++;
      env.intervals.set(handle, {fn, ms});
      return handle;
    },
    clearInterval: (handle) => {
      env.clearIntervalCalls++;
      env.intervals.delete(handle);
    },
    now: () => env.time,
    hidden: () => env.hidden,
    onVisibility: (listener) => {
      env.listeners.add(listener);
      return () => env.listeners.delete(listener);
    }
  };
  /** One second passes: every live interval fires. */
  env.advance = (ms = 1000) => {
    env.time += ms;
    for (const {fn} of [...env.intervals.values()]) fn();
  };
  env.setHidden = (hidden) => {
    env.hidden = hidden;
    for (const listener of [...env.listeners]) listener();
  };
  return env;
}

let env;
beforeEach(() => {
  ticker._reset();
  env = fakeEnvironment();
  ticker._configure(env.api);
});
afterEach(() => ticker._reset());

describe('one shared interval', () => {
  it('creates nothing until someone subscribes', () => {
    assert.equal(env.intervals.size, 0);
    assert.equal(ticker.subscriberCount(), 0);
  });

  it('many subscribers share one 1000 ms interval', () => {
    const a = ticker.subscribe(() => {});
    const b = ticker.subscribe(() => {});
    const c = ticker.subscribe(() => {});
    assert.equal(env.intervals.size, 1);
    assert.equal(env.setIntervalCalls, 1);
    assert.equal([...env.intervals.values()][0].ms, 1000);
    assert.equal(ticker.subscriberCount(), 3);
    assert.ok(a && b && c, 'tokens are truthy');
    assert.equal(new Set([a, b, c]).size, 3);
  });

  it('the interval is cleared with the last subscriber', () => {
    const a = ticker.subscribe(() => {});
    const b = ticker.subscribe(() => {});
    ticker.unsubscribe(a);
    assert.equal(env.intervals.size, 1);
    ticker.unsubscribe(b);
    assert.equal(env.intervals.size, 0);
    assert.equal(env.clearIntervalCalls, 1);
    assert.equal(env.listeners.size, 0, 'the visibility listener goes with it');
  });

  it('a later subscribe starts a fresh interval', () => {
    ticker.unsubscribe(ticker.subscribe(() => {}));
    ticker.subscribe(() => {});
    assert.equal(env.intervals.size, 1);
    assert.equal(env.setIntervalCalls, 2);
  });

  it('unknown, repeated and null tokens are ignored', () => {
    const token = ticker.subscribe(() => {});
    ticker.unsubscribe(null);
    ticker.unsubscribe(undefined);
    ticker.unsubscribe(9999);
    ticker.unsubscribe(token);
    ticker.unsubscribe(token);
    assert.equal(ticker.subscriberCount(), 0);
    assert.equal(env.clearIntervalCalls, 1);
  });

  it('refuses a callback that is not a function', () => {
    assert.throws(() => ticker.subscribe('x'), TypeError);
  });
});

describe('ticks', () => {
  it('every subscriber gets each tick with the clock value', () => {
    const seen = [];
    ticker.subscribe((now) => seen.push(['a', now]));
    ticker.subscribe((now) => seen.push(['b', now]));
    env.advance();
    env.advance();
    assert.deepEqual(seen, [
      ['a', 2000],
      ['b', 2000],
      ['a', 3000],
      ['b', 3000]
    ]);
  });

  it('a subscriber removed during a tick is not called again', () => {
    const calls = [];
    const token = ticker.subscribe(() => calls.push('first'));
    ticker.subscribe(() => {
      calls.push('second');
      ticker.unsubscribe(token);
    });
    env.advance();
    env.advance();
    assert.deepEqual(calls, ['first', 'second', 'second']);
  });

  it('a throwing subscriber is logged once and never stops the others', () => {
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args);
    try {
      let good = 0;
      ticker.subscribe(() => {
        throw new Error('boom');
      });
      ticker.subscribe(() => good++);
      env.advance();
      env.advance();
      env.advance();
      assert.equal(good, 3);
      assert.equal(logged.length, 1);
    } finally {
      console.error = original;
    }
  });

  it('_pump runs one tick now and _count reports subscribers', () => {
    let n = 0;
    ticker.subscribe(() => n++);
    ticker._pump();
    assert.equal(n, 1);
    assert.equal(ticker._count(), 1);
  });
});

describe('hidden documents', () => {
  it('stop the interval, and resume with one immediate tick', () => {
    let n = 0;
    ticker.subscribe(() => n++);
    env.advance();
    assert.equal(n, 1);
    env.setHidden(true);
    assert.equal(env.intervals.size, 0, 'no timer while hidden');
    env.time += 60000;
    assert.equal(n, 1, 'no work while hidden');
    env.setHidden(false);
    assert.equal(n, 2, 'one immediate tick on becoming visible');
    assert.equal(env.intervals.size, 1);
    env.advance();
    assert.equal(n, 3);
  });

  it('subscribing while hidden waits for visibility', () => {
    env.hidden = true;
    let n = 0;
    ticker.subscribe(() => n++);
    assert.equal(env.intervals.size, 0);
    env.setHidden(false);
    assert.equal(n, 1);
    assert.equal(env.intervals.size, 1);
  });

  it('becoming visible with no subscribers does nothing', () => {
    env.setHidden(false);
    assert.equal(env.intervals.size, 0);
  });

  it('hidden and the last subscriber leaves: nothing to clean up twice', () => {
    const token = ticker.subscribe(() => {});
    env.setHidden(true);
    ticker.unsubscribe(token);
    assert.equal(env.clearIntervalCalls, 1);
  });
});

describe('environment seams', () => {
  it('_configure while running moves the interval to the new environment', () => {
    ticker.subscribe(() => {});
    const second = fakeEnvironment();
    ticker._configure(second.api);
    assert.equal(env.intervals.size, 0);
    assert.equal(second.intervals.size, 1);
  });

  it('_reset drops subscribers and restores the real environment', () => {
    ticker.subscribe(() => {});
    ticker._reset();
    assert.equal(ticker.subscriberCount(), 0);
    assert.equal(env.intervals.size, 0);
  });

  it('the real environment works in Node (no document, real timers)', async () => {
    ticker._reset();
    let n = 0;
    const token = ticker.subscribe(() => n++);
    ticker._pump();
    assert.equal(n, 1);
    ticker.unsubscribe(token);
    assert.equal(ticker.subscriberCount(), 0);
  });

  it('looks setInterval up at call time (the browser harness replaces it)', () => {
    ticker._reset();
    const original = globalThis.setInterval;
    const created = [];
    globalThis.setInterval = (fn, ms) => {
      created.push(ms);
      return 42;
    };
    const clears = [];
    const originalClear = globalThis.clearInterval;
    globalThis.clearInterval = (h) => clears.push(h);
    try {
      const token = ticker.subscribe(() => {});
      ticker.unsubscribe(token);
    } finally {
      globalThis.setInterval = original;
      globalThis.clearInterval = originalClear;
    }
    assert.deepEqual(created, [1000]);
    assert.deepEqual(clears, [42]);
  });
});
