// A fake-DOM host for the screensaver mixin, shared by the event-overview tests (overview-event-*.test.mjs): a shell
// double with just enough surface, the real shared ticker (driven by hand), the real idle manager, and Node's mock
// timers for setTimeout and Date. A copy of the one in screensaver.test.mjs, which keeps its own.
import {mock} from 'node:test';
import assert from 'node:assert/strict';
import {screensaverMixin} from '../../src/controller/screensaver.js';
import * as ticker from '../../src/core/ticker.js';

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
export function fire(el, type, init = {}) {
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

export const T0 = Date.parse('2026-10-15T10:09:00+01:00');
export const states = () => ({
  'sensor.a': {state: '1', attributes: {friendly_name: 'A'}},
  'sensor.b': {state: '2', attributes: {friendly_name: 'B'}},
  'sun.sun': {state: 'above_horizon', attributes: {}},
  'binary_sensor.door': {state: 'off', attributes: {}}
});

/**
 * A mixin host with a fake shell. `block` is the screensaver config; nothing is connected until `connect`.
 * Mock timers drive Date and setTimeout; `second` advances one second and pumps the shared ticker.
 */
export function setup(
  t,
  {screensaver, hass = {states: states()}, reduced = false, connect = true} = {}
) {
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
