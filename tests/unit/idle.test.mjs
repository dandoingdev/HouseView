import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_IDLE_SECONDS, SUSPEND_GAP_MS, createIdleManager} from '../../src/core/idle.js';

/** An idle manager on a fake clock and a fake ticker; `advance(ms)` runs one tick per second. */
function setup(opts = {}) {
  let t = 1_000_000;
  const log = [];
  let handler = null;
  let subs = 0;
  let unsubs = 0;
  const idle = createIdleManager({
    now: () => t,
    subscribe: (fn) => {
      handler = fn;
      subs++;
      return () => {
        unsubs++;
        handler = null;
      };
    },
    onActivate: () => log.push('on'),
    onDeactivate: (reason) => log.push(`off:${reason}`),
    ...opts
  });
  idle.start();
  const advance = (ms) => {
    for (let i = 0; i < ms / 1000; i++) {
      t += 1000;
      handler?.();
    }
  };
  return {
    idle,
    log,
    advance,
    get subs() {
      return subs;
    },
    get unsubs() {
      return unsubs;
    },
    get subscribed() {
      return handler !== null;
    },
    set: (value) => (t = value)
  };
}

test('activates at the timeout, not before', () => {
  const s = setup({timeout: 120});
  s.advance(119_000);
  assert.deepEqual(s.log, []);
  s.advance(1000);
  assert.deepEqual(s.log, ['on']);
  assert.equal(s.idle.active, true);
});

test('the default timeout is 120 seconds', () => {
  assert.equal(DEFAULT_IDLE_SECONDS, 120);
  const s = setup();
  s.advance(119_000);
  assert.deepEqual(s.log, []);
  s.advance(1000);
  assert.deepEqual(s.log, ['on']);
});

test('activity restarts the timer; it is ignored while active', () => {
  const s = setup({timeout: 10});
  s.advance(9000);
  assert.equal(s.idle.activity(), true);
  s.advance(9000);
  assert.deepEqual(s.log, []);
  s.advance(1000);
  assert.deepEqual(s.log, ['on']);
  assert.equal(s.idle.activity(), false);
  s.advance(30_000);
  assert.deepEqual(s.log, ['on']);
  assert.equal(s.idle.wake(), true);
  assert.deepEqual(s.log, ['on', 'off:wake']);
  s.advance(9000);
  assert.equal(s.log.length, 2);
  s.advance(1000);
  assert.equal(s.log.length, 3);
});

test('wake() while inactive does nothing; a custom reason is passed through', () => {
  const s = setup({timeout: 5});
  assert.equal(s.idle.wake('tap'), false);
  s.advance(5000);
  assert.equal(s.idle.wake('tap'), true);
  assert.deepEqual(s.log, ['on', 'off:tap']);
});

test('timeout 0 never activates; disabled never activates; configure works', () => {
  const s = setup({timeout: 0});
  s.advance(86_400_000 / 100);
  assert.deepEqual(s.log, []);
  s.idle.configure({timeout: 5});
  s.advance(5000);
  assert.deepEqual(s.log, ['on']);
  s.idle.configure({enabled: false});
  assert.deepEqual(s.log, ['on', 'off:api']);
  s.advance(60_000);
  assert.equal(s.log.length, 2);
  s.idle.configure({enabled: true});
  s.advance(5000);
  assert.deepEqual(s.log, ['on', 'off:api', 'on']);
});

test('blocked slides the deadline and wakes an active screensaver', () => {
  let busy = true;
  const s = setup({timeout: 10, blocked: () => busy});
  s.advance(60_000);
  assert.deepEqual(s.log, []);
  busy = false;
  s.advance(9000);
  assert.deepEqual(s.log, []);
  s.advance(1000);
  assert.deepEqual(s.log, ['on']);
  busy = true;
  s.advance(1000);
  assert.deepEqual(s.log, ['on', 'off:blocked']);
  // the wake restarts the timeout, and the blocker keeps sliding it
  s.advance(60_000);
  assert.equal(s.log.length, 2);
});

test('a gap between ticks counts as activity (device sleep)', () => {
  const s = setup({timeout: 10});
  s.advance(5000);
  s.set(1_000_000 + 600_000); // the tablet slept for ten minutes
  s.idle.tick();
  assert.deepEqual(s.log, []);
  s.advance(9000);
  assert.deepEqual(s.log, []);
  s.advance(1000);
  assert.deepEqual(s.log, ['on']);
  assert.ok(SUSPEND_GAP_MS >= 5000);
});

test('a gap of exactly the limit is not a suspend', () => {
  const s = setup({timeout: 8});
  s.advance(4000);
  s.set(1_000_000 + 4000 + SUSPEND_GAP_MS); // not "more than" the limit: 9 s of real idleness
  s.idle.tick();
  assert.deepEqual(s.log, ['on']);
});

test('hidden deactivates at once; visible counts as activity; one subscription', () => {
  const s = setup({timeout: 10});
  s.advance(10_000);
  assert.deepEqual(s.log, ['on']);
  s.idle.visibility(true);
  assert.deepEqual(s.log, ['on', 'off:hidden']);
  s.idle.visibility(false);
  s.advance(9000);
  assert.equal(s.log.length, 2);
  assert.equal(s.subs, 1);
  s.idle.dispose();
  assert.equal(s.unsubs, 1);
});

test('becoming visible while idle restarts the timeout', () => {
  const s = setup({timeout: 10});
  s.advance(8000);
  s.idle.visibility(false);
  s.advance(8000);
  assert.deepEqual(s.log, []);
  s.advance(2000);
  assert.deepEqual(s.log, ['on']);
});

test('activate() forces the screensaver; onTick piggybacks on the same tick', () => {
  const ticks = [];
  const s = setup({timeout: 0, onTick: (now, active) => ticks.push(active)});
  assert.equal(s.idle.activate(), true);
  assert.equal(s.idle.activate(), false);
  assert.deepEqual(s.log, ['on']);
  s.advance(3000);
  assert.deepEqual(ticks, [true, true, true]);
});

test('start() twice still subscribes once; stop() and dispose() unsubscribe', () => {
  const s = setup({timeout: 5});
  s.idle.start();
  assert.equal(s.subs, 1);
  s.idle.stop();
  assert.equal(s.subscribed, false);
  s.idle.stop(); // idempotent
  assert.equal(s.unsubs, 1);
  s.idle.start();
  assert.equal(s.subs, 2);
  s.advance(5000);
  s.idle.dispose();
  assert.deepEqual(s.log, ['on', 'off:dispose']);
  assert.equal(s.unsubs, 2);
});

test('the idle manager owns no timers', () => {
  const real = {setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout};
  const ours = [];
  const spy =
    (name) =>
    (...args) => {
      // the test runner has timers of its own: only count the ones created from src/core
      if (new Error().stack.includes('/src/core/')) ours.push(name);
      return real[name](...args);
    };
  globalThis.setInterval = spy('setInterval');
  globalThis.setTimeout = spy('setTimeout');
  try {
    const s = setup({timeout: 5});
    s.advance(10_000);
    s.idle.dispose();
  } finally {
    Object.assign(globalThis, real);
  }
  assert.deepEqual(ours, []);
});
