// Node test support for the controller package (compat-surface, extensions, tablet-chrome tests).
//
// There is no jsdom here. These doubles are just big enough to import the controller modules, construct a
// HouseViewCard, and drive its logic with fake events and a fake shadow root. They deliberately do NOT parse
// HTML or implement selectors: everything that needs a real DOM (rendering, layout, animations, the browser suite)
// is covered in a real browser by tests/index.html and tools/run-tests.mjs.
import {registerHooks} from 'node:module';

// `virtual:houseview-css` only exists inside the esbuild bundle (tools/build.mjs).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'virtual:houseview-css') {
      return {url: 'data:text/javascript,export default "/* test css */";', shortCircuit: true};
    }
    return nextResolve(specifier, context);
  }
});

/** Insertion-ordered fake node list used by shells, faces and shadow roots. */
export class FakeNode {
  constructor(localName = 'div') {
    this.localName = localName;
    this.nodeType = 1;
    this.parentNode = null;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.classNames = new Set();
    this.styleValues = new Map();
    this.style = {
      setProperty: (name, value) => this.styleValues.set(name, String(value)),
      getPropertyValue: (name) => this.styleValues.get(name) ?? '',
      removeProperty: (name) => this.styleValues.delete(name)
    };
    this.classList = {
      add: (name) => this.classNames.add(name),
      remove: (name) => this.classNames.delete(name),
      contains: (name) => this.classNames.has(name),
      toggle: (name, force) => {
        const on = force ?? !this.classNames.has(name);
        if (on) this.classNames.add(name);
        else this.classNames.delete(name);
        return on;
      }
    };
  }

  get isConnected() {
    return !!this.parentNode;
  }

  get childNodes() {
    return this.children;
  }

  get parentElement() {
    return this.parentNode;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  replaceChildren(...nodes) {
    for (const child of [...this.children]) child.remove?.();
    this.children = [];
    if (nodes.length) this.append(...nodes);
  }

  append(...nodes) {
    for (const node of nodes) {
      node.remove?.();
      node.parentNode = this;
      this.children.push(node);
    }
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  contains(node) {
    return node === this || this.children.some((child) => child.contains?.(node));
  }

  /**
   * Insert markup. Only what the tests need: each top-level element becomes a FakeNode carrying its tag and
   * class list; text and nesting are not interpreted.
   */
  insertAdjacentHTML(position, html) {
    if (position !== 'beforeend') throw new Error(`unsupported position ${position}`);
    for (const fragment of topLevelElements(html)) {
      const node = new FakeNode(fragment.tag);
      for (const name of fragment.classes) node.classNames.add(name);
      node.html = fragment.html;
      this.append(node);
    }
  }
}

/** Split markup into its top-level elements (balanced tags, no void-element handling beyond <br>/<img>). */
function topLevelElements(html) {
  const fragments = [];
  const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  const VOID = new Set(['br', 'img', 'input', 'hr']);
  let depth = 0;
  let start = -1;
  let first;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    const [whole, closing, name, attrs, selfClosing] = match;
    if (!closing) {
      if (depth === 0) {
        start = match.index;
        first = {name, attrs};
      }
      if (!selfClosing && !VOID.has(name)) depth++;
      else if (depth === 0) {
        fragments.push(describe(first, html.slice(start, match.index + whole.length)));
      }
    } else {
      depth--;
      if (depth === 0) {
        fragments.push(describe(first, html.slice(start, match.index + whole.length)));
      }
    }
  }
  return fragments;
}

function describe(first, html) {
  const classes = (/class="([^"]*)"/.exec(first.attrs)?.[1] || '').split(/\s+/).filter(Boolean);
  return {tag: first.name, classes, html};
}

/** A shadow root with recordable listeners and selector results the test decides. */
export class FakeShadowRoot extends FakeNode {
  constructor() {
    super('#shadow-root');
    this.listeners = new Map();
    this.activeElement = null;
    /** selector -> element (or null); everything else is null */
    this.selectors = new Map();
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  /** Call every listener of `type` with `event`. */
  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  querySelector(selector) {
    return this.selectors.get(selector) ?? null;
  }

  querySelectorAll(selector) {
    const hit = this.selectors.get(`all:${selector}`);
    return hit ?? [];
  }

  prepend(node) {
    node.parentNode = this;
    this.children.unshift(node);
  }
}

/** Install the browser globals the controller needs at import time and in its constructor. */
export function installBrowserGlobals() {
  const frames = [];
  const windowListeners = new Map();
  const win = {
    location: {origin: 'http://127.0.0.1:8123', search: '', href: 'http://127.0.0.1:8123/'},
    innerWidth: 1000,
    innerHeight: 800,
    confirm: () => false,
    matchMedia: () => ({matches: false}),
    addEventListener: (type, fn) =>
      windowListeners.set(`${type}`, [...(windowListeners.get(type) ?? []), fn]),
    removeEventListener: (type, fn) =>
      windowListeners.set(
        type,
        (windowListeners.get(type) ?? []).filter((f) => f !== fn)
      ),
    customCards: undefined
  };
  const doc = {
    hidden: false,
    createElement: (tag) => new FakeNode(tag),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null
  };
  const defined = new Map();
  class FakeHTMLElement extends globalThis.EventTarget {
    constructor() {
      super();
      this.localName = 'houseview-card';
      this.nodeType = 1;
      this.attributes = new Map();
      this.connected = false;
      this.style = new FakeNode().style;
    }

    get isConnected() {
      return this.connected;
    }

    attachShadow() {
      this.shadowRoot = new FakeShadowRoot();
      return this.shadowRoot;
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }

    hasAttribute(name) {
      return this.attributes.has(name);
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    getRootNode() {
      return {};
    }

    getBoundingClientRect() {
      return {width: 1000, height: 800};
    }
  }
  class FakeResizeObserver {
    static all = [];
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = 0;
      FakeResizeObserver.all.push(this);
    }

    observe(target) {
      this.observed.push(target);
    }

    disconnect() {
      this.disconnected++;
    }
  }

  const install = {
    window: win,
    document: doc,
    HTMLElement: FakeHTMLElement,
    ResizeObserver: FakeResizeObserver,
    Node: {ELEMENT_NODE: 1, TEXT_NODE: 3},
    customElements: {
      get: (tag) => defined.get(tag),
      define: (tag, ctor) => defined.set(tag, ctor)
    },
    // returns the 1-based index of the queued frame, so cancelAnimationFrame can find it
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: (id) => {
      if (frames[id - 1]) frames[id - 1] = null;
    },
    getComputedStyle: () => ({getPropertyValue: () => ''})
  };
  const previous = {};
  for (const [name, value] of Object.entries(install)) {
    previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});
  }
  return {
    win,
    doc,
    defined,
    frames,
    windowListeners,
    ResizeObserver: FakeResizeObserver,
    /** Run (and clear) the queued animation frames. */
    flushFrames() {
      const queued = frames.splice(0);
      for (const fn of queued) fn?.(0);
      return queued.filter(Boolean).length;
    },
    restore() {
      for (const [name, descriptor] of Object.entries(previous)) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  };
}

/** A recording hass whose callService only records. */
export function fakeHass(states = {}, extra = {}) {
  const calls = [];
  return {
    calls,
    states,
    config: {unit_system: {temperature: '°C'}},
    locale: {language: 'en-GB'},
    themes: {darkMode: false},
    callService: async (d, s, data) => {
      calls.push({d, s, data});
    },
    ...extra
  };
}

// ---- stand-in widgets with extensions -----------------------------------------------------------------------------
// Shaped like the real camera (gallery) and timer (alarm) widgets so the host can be tested without them.

import {defineWidget} from '../../src/core/define-widget.js';
import {registerWidget} from '../../src/core/registry.js';

/**
 * Register a `light`-like widget, a `camera`-like widget whose extension owns a gallery overlay, and a `timer`-like
 * widget whose extension owns an alarm banner. `log` receives one entry per hook call.
 * @param {{log?: any[]}} [options]
 */
export function registerStandIns({log = []} = {}) {
  const render = (ctx) => ctx.tile('info', ctx.name);
  const light = defineWidget({
    type: 'light',
    label: 'Light',
    order: 60,
    render,
    actions: {light: {run: (ctx, id) => ctx.call('light', 'toggle', {entity_id: id})}}
  });
  const camera = defineWidget({
    type: 'camera',
    label: 'Camera',
    order: 40,
    render,
    layoutRoles: ['camera'],
    afterRender: (ctx) => log.push(['camera.afterRender', ctx.index, ctx.el?.name, ctx.ext?.open]),
    tick: {every: 30000, run: (ctx) => log.push(['camera.tick', ctx.index])},
    extension: {
      state: () => ({open: false, camera: null, refreshes: 0}),
      compat: {
        _galleryOpen: {get: (c) => c._ext.camera.open, set: (c, v) => (c._ext.camera.open = !!v)},
        _galleryCamera: {
          get: (c) => c._ext.camera.camera,
          set: (c, v) => (c._ext.camera.camera = v)
        },
        _refreshGallery: {get: (c) => () => c._ext.camera.refreshes++}
      },
      shellClasses: (card) => (card._ext.camera.open ? ['camera-view-open'] : []),
      overlay: (ctx) => (ctx.ext.open ? '<section class="camera-gallery">gallery</section>' : ''),
      afterRender: (ctx) => log.push(['camera.extension.afterRender', ctx.ext.open]),
      blocksNavigation: (ext) => ext.open,
      onKeydown: (ctx, event) => {
        if (!ctx.ext.open || event.key !== 'Escape') return false;
        event.preventDefault();
        ctx.ext.open = false;
        return true;
      },
      onPointerDown: (ctx) => log.push(['camera.pointerdown', ctx.type]),
      dispose: (ctx) => log.push(['camera.dispose', ctx.reason]),
      tick: {
        every: 5000,
        when: (ext) => ext.open,
        run: (ctx) => log.push(['camera.gallery', ctx.type])
      },
      actions: {
        'camera-grid': {
          immediate: true,
          run: (ctx) => ((ctx.ext.open = true), log.push(['camera-grid']))
        },
        'camera-back': {
          immediate: true,
          run: (ctx) => ((ctx.ext.open = false), log.push(['camera-back']))
        }
      }
    }
  });
  const timer = defineWidget({
    type: 'timer',
    label: 'Timer',
    order: 150,
    render,
    layoutRoles: ['timer'],
    onHass: (ctx, previous, next) =>
      log.push(['timer.onHass', ctx.index, previous?.state, next?.state, ctx.ext]),
    afterRender: (ctx) => log.push(['timer.afterRender', ctx.index]),
    tick: {every: 1000, run: (ctx) => log.push(['timer.tick', ctx.index])},
    extension: {
      state: () => ({alarm: false, audio: null, states: {}}),
      compat: {
        _alarm: {get: (c) => c._ext.timer.alarm, set: (c, v) => (c._ext.timer.alarm = v)},
        _audio: {get: (c) => c._ext.timer.audio, set: (c, v) => (c._ext.timer.audio = v)},
        _timerStates: {get: (c) => c._ext.timer.states, set: (c, v) => (c._ext.timer.states = v)}
      },
      overlay: (ctx) => (ctx.ext.alarm ? '<button class="timer-alarm">finished</button>' : ''),
      onPointerDown: (ctx) => log.push(['timer.pointerdown', ctx.type]),
      dispose: (ctx) => log.push(['timer.dispose', ctx.reason]),
      actions: {'dismiss-alarm': {immediate: true, run: (ctx) => (ctx.ext.alarm = false)}}
    }
  });
  for (const def of [light, camera, timer]) registerWidget(def);
  return {light, camera, timer, log};
}
