/* global EventTarget, Event, document, window */
import test from 'node:test';
import assert from 'node:assert/strict';
import {controlIdleMixin} from '../../src/controller/control-idle.js';
import * as ticker from '../../src/core/ticker.js';

function setup(t, seconds = 5) {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const prior = {document: globalThis.document, window: globalThis.window};
  globalThis.document = Object.assign(new EventTarget(), {hidden: false});
  globalThis.window = new EventTarget();
  ticker._configure({setInterval: () => 1, clearInterval: () => {}, onVisibility: () => () => {}});
  const card = Object.assign(
    {
      isConnected: true,
      _config: {control_timeout: seconds},
      _pending: new Set(),
      shadowRoot: new EventTarget()
    },
    controlIdleMixin
  );
  let closed = 0;
  card._closeHouseModes = () => {
    closed++;
    card._houseModes = null;
    card._controlIdleSync();
  };
  card._closeQuickActions = () => {
    closed++;
    card._quickActions = null;
    card._controlIdleSync();
  };
  const open = () => {
    card._screensaver = {
      active: {entry: {manual: true}},
      idle: {
        wake: () => {
          closed++;
          card._screensaver.active = null;
          card._controlIdleSync();
        }
      }
    };
    card._controlIdleSync();
  };
  const advance = (seconds) => {
    for (let i = 0; i < seconds; i++) {
      now += 1000;
      ticker._pump();
    }
  };
  const fire = (target, type, pointerId = 1) =>
    target.dispatchEvent(Object.assign(new Event(type), {pointerId}));
  t.after(() => {
    card._controlIdleStop();
    ticker._reset();
    for (const [key, value] of Object.entries(prior))
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
  });
  return {card, open, advance, fire, closed: () => closed};
}

test('manual controls close after the default 30 seconds without allocating a timer on the dashboard', (t) => {
  const {card, open, advance, closed} = setup(t, undefined);
  card._config = {};
  card._controlIdleSync();
  assert.equal(ticker.subscriberCount(), 0);
  open();
  assert.equal(ticker.subscriberCount(), 1);
  advance(29);
  assert.equal(closed(), 0);
  advance(1);
  assert.equal(closed(), 1);
  assert.equal(ticker.subscriberCount(), 0);
});

test('input, scrolling, keyboard and outside pointer release restart idle time; hover does not', (t) => {
  const {card, open, advance, fire, closed} = setup(t);
  open();
  for (const type of ['input', 'change', 'keydown', 'wheel', 'click']) {
    advance(4);
    fire(card.shadowRoot, type);
  }
  fire(card.shadowRoot, 'pointerdown');
  advance(50);
  assert.equal(closed(), 0);
  fire(document, 'pointerup');
  advance(4);
  assert.equal(closed(), 0);
  fire(card.shadowRoot, 'pointermove');
  advance(1);
  assert.equal(closed(), 1);
});

test('quick actions and routine review expire, while busy commands and running/verifying routines defer closure', (t) => {
  const {card, advance, closed} = setup(t);
  card._quickActions = {open: true, busy: new Set(['x'])};
  card._controlIdleSync();
  advance(40);
  assert.equal(closed(), 0);
  card._quickActions.busy.clear();
  advance(5);
  assert.equal(closed(), 1);
  card._houseModes = {open: true, routine: {stage: 'running'}};
  card._controlIdleSync();
  advance(40);
  assert.equal(closed(), 1);
  card._houseModes.routine.stage = 'verifying';
  advance(40);
  assert.equal(closed(), 1);
  card._houseModes.routine.stage = 'result';
  card._pending.add('command');
  advance(40);
  assert.equal(closed(), 1);
  card._pending.clear();
  advance(4);
  assert.equal(closed(), 1);
  advance(1);
  assert.equal(closed(), 2);
  assert.equal(ticker.subscriberCount(), 0);
});

test('visibility, blur, target replacement and disconnect release held pointers and stale subscriptions', (t) => {
  const {card, open, advance, fire, closed} = setup(t);
  open();
  fire(card.shadowRoot, 'pointerdown');
  fire(window, 'blur');
  advance(5);
  assert.equal(closed(), 1);
  open();
  fire(card.shadowRoot, 'pointerdown');
  document.hidden = true;
  fire(document, 'visibilitychange');
  advance(40);
  assert.equal(closed(), 1);
  document.hidden = false;
  fire(document, 'visibilitychange');
  advance(4);
  assert.equal(closed(), 1);
  const old = card._controlIdle;
  card._screensaver.active = {entry: {manual: true}};
  card._controlIdleSync();
  assert.notEqual(card._controlIdle, old);
  assert.equal(ticker.subscriberCount(), 1);
  advance(4);
  assert.equal(closed(), 1);
  card.isConnected = false;
  card._controlIdleSync();
  assert.equal(ticker.subscriberCount(), 0);
  advance(50);
  assert.equal(closed(), 1);
});

test('disabled timeout, automatic displays and editor previews never allocate an idle control lease', (t) => {
  const {card, open} = setup(t, 0);
  open();
  assert.equal(card._controlIdle, null);
  card._config.control_timeout = 5;
  card._screensaver.active.entry.manual = false;
  card._controlIdleSync();
  assert.equal(card._controlIdle, null);
  card._screensaver.active.entry = {manual: true, preview: true};
  card._controlIdleSync();
  assert.equal(card._controlIdle, null);
  card._screensaver.active = null;
  card._houseModes = {open: true, preview: true};
  card._controlIdleSync();
  assert.equal(card._controlIdle, null);
  card._houseModes.preview = false;
  card.editMode = true;
  card._controlIdleSync();
  assert.equal(card._controlIdle, null);
  assert.equal(ticker.subscriberCount(), 0);
});

test('timing out a mode confirmation cancels it before beginning the close animation', (t) => {
  const {card, advance} = setup(t);
  const order = [];
  card._houseModes = {open: true};
  card._disposeHouseModeRequest = () => order.push('cancel');
  card._closeHouseModes = () => {
    order.push('close');
    card._houseModes = null;
    card._controlIdleSync();
  };
  card._controlIdleSync();
  advance(5);
  assert.deepEqual(order, ['cancel', 'close']);
});
