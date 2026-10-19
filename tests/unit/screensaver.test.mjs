// The screensaver mixin (src/controller/screensaver.js) against small doubles: a fake DOM with just enough
// surface, the real shared ticker (driven by hand), the real idle manager, and Node's mock timers for
// setTimeout and Date. The real browser behaviour is covered by tests/overviews/screensaver-input.mjs.
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {
  screensaverMixin,
  isEditMode,
  FADE_OUT_MS,
  GUARD_MS,
  SWALLOW_MS,
  PREVIEW_RESHOW_SECONDS
} from '../../src/controller/screensaver.js';
import {defineOverview} from '../../src/core/define-overview.js';
import {registerOverview} from '../../src/core/overview-registry.js';
import * as ticker from '../../src/core/ticker.js';
import {demo} from './_demo-overview.mjs';

// ---- overviews used here (demo comes from _demo-overview.mjs) ----

const strings = (type) => ({
  en: {[`${type}_overview.label`]: `${type} label`, [`${type}_overview.description`]: type}
});
const ticks = [];
const scene = (ctx) => `<div class="ov-scene">${ctx.rawName}|${ctx.state?.state}</div>`;
const auto = defineOverview({
  type: 'auto',
  label: 'Auto overview',
  order: 991,
  domains: ['binary_sensor'],
  strings: strings('auto'),
  render: scene,
  autoWake: (ctx) => ctx.state?.state === 'on'
});
const ticking = defineOverview({
  type: 'ticking',
  label: 'Ticking overview',
  order: 992,
  domains: ['sensor'],
  strings: strings('ticking'),
  render: scene,
  tick: {every: 2000, run: (ctx) => ticks.push([ctx.el.className, ctx.now()])}
});
const explosive = defineOverview({
  type: 'explosive',
  label: 'Explosive overview',
  order: 993,
  domains: ['sensor'],
  strings: strings('explosive'),
  render: (ctx) => {
    if (ctx.state?.state === 'boom') throw new Error('render exploded');
    return scene(ctx);
  },
  autoWake: (ctx) => {
    if (ctx.state?.state === 'wake-boom') throw new Error('autoWake exploded');
    return false;
  },
  tick: {
    every: 1000,
    run: (ctx) => {
      if (ctx.state?.state === 'tick-boom') throw new Error('tick exploded');
    }
  }
});
const minuteRuns = [];
const minutely = defineOverview({
  type: 'minutely',
  label: 'Minutely overview',
  order: 994,
  domains: ['sensor'],
  strings: strings('minutely'),
  render: scene,
  tick: {every: 60000, align: 'minute', run: (ctx) => minuteRuns.push(ctx.now())}
});
for (const overview of [demo, auto, ticking, explosive, minutely]) registerOverview(overview);

// ---- fake DOM ----

class FakeElement {
  constructor(localName, className = '') {
    this.localName = localName;
    this.className = className;
    this.parentNode = null;
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.innerHTML = '';
    this.isConnected = true;
  }
  append(child) {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }
  addEventListener(type, fn, options) {
    (this.listeners[type] ||= []).push({fn, options});
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((l) => l.fn !== fn);
  }
  cloneNode() {
    const clone = new FakeElement(this.localName, this.className);
    clone.dataset = {...this.dataset};
    return clone;
  }
  get offsetWidth() {
    this.reflows = (this.reflows || 0) + 1;
    return 0;
  }
}

/** Dispatch a fake event to the element's own listeners (the layer's handlers all sit on the layer). */
function fire(el, type, init = {}) {
  const event = {
    type,
    stopped: false,
    prevented: false,
    stopPropagation() {
      this.stopped = true;
    },
    preventDefault() {
      this.prevented = true;
    },
    ...init
  };
  for (const {fn} of el.listeners[type] || []) fn(event);
  return event;
}

function makeLayer(html, shadowRoot) {
  const layer = new FakeElement('div', 'hv-screensaver');
  layer.html = html;
  layer.dataset.state = /data-state="(\w+)"/.exec(html)[1];
  layer.ov = new FakeElement('div', 'ov');
  layer.ov.innerHTML = /ov-mode-screensaver">(.*)<\/div><button/.exec(html)[1];
  layer.button = new FakeElement('button', 'ov-dismiss');
  layer.button.focus = () => {
    shadowRoot.activeElement = layer.button;
  };
  layer.querySelector = (selector) =>
    ({'.ov': layer.ov, '.ov-dismiss': layer.button})[selector] ?? null;
  return layer;
}

const T0 = Date.parse('2026-10-15T10:09:00+01:00');
const states = () => ({
  'sensor.a': {state: '1', attributes: {friendly_name: 'A'}},
  'sensor.b': {state: '2', attributes: {friendly_name: 'B'}},
  'sun.sun': {state: 'above_horizon', attributes: {}},
  'binary_sensor.door': {state: 'off', attributes: {}}
});

/**
 * A mixin host with a fake shell. `block` is the screensaver config; nothing is connected until `connect`.
 * Mock timers drive Date and setTimeout; `second` advances one second and pumps the shared ticker.
 */
function setup(t, {screensaver, hass = {states: states()}, reduced = false, connect = true} = {}) {
  mock.timers.enable({apis: ['setTimeout', 'Date'], now: T0});
  ticker._configure({
    setInterval: () => 1,
    clearInterval() {},
    hidden: () => false,
    onVisibility: () => () => {}
  });
  const documentListeners = [];
  const shadowRoot = {
    activeElement: null,
    listeners: [],
    addEventListener(type, fn, options) {
      this.listeners.push({type, fn, options});
    },
    removeEventListener(type, fn) {
      this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn));
    },
    querySelector: (selector) => (selector === 'ha-card.shell' && shell.attached ? shell : null)
  };
  const shell = Object.assign(new FakeElement('ha-card', 'shell'), {attached: true});
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const fakeDocument = {
    hidden: false,
    createElement(tag) {
      assert.equal(tag, 'template');
      return {
        set innerHTML(html) {
          this.content = {firstElementChild: makeLayer(html, shadowRoot)};
        }
      };
    },
    addEventListener: (type, fn) => documentListeners.push({type, fn}),
    removeEventListener: (type, fn) => {
      const at = documentListeners.findIndex((l) => l.type === type && l.fn === fn);
      if (at >= 0) documentListeners.splice(at, 1);
    }
  };
  Object.defineProperty(globalThis, 'document', {value: fakeDocument, configurable: true});
  Object.defineProperty(globalThis, 'window', {
    value: {
      matchMedia: () => ({matches: reduced}),
      requestAnimationFrame: (callback) => setTimeout(callback, 0),
      cancelAnimationFrame: (token) => clearTimeout(token)
    },
    configurable: true
  });

  const config = {widgets: [], preview_time: '2026-10-15T10:09:00+01:00'};
  if (screensaver !== undefined) config.screensaver = screensaver;
  const host = Object.create(screensaverMixin);
  Object.assign(host, {
    isConnected: false,
    shadowRoot,
    _hass: hass,
    _config: config,
    _pending: new Set(),
    patches: [],
    _patchNode(current, next, root) {
      this.patches.push(root);
      current.innerHTML = next.innerHTML;
    }
  });
  const env = {
    host,
    shell,
    shadowRoot,
    documentListeners,
    document: fakeDocument,
    config,
    get layer() {
      return shell.children.find((c) => c.className === 'hv-screensaver') ?? null;
    },
    get state() {
      return env.layer?.dataset.state ?? null;
    },
    second(n = 1) {
      for (let i = 0; i < n; i++) {
        mock.timers.tick(1000);
        ticker._pump();
      }
    },
    wait(ms) {
      // Flush the two simulated paint frames before advancing fade/guard timers.
      mock.timers.tick(0);
      mock.timers.tick(0);
      mock.timers.tick(ms);
    },
    connect() {
      host.isConnected = true;
      host._screensaverConnect();
    },
    configure() {
      host._screensaverSetConfig(host._config);
    }
  };
  t.after(() => {
    host._screensaverDisconnect();
    ticker._reset();
    mock.timers.reset();
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument);
    else delete globalThis.document;
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else delete globalThis.window;
  });
  env.configure();
  if (connect) env.connect();
  return env;
}

const block = (patch = {}) => ({type: 'demo', entity: 'sensor.a', idle_timeout: 10, ...patch});

// ---- the contract surface ----

// The controller-facing surface is part of the contract (docs/overview-api.md): names must not drift.
const INTEGRATION_POINTS = [
  '_screensaverSetConfig',
  '_screensaverConnect',
  '_screensaverDisconnect',
  '_screensaverHass',
  '_screensaverSync'
];

test('the five integration points exist and are plain methods', () => {
  for (const name of INTEGRATION_POINTS)
    assert.equal(typeof screensaverMixin[name], 'function', name);
  for (const [name, value] of Object.entries(screensaverMixin)) {
    assert.ok(
      name.startsWith('_screensaver') || name.startsWith('_overview'),
      `unexpected member ${name}`
    );
    assert.equal(typeof value, 'function');
  }
  for (const name of [
    '_screensaverBlocked',
    '_screensaverShow',
    '_screensaverHide',
    '_screensaverRender',
    '_screensaverTick',
    '_screensaverBind',
    '_screensaverContext',
    '_screensaverSession',
    '_screensaverRemoveLayer',
    '_screensaverTimeout',
    '_overviewSync',
    '_overviewDispose'
  ]) {
    assert.equal(typeof screensaverMixin[name], 'function', name);
  }
});

test('without a screensaver nothing is allocated and nothing touches the DOM', () => {
  const host = Object.create(screensaverMixin);
  host.isConnected = true;
  host.shadowRoot = new Proxy(
    {},
    {
      get() {
        throw new Error('DOM touched');
      }
    }
  );
  host._config = {widgets: []};
  host._screensaverSetConfig({widgets: []});
  assert.equal(host._screensaver, null);
  host._screensaverConnect();
  host._screensaverHass({});
  host._screensaverSync();
  host._screensaverDisconnect();
  assert.equal(host._overviewSessions, undefined);
  assert.equal(Object.hasOwn(host, '_screensaver'), true);
});

test('disabled entries behave exactly like no key at all', (t) => {
  const env = setup(t, {screensaver: [block({enabled: false}), block({enabled: false})]});
  assert.equal(env.host._screensaver, null);
  assert.equal(env.shadowRoot.listeners.length, 0);
  assert.equal(env.documentListeners.length, 0);
  assert.equal(ticker.subscriberCount(), 0);
  env.second(60);
  assert.equal(env.layer, null);
  assert.equal(env.shell.children.length, 0);
});

test('connect adds the activity listeners and one ticker subscription; disconnect removes them', (t) => {
  const env = setup(t, {screensaver: block()});
  assert.deepEqual(env.shadowRoot.listeners.map((l) => l.type).sort(), [
    'keydown',
    'pointerdown',
    'touchstart',
    'wheel'
  ]);
  for (const l of env.shadowRoot.listeners) {
    assert.equal(l.options.capture, true, 'capture, so native cards that stop events still count');
    assert.equal(l.options.passive, true);
  }
  assert.deepEqual(
    env.documentListeners.map((l) => l.type),
    ['visibilitychange']
  );
  assert.equal(ticker.subscriberCount(), 1);
  env.host._screensaverConnect(); // a second connect is harmless
  assert.equal(ticker.subscriberCount(), 1);
  assert.equal(env.shadowRoot.listeners.length, 4);

  env.host._screensaverDisconnect();
  assert.equal(env.shadowRoot.listeners.length, 0);
  assert.equal(env.documentListeners.length, 0);
  assert.equal(ticker.subscriberCount(), 0);
  env.host._screensaverDisconnect(); // and so is a second disconnect
});

test('a config that is never connected adds no listener and no ticker subscription', (t) => {
  const env = setup(t, {screensaver: block(), connect: false});
  assert.notEqual(env.host._screensaver, null);
  assert.equal(env.shadowRoot.listeners.length, 0);
  assert.equal(ticker.subscriberCount(), 0);
  env.host._screensaverDisconnect(); // never connected: nothing to remove, nothing thrown
});

// ---- activation, the first tap, the fade ----

test('activates at exactly the timeout; the layer is the last child of the shell', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(9);
  assert.equal(env.layer, null);
  env.second(1);
  assert.equal(env.state, 'on');
  assert.equal(env.shell.children.at(-1), env.layer);
  assert.match(
    env.layer.html,
    /role="dialog" aria-modal="true" aria-label="demo label"|aria-label="Demo overview"/
  );
  assert.match(env.layer.html, /class="ov-dismiss" aria-label="Dismiss screensaver"/);
  assert.equal(env.layer.ov.innerHTML, '<div class="ov-scene">A|screensaver</div>');
  assert.ok(env.layer.reflows >= 1, 'the opacity:0 start state is committed before the fade-in');
  assert.equal(env.host._screensaver.cursor, 0); // one entry: round robin wraps
});

test('the page underneath is never touched while the layer is up', (t) => {
  const env = setup(t, {screensaver: block()});
  const face = new FakeElement('div', 'face');
  env.shell.append(face);
  const before = JSON.stringify([face.className, face.innerHTML, face.dataset]);
  env.second(10);
  assert.equal(env.state, 'on');
  env.second(5);
  assert.equal(JSON.stringify([face.className, face.innerHTML, face.dataset]), before);
  assert.equal(env.shell.children[0], face);
});

test('the first tap only wakes: pointerdown and pointercancel are stopped, pointerup starts the fade', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  const layer = env.layer;
  assert.equal(fire(layer, 'pointerdown').stopped, true);
  assert.equal(env.state, 'on', 'pointerdown alone does not dismiss');
  assert.equal(fire(layer, 'pointercancel').stopped, true);
  assert.equal(env.state, 'on');
  const up = fire(layer, 'pointerup');
  assert.equal(up.stopped, true);
  assert.equal(env.state, 'leaving');
  assert.equal(
    env.layer,
    layer,
    'the layer stays in the DOM, still catching taps, through the fade'
  );
  assert.ok(env.host._suppressClickUntil >= Date.now() + SWALLOW_MS - 1);
  // the trailing click and a second tap during the fade are swallowed at the layer
  const click = fire(layer, 'click');
  assert.deepEqual([click.stopped, click.prevented], [true, true]);
  assert.equal(env.state, 'leaving');
  assert.equal(fire(layer, 'pointerdown').stopped, true);
  assert.equal(fire(layer, 'pointerup').stopped, true);
  env.wait(FADE_OUT_MS + 49);
  assert.equal(env.state, 'leaving');
  env.wait(1);
  assert.equal(env.layer, null);
});

test('a click alone also wakes (assistive technology, synthetic click)', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  const click = fire(env.layer, 'click');
  assert.equal(click.prevented, true);
  assert.equal(env.state, 'leaving');
});

test('the suppress window keeps the larger of the old and the new deadline', (t) => {
  const env = setup(t, {screensaver: block()});
  env.host._suppressClickUntil = Date.now() + 100_000;
  const far = env.host._suppressClickUntil;
  env.second(10);
  fire(env.layer, 'pointerup');
  assert.equal(env.host._suppressClickUntil, far);
});

test('the idle timer restarts from the wake', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  fire(env.layer, 'pointerup');
  env.wait(400);
  assert.equal(env.layer, null);
  env.second(9);
  assert.equal(env.layer, null);
  env.second(1);
  assert.equal(env.state, 'on');
});

test('reduced motion: no fade, but the layer still stays for the guard time', (t) => {
  const env = setup(t, {screensaver: block(), reduced: true});
  env.second(10);
  fire(env.layer, 'pointerup');
  assert.equal(env.state, 'leaving');
  env.wait(GUARD_MS - 1);
  assert.equal(env.state, 'leaving');
  env.wait(1);
  assert.equal(env.layer, null);
});

test('a new activation first removes a layer that is still fading out', (t) => {
  const env = setup(t, {screensaver: block({idle_timeout: 5, preview: true})});
  env.host._screensaverHass(); // preview: shows at once
  assert.equal(env.state, 'on');
  const first = env.layer;
  fire(first, 'pointerup');
  env.second(5); // preview re-shows after five seconds, long after the fade
  assert.notEqual(env.layer, first);
  assert.equal(env.shell.children.filter((c) => c.className === 'hv-screensaver').length, 1);
});

// ---- keyboard and focus ----

test('keyboard: Escape, Enter and Space dismiss; arrows are stopped; Tab stays on the button', (t) => {
  const env = setup(t, {screensaver: block()});
  for (const key of ['Escape', 'Enter', ' ']) {
    env.second(10);
    assert.equal(env.state, 'on', key);
    const arrow = fire(env.layer, 'keydown', {key: 'ArrowRight'});
    assert.deepEqual([arrow.stopped, arrow.prevented], [true, false]);
    assert.equal(env.state, 'on');
    const tab = fire(env.layer, 'keydown', {key: 'Tab'});
    assert.deepEqual([tab.stopped, tab.prevented], [true, true]);
    const event = fire(env.layer, 'keydown', {key});
    assert.deepEqual([event.stopped, event.prevented], [true, true]);
    assert.equal(env.state, 'leaving');
    assert.ok(env.host._suppressClickUntil > Date.now());
    env.wait(400);
    assert.equal(env.layer, null);
  }
});

test('focus moves to the dismiss button when the card had focus, and returns afterwards', (t) => {
  const env = setup(t, {screensaver: block()});
  const tile = new FakeElement('button', 'tile');
  tile.focus = () => {
    env.shadowRoot.activeElement = tile;
  };
  env.shadowRoot.activeElement = tile;
  env.second(10);
  assert.equal(env.shadowRoot.activeElement, env.layer.button);
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
  assert.equal(env.shadowRoot.activeElement, tile);
});

test('a modal takes focus without an opener and never restores a missing opener', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  assert.equal(env.shadowRoot.activeElement, env.layer.button);
  assert.equal(env.host._screensaver.active.focusReturn, null);
  fire(env.layer, 'pointerup');
  env.wait(400);
  assert.equal(env.layer, null);

  const tile = new FakeElement('button', 'tile');
  let focused = 0;
  tile.focus = () => focused++;
  env.shadowRoot.activeElement = tile;
  env.second(10);
  tile.isConnected = false; // a re-render replaced it meanwhile
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
  assert.equal(focused, 0);
});

// ---- blockers, edit mode, visibility ----

test('blockers count as activity: the timeout restarts after they clear', (t) => {
  const env = setup(t, {screensaver: block()});
  env.host._galleryOpen = true;
  env.second(60);
  assert.equal(env.layer, null);
  env.host._galleryOpen = false;
  env.second(9);
  assert.equal(env.layer, null);
  env.second(1);
  assert.equal(env.state, 'on');

  env.host._alarm = {}; // the timer alarm rings
  env.second(1);
  assert.equal(env.state, 'leaving');
  assert.equal(env.host._suppressClickUntil, undefined, 'a blocker wake swallows nothing');
  env.wait(400);
  assert.equal(env.layer, null);
  env.host._alarm = null;

  env.host._pending.add('light.x'); // a service call in flight
  env.second(60);
  assert.equal(env.layer, null);
});

test('no hass, or not connected: blocked', (t) => {
  const env = setup(t, {screensaver: block()});
  env.host._hass = undefined;
  env.second(60);
  assert.equal(env.layer, null);
  env.host._hass = {states: states()};
  env.second(10);
  assert.equal(env.state, 'on');
});

const inEdit = {localName: 'hui-card-options', parentElement: null};

test('edit mode blocks the screensaver; start_in_edit_mode overrides it', (t) => {
  const env = setup(t, {screensaver: block()});
  env.host.parentElement = inEdit;
  env.second(60);
  assert.equal(env.layer, null);
  env.host._screensaver.entries[0].startInEditMode = true;
  env.second(10);
  assert.equal(env.state, 'on');
});

test('edit mode wakes a layer that is already up', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  assert.equal(env.state, 'on');
  env.host.parentElement = inEdit; // the user switched the dashboard to edit mode
  env.second(1);
  assert.equal(env.state, 'leaving');
});

test('a preview is not held back by edit mode', (t) => {
  const env = setup(t, {screensaver: block({preview: true}), connect: false});
  env.host.parentElement = inEdit;
  env.connect();
  env.host._screensaverHass();
  assert.equal(env.state, 'on');
});

test('isEditMode finds the editor wrappers through shadow roots and fails open', () => {
  assert.equal(isEditMode({localName: 'x', parentElement: null}), false);
  assert.equal(isEditMode({localName: 'x'}), false);
  assert.equal(isEditMode(null), false);
  for (const localName of ['hui-card-options', 'hui-card-preview', 'hui-card-edit-mode']) {
    assert.equal(
      isEditMode({localName: 'a', parentElement: {localName, parentElement: null}}),
      true
    );
  }
  // across a shadow root: no parentElement, the root's host continues the walk
  const view = {localName: 'hui-view', lovelace: {editMode: true}};
  const root = {host: view};
  assert.equal(isEditMode({localName: 'a', parentElement: null, getRootNode: () => root}), true);
  assert.equal(isEditMode({localName: 'a', parentElement: {localName: 'b', editMode: true}}), true);
  assert.equal(isEditMode({localName: 'a', parentElement: {localName: 'b', preview: true}}), true);
  assert.equal(
    isEditMode({localName: 'a', parentElement: {localName: 'b', lovelace: {editMode: false}}}),
    false
  );
  assert.equal(isEditMode({localName: 'a', parentElement: null, getRootNode: () => ({})}), false);
});

test('a hidden page removes the layer at once, with no fade; visible restarts the timeout', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  assert.equal(env.state, 'on');
  const handler = env.documentListeners[0].fn;
  env.document.hidden = true;
  handler();
  assert.equal(env.layer, null);
  env.document.hidden = false;
  handler();
  env.second(9);
  assert.equal(env.layer, null);
  env.second(1);
  assert.equal(env.state, 'on');
});

test('a user event on the card is activity while idle', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(9);
  env.shadowRoot.listeners.find((l) => l.type === 'pointerdown').fn();
  env.second(9);
  assert.equal(env.layer, null);
  env.second(1);
  assert.equal(env.state, 'on');
  // ... and it is ignored while the layer is up
  env.shadowRoot.listeners.find((l) => l.type === 'keydown').fn();
  env.second(5);
  assert.equal(env.state, 'on');
});

test('a gap between ticks (device sleep) counts as activity', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(5);
  mock.timers.tick(10 * 60 * 1000); // the tablet slept
  ticker._pump();
  assert.equal(env.layer, null);
  env.second(9);
  assert.equal(env.layer, null);
  env.second(1);
  assert.equal(env.state, 'on');
});

// ---- rotation, preview ----

test('a list rotates: each activation shows the next enabled entry', (t) => {
  const env = setup(t, {
    screensaver: [
      block({entity: 'sensor.a'}),
      block({entity: 'sensor.skipped', enabled: false}),
      block({entity: 'sensor.b', idle_timeout: 20})
    ]
  });
  const seen = [];
  for (let i = 0; i < 3; i++) {
    env.second(i === 1 ? 20 : 10); // idle_timeout is read from the entry shown next
    seen.push(env.layer.ov.innerHTML);
    fire(env.layer, 'keydown', {key: 'Escape'});
    env.wait(400);
  }
  assert.deepEqual(seen, [
    '<div class="ov-scene">A|screensaver</div>',
    '<div class="ov-scene">B|screensaver</div>',
    '<div class="ov-scene">A|screensaver</div>'
  ]);
});

test('the rotation cursor survives a dismissal but not setConfig', (t) => {
  const env = setup(t, {screensaver: [block({entity: 'sensor.a'}), block({entity: 'sensor.b'})]});
  env.second(10);
  fire(env.layer, 'pointerup');
  env.wait(400);
  assert.equal(env.host._screensaver.cursor, 1);
  env.configure();
  assert.equal(env.host._screensaver.cursor, 0);
});

test('preview shows as soon as a hass and a shell exist, and returns five seconds after each dismissal', (t) => {
  const env = setup(t, {screensaver: block({preview: true, idle_timeout: 600}), hass: null});
  assert.equal(env.layer, null);
  assert.equal(env.host._screensaver.pendingShow, true);
  env.host._hass = {states: states()};
  env.host._screensaverHass();
  assert.equal(env.state, 'on');
  fire(env.layer, 'pointerup');
  env.wait(400);
  assert.equal(env.layer, null);
  env.second(PREVIEW_RESHOW_SECONDS - 1);
  assert.equal(env.layer, null);
  env.second(1);
  assert.equal(env.state, 'on');
});

test('preview with a hass and a shell shows at connect', (t) => {
  const env = setup(t, {screensaver: block({preview: true})});
  assert.equal(env.state, 'on');
});

test('preview waits for the first shell, then _screensaverSync shows it', (t) => {
  const env = setup(t, {screensaver: block({preview: true}), connect: false});
  env.shell.attached = false;
  env.connect();
  env.host._screensaverHass();
  assert.equal(env.layer, null);
  assert.equal(env.host._screensaver.pendingShow, true);
  env.shell.attached = true;
  env.host._screensaverSync();
  assert.equal(env.state, 'on');
  assert.equal(env.host._screensaver.pendingShow, false);
});

test('a pending preview is forgotten when the idle manager deactivates first', (t) => {
  const env = setup(t, {screensaver: block({preview: true}), connect: false});
  env.shell.attached = false;
  env.connect();
  assert.equal(env.host._screensaver.pendingShow, true);
  env.host._pending.add('light.x'); // a blocker deactivates the pending activation
  env.second(1);
  assert.equal(env.host._screensaver.idle.active, false);
  assert.equal(env.host._screensaver.pendingShow, false);
  env.shell.attached = true;
  env.host._screensaverSync();
  assert.equal(env.layer, null, 'no orphan layer that nothing can dismiss');
});

// ---- hass forwarding, patching, hooks ----

test('a hass update patches the scene in place, only when a watched state changed', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  const ov = env.layer.ov;
  env.host._screensaverHass();
  assert.deepEqual(env.host.patches, [], 'nothing watched changed');
  const next = states();
  next['sensor.a'] = {state: '5', attributes: {friendly_name: 'A2'}};
  env.host._hass = {states: next};
  env.host._screensaverHass();
  assert.deepEqual(
    env.host.patches,
    [true],
    'patched with root=true so the wrapper keeps its style'
  );
  assert.equal(env.layer.ov, ov);
  assert.equal(ov.innerHTML, '<div class="ov-scene">A2|screensaver</div>');
  env.host._hass = {states: {...next, 'light.unrelated': {state: 'on', attributes: {}}}};
  env.host._screensaverHass();
  assert.equal(env.host.patches.length, 1);
  env.host._hass = {states: next, locale: {language: 'de'}}; // a language change re-renders
  env.host._screensaverHass();
  assert.equal(env.host.patches.length, 2);
});

test('a watched secondary entity (sun.sun) re-renders too', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  const next = states();
  next['sun.sun'] = {state: 'below_horizon', attributes: {}};
  env.host._hass = {states: next};
  env.host._screensaverHass();
  assert.equal(env.host.patches.length, 1);
});

test('with a websocket connection the signature compares object references', (t) => {
  const hass = {connection: {}, states: states()};
  const env = setup(t, {screensaver: block(), hass});
  env.second(10);
  env.host._hass = {...hass, states: {...hass.states}}; // same state objects, new container: HA's usual shape
  env.host._screensaverHass();
  assert.equal(env.host.patches.length, 0);
  env.host._hass = {...hass, states: {...hass.states, 'sensor.a': {...hass.states['sensor.a']}}};
  env.host._screensaverHass();
  assert.equal(env.host.patches.length, 1);
});

test('forced data updates re-render even when no state changed', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  env.host._screensaverRender(true);
  assert.equal(env.host.patches.length, 1);
  env.host._screensaverRender(false);
  assert.equal(env.host.patches.length, 1);
  env.host._screensaverRender(true, {not: 'the active entry'});
  assert.equal(env.host.patches.length, 1);
});

test('autoWake dismisses with no tap swallow', (t) => {
  const env = setup(t, {
    screensaver: {type: 'auto', entity: 'binary_sensor.door', idle_timeout: 10}
  });
  env.second(10);
  assert.equal(env.state, 'on');
  env.host._screensaverHass();
  assert.equal(env.state, 'on');
  const next = states();
  next['binary_sensor.door'] = {state: 'on', attributes: {}};
  env.host._hass = {states: next};
  env.host._screensaverHass();
  assert.equal(env.state, 'leaving');
  assert.equal(env.host._suppressClickUntil, undefined);
});

test('screensaver hook age survives re-renders independently of preview_time and resets on activation', (t) => {
  const rendered = [];
  const ticked = [];
  registerOverview(
    defineOverview({
      type: 'elapsed_probe',
      label: 'Elapsed probe',
      order: 995,
      entity: 'none',
      strings: strings('elapsed_probe'),
      render: scene,
      afterRender: (ctx) => rendered.push(ctx.elapsedMs),
      tick: {every: 1000, run: (ctx) => ticked.push({elapsed: ctx.elapsedMs, display: ctx.now()})}
    })
  );
  const env = setup(t, {screensaver: {type: 'elapsed_probe', idle_timeout: 5}});
  env.second(5);
  assert.equal(rendered.at(-1), 0);
  env.second(60);
  assert.equal(ticked.at(-1).elapsed, 60_000);
  assert.equal(ticked.at(-1).display, Date.parse(env.config.preview_time));
  env.host._screensaverRender(true);
  assert.equal(rendered.at(-1), 60_000, 'data and locale re-renders retain the display age');
  env.host._screensaver.idle.wake('tap');
  env.wait(FADE_OUT_MS + GUARD_MS);
  env.second(6);
  assert.equal(rendered.at(-1), 0, 'a newly activated screensaver gets a fresh timer');
});

test('the overview tick hook runs on the shared ticker, throttled to its interval', (t) => {
  ticks.length = 0;
  const env = setup(t, {screensaver: {type: 'ticking', entity: 'sensor.a', idle_timeout: 5}});
  env.second(5);
  assert.equal(env.state, 'on');
  const shown = ticks.length;
  env.second(5);
  assert.equal(ticks.length - shown, 2, 'every 2000 ms: five more seconds give two runs');
  assert.equal(ticker.subscriberCount(), 1, 'the hook piggy-backs on the one subscription');
  const [className, now] = ticks.at(-1);
  assert.equal(className, 'ov', 'the hook receives the .ov element');
  assert.equal(now, Date.parse('2026-10-15T10:09:00+01:00'), 'ctx.now() honours preview_time');
});

test('an `align: minute` hook runs when the wall-clock minute changes, not every 60 s', (t) => {
  minuteRuns.length = 0;
  // the clock starts at 10:09:00; the hook's own clock (preview_time) is irrelevant to the alignment
  const env = setup(t, {screensaver: {type: 'minutely', entity: 'sensor.a', idle_timeout: 5}});
  env.second(5);
  assert.equal(env.state, 'on');
  assert.equal(minuteRuns.length, 1, 'runs once when the layer comes up');
  env.second(54); // 10:09:59
  assert.equal(minuteRuns.length, 1, 'nothing for the rest of the minute');
  env.second(1); // 10:10:00
  assert.equal(minuteRuns.length, 2, 'runs on the minute');
  env.second(59);
  assert.equal(minuteRuns.length, 2);
  env.second(1);
  assert.equal(minuteRuns.length, 3);
});

test('once the fade-in is over the layer covers the card; a wake uncovers it and catches the card up', (t) => {
  const env = setup(t, {screensaver: block()});
  let resumed = 0;
  env.host._resumeAfterCover = () => resumed++;
  env.second(10);
  assert.equal(env.state, 'on');
  assert.equal(
    env.host._screensaverCovered(),
    false,
    'still fading in: the card is visible underneath'
  );
  assert.equal('covered' in env.shell.dataset, false);
  env.second(1); // 500 ms after it appeared
  assert.equal(env.host._screensaverCovered(), true);
  assert.equal(
    env.shell.dataset.covered,
    '',
    'the shell is marked: styles hide everything under the layer'
  );
  env.second(5);
  assert.equal(resumed, 0, 'nothing to catch up while it is covered');
  fire(env.layer, 'pointerup');
  assert.equal(env.host._screensaverCovered(), false);
  assert.equal('covered' in env.shell.dataset, false, 'uncovered before the fade-out starts');
  assert.equal(resumed, 1, 'the card is caught up exactly once');
});

/** The card's real `_resumeAfterCover` queues neighbour prefetch. Count those frames beside the shield. */
function holdPrefetch(env) {
  const frames = new Map();
  let id = 0;
  globalThis.window.requestAnimationFrame = (callback) => {
    frames.set(++id, callback);
    return id;
  };
  globalThis.window.cancelAnimationFrame = (token) => frames.delete(token);
  env.host._prefetchFrame = 0;
  env.host._schedulePrefetch = () => {
    if (env.host._prefetchFrame) return;
    env.host._prefetchFrame = globalThis.window.requestAnimationFrame(() => {
      env.host._prefetchFrame = 0;
    });
  };
  env.host._resumeAfterCover = function () {
    this._schedulePrefetch();
  };
  return frames;
}

function pump(frames) {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback();
}

test('a covered wake holds neighbour prefetch until the shield has painted', (t) => {
  const env = setup(t, {screensaver: block()});
  const frames = holdPrefetch(env);
  env.second(11);
  assert.equal(env.host._screensaverCovered(), true);
  env.host._screensaverClose();
  assert.equal(frames.size, 1, 'only the shield frame is pending');
  assert.equal(env.host._prefetchFrame, 0, 'prefetch is not on the shield frames');
  pump(frames);
  assert.equal(frames.size, 1, 'the first shield frame only schedules the reveal');
  assert.equal(env.host._prefetchFrame, 0, 'the first shield frame still holds prefetch');
  pump(frames);
  assert.equal('waking' in env.layer.dataset, false, 'the second frame reveals the page');
  assert.ok(env.host._prefetchFrame, 'prefetch starts once the page is revealed');
});

test('disconnect during a covered wake cancels the shield frame and removes the layer', (t) => {
  const env = setup(t, {screensaver: block()});
  const frames = holdPrefetch(env);
  env.second(11);
  env.host._screensaverClose();
  assert.equal(frames.size, 1);
  env.host._screensaverDisconnect();
  assert.equal(frames.size, 0, 'the pending paint frame is cancelled');
  assert.equal(env.layer, null, 'the layer is gone');
  assert.equal(env.host._prefetchFrame, 0, 'prefetch stays unscheduled on a card that is leaving');
});

test('removing the card while it is covered unhides the shell but catches nothing up', (t) => {
  const env = setup(t, {screensaver: block()});
  let resumed = 0;
  env.host._resumeAfterCover = () => resumed++;
  env.second(11);
  assert.equal(env.host._screensaverCovered(), true);
  env.host._screensaverDisconnect();
  assert.equal('covered' in env.shell.dataset, false);
  assert.equal(resumed, 0, 'no repaint, no snapshot request for a card that is going away');
});

test('a wake before the fade-in is over never covered anything and has nothing to catch up', (t) => {
  const env = setup(t, {screensaver: block()});
  let resumed = 0;
  env.host._resumeAfterCover = () => resumed++;
  env.second(10);
  fire(env.layer, 'pointerup');
  assert.equal(resumed, 0);
  assert.equal('covered' in env.shell.dataset, false);
});

test('a shell recreated by a render is covered again; a hidden page uncovers at once', (t) => {
  const env = setup(t, {screensaver: block()});
  let resumed = 0;
  env.host._resumeAfterCover = () => resumed++;
  env.second(11);
  assert.equal(env.host._screensaverCovered(), true);
  const fresh = Object.assign(new FakeElement('ha-card', 'shell'), {attached: true});
  env.shadowRoot.querySelector = (s) => (s === 'ha-card.shell' ? fresh : null);
  env.host._screensaverSync();
  assert.equal(fresh.dataset.covered, '', 'the new shell carries the marker too');
  env.document.hidden = true;
  for (const l of env.documentListeners.filter((x) => x.type === 'visibilitychange')) l.fn();
  assert.equal(env.host._screensaverCovered(), false);
  assert.equal('covered' in fresh.dataset, false);
  assert.equal(resumed, 1);
});

test('a throwing tick hook, render or autoWake never breaks the card', (t) => {
  const log = mock.method(console, 'error', () => {});
  t.after(() => log.mock.restore());
  const hass = (state) => ({states: {...states(), 'sensor.a': {state, attributes: {}}}});
  const env = setup(t, {
    screensaver: {type: 'explosive', entity: 'sensor.a', idle_timeout: 5},
    hass: hass('1')
  });
  env.second(5);
  assert.equal(env.state, 'on');

  env.host._hass = hass('tick-boom');
  assert.doesNotThrow(() => env.second(2)); // tick hook error is logged
  env.host._hass = hass('wake-boom');
  assert.doesNotThrow(() => env.host._screensaverHass()); // autoWake error is logged
  env.host._hass = hass('boom');
  assert.doesNotThrow(() => env.host._screensaverHass()); // render error is logged
  assert.equal(env.state, 'on', 'the layer stays; the card is untouched');
  assert.ok(log.mock.callCount() >= 3);
  const messages = log.mock.calls.map((c) => String(c.arguments.at(-1)));
  assert.ok(messages.some((m) => m.includes('tick exploded')));
  assert.ok(messages.some((m) => m.includes('autoWake exploded') || m.includes('render exploded')));
});

test('the shell being recreated by a render gets the layer back', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  const layer = env.layer;
  const fresh = Object.assign(new FakeElement('ha-card', 'shell'), {attached: true});
  env.shadowRoot.querySelector = (s) => (s === 'ha-card.shell' ? fresh : null);
  env.host._screensaverSync();
  assert.equal(layer.parentNode, fresh);
  assert.equal(env.shell.children.includes(layer), false);
  env.host._screensaverSync(); // already in place: not re-appended
  assert.equal(fresh.children.length, 1);
});

// ---- setConfig, disconnect ----

test('setConfig on a live card removes the old layer and rebuilds; a preview comes back', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  assert.equal(env.state, 'on');
  const oldState = env.host._screensaver;
  const oldLayer = env.layer;
  env.config.screensaver = block({preview: true});
  env.configure();
  assert.notEqual(env.host._screensaver, oldState);
  assert.equal(oldLayer.parentNode, null, 'the old layer is gone');
  assert.equal(env.state, 'on', 'a preview shows again at once');
  assert.notEqual(env.layer, oldLayer);
  assert.equal(env.shell.children.length, 1);
  assert.equal(ticker.subscriberCount(), 1);
  assert.equal(env.shadowRoot.listeners.length, 4);
  delete env.config.screensaver;
  env.configure();
  assert.equal(env.host._screensaver, null);
  assert.equal(env.layer, null);
  assert.equal(ticker.subscriberCount(), 0);
  assert.equal(env.shadowRoot.listeners.length, 0);
});

test('removing the card while the layer is up (or fading) leaves nothing behind', (t) => {
  const env = setup(t, {screensaver: block()});
  env.second(10);
  env.host._screensaverDisconnect();
  assert.equal(env.layer, null);
  assert.equal(ticker.subscriberCount(), 0);
  assert.equal(env.documentListeners.length, 0);

  env.host.isConnected = true;
  env.host._screensaverConnect(); // moved to another place in the DOM: connects again
  env.second(10);
  fire(env.layer, 'pointerup');
  assert.equal(env.state, 'leaving');
  env.host._screensaverDisconnect();
  assert.equal(env.layer, null, 'a fading layer is removed too');
  env.wait(1000); // the fade timer was cleared: no late removal error
});

// ---- card-mode overview sessions ----

function cardEnv(t, widgets) {
  let unsubscribed = 0;
  const subscribed = [];
  const callbacks = [];
  const hass = {
    connection: {
      subscribeMessage: (callback, message) => {
        subscribed.push(`${message.entity_id}|${message.forecast_type}`);
        callbacks.push(callback);
        return Promise.resolve(() => unsubscribed++);
      }
    },
    states: {
      'weather.h': {state: 'sunny', attributes: {supported_features: 3}},
      'sensor.a': {state: '1', attributes: {}}
    }
  };
  const env = setup(t, {hass, connect: false});
  const updates = [];
  env.host._config.widgets = widgets;
  env.host._renderedCards = new Map(
    widgets.map((_, index) => [index, {update: () => updates.push(index)}])
  );
  env.host.isConnected = true;
  return {env, subscribed, callbacks, updates, unsubscribed: () => unsubscribed};
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('overview cards lease their data after a render and release it when they leave the page', async (t) => {
  const c = cardEnv(t, [
    {type: 'light', entity: 'light.a'},
    {type: 'demo_overview', entity: 'weather.h'}
  ]);
  const {host} = c.env;
  host._screensaverSync();
  await settle();
  assert.deepEqual(c.subscribed, ['weather.h|daily']);
  assert.equal(host._overviewSessions.size, 1);
  host._screensaverHass(); // sync on every hass update is idempotent
  assert.deepEqual(c.subscribed, ['weather.h|daily']);

  c.callbacks[0]({forecast: [{temperature: 3}]}); // data arrives: that card's tile updates
  assert.deepEqual(c.updates, [1]);

  host._renderedCards.delete(1); // paged away
  host._screensaverSync();
  assert.equal(host._overviewSessions.size, 0);
  c.env.wait(2000); // the subscription grace period
  await settle();
  assert.equal(c.unsubscribed(), 1);
});

test('overview card sessions are disposed on disconnect and rebuilt by the next render', async (t) => {
  const c = cardEnv(t, [{type: 'demo_overview', entity: 'weather.h'}]);
  const {host} = c.env;
  host._screensaverSync();
  await settle();
  host._screensaverDisconnect();
  assert.equal(host._overviewSessions.size, 0);
  c.env.wait(2000);
  await settle();
  assert.equal(c.unsubscribed(), 1);
  host._screensaverSync();
  await settle();
  assert.equal(host._overviewSessions.size, 1);
  assert.equal(c.subscribed.length, 2);
});

test('an entity change on an overview card swaps the lease', async (t) => {
  const c = cardEnv(t, [{type: 'demo_overview', entity: 'weather.h'}]);
  const {host} = c.env;
  host._screensaverSync();
  await settle();
  host._hass.states['weather.g'] = {state: 'sunny', attributes: {supported_features: 1}};
  host._config.widgets[0] = {type: 'demo_overview', entity: 'weather.g'};
  host._screensaverSync();
  await settle();
  assert.deepEqual(c.subscribed, ['weather.h|daily', 'weather.g|daily']);
  c.env.wait(2000);
  await settle();
  assert.equal(c.unsubscribed(), 1);
});

test('widgets that are not overviews allocate no session', (t) => {
  const c = cardEnv(t, [{type: 'light', entity: 'light.a'}]);
  c.env.host._screensaverSync();
  assert.equal(c.env.host._overviewSessions, undefined);
});

test('a card that is not connected leases nothing', (t) => {
  const c = cardEnv(t, [{type: 'demo_overview', entity: 'weather.h'}]);
  c.env.host.isConnected = false;
  c.env.host._screensaverSync();
  assert.equal(c.env.host._overviewSessions, undefined);
  assert.deepEqual(c.subscribed, []);
});

test('screensaver sessions lease at connect, so the first frame is populated', async (t) => {
  const subscribed = [];
  const hass = {
    connection: {
      subscribeMessage: (callback, message) => {
        subscribed.push(message.entity_id);
        return Promise.resolve(() => {});
      }
    },
    states: {'weather.h': {state: 'sunny', attributes: {supported_features: 3}}}
  };
  const env = setup(t, {
    screensaver: {type: 'demo', entity: 'weather.h', idle_timeout: 10},
    hass
  });
  env.host._screensaverHass(); // the first hass of the card
  await settle();
  assert.deepEqual(subscribed, ['weather.h']);
  env.host._screensaverDisconnect();
  assert.equal(env.host._screensaver.sessions.size, 0);
});
