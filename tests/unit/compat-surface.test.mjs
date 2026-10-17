// The compatibility surface of the HouseViewCard controller (docs/architecture.md): every member the browser suite or old code touches must exist, accept a write, and where
// it lives in a widget extension it must DELEGATE (never copy). Also the public behaviour the browser suite relies on:
// the hass setter, setConfig, event delegation, navigation, the lifecycle, and the standalone card.
//
// Real rendering needs a real DOM; this file drives the logic with the small doubles in controller-env.mjs.
import {afterEach, beforeEach, describe, it, mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FakeNode, fakeHass, installBrowserGlobals, registerStandIns} from './controller-env.mjs';
import {defineWidget} from '../../src/core/define-widget.js';
import {_resetRegistry, registerWidget} from '../../src/core/registry.js';
import {_resetStrings} from '../../src/core/i18n.js';
import * as ticker from '../../src/core/ticker.js';

const env = installBrowserGlobals();
const {HouseViewCard} = await import('../../src/controller/houseview-card.js');
const {HouseViewWidgetCard} = await import('../../src/elements/widget-card.js');
const {registerGenericWidgetCard, registerKindCards, tagOf} =
  await import('../../src/elements/register.js');
const {defineOnce, registerCustomCard} = await import('../../src/define.js');

let log;

beforeEach(() => {
  _resetRegistry();
  _resetStrings();
  log = [];
  registerStandIns({log});
  env.win.customCards = undefined;
  env.defined.clear();
  env.ResizeObserver.all.length = 0;
});

afterEach(() => {
  ticker._reset();
  mock.restoreAll();
});

/** A card with its render entry points stubbed (they need a real DOM) and calls recorded in `order`. */
function newCard({stub = true} = {}) {
  const card = new HouseViewCard();
  const order = [];
  if (stub) {
    for (const name of ['_render', '_renderWidgets', '_updateWidgets']) {
      card[name] = (...args) => order.push([name, ...args]);
    }
  }
  return {card, order};
}

const lightConfig = (extra = {}) => ({widgets: [{type: 'light', entity: 'light.a'}], ...extra});

// ---- names that must stay reachable ------------------------------------------------------------------------------

describe('private member names', () => {
  const METHODS = [
    '_act',
    '_setPage',
    '_swipeStart',
    '_swipeEnd',
    '_state',
    '_available',
    '_info',
    '_widget',
    '_patchNode',
    '_layout',
    '_render',
    '_renderWidgets',
    '_updateWidgets',
    '_button',
    '_icon',
    '_tabletChrome',
    '_restoreChrome',
    '_ensureCardHelpers',
    '_ensureStyles',
    '_screenModel',
    '_pageMarkup',
    '_clearPageTransition',
    '_refreshActionState',
    '_start',
    '_clock',
    '_camera',
    '_countdowns',
    '_ring',
    '_stopGallery',
    '_galleryMarkup',
    'getCardSize',
    'getGridOptions',
    'connectedCallback',
    'disconnectedCallback',
    'setConfig'
  ];

  it('keeps every method on the prototype', () => {
    for (const name of METHODS) {
      assert.equal(typeof HouseViewCard.prototype[name], 'function', name);
    }
  });

  it('keeps the statics Home Assistant calls', () => {
    assert.equal(typeof HouseViewCard.getConfigElement, 'function');
    assert.deepEqual(HouseViewCard.getStubConfig(), {
      pages: [{name: 'Home', surface: 'teal'}],
      cards: [{type: 'custom:houseview-clock-card', page: 'Home'}]
    });
  });

  it('keeps the five screensaver integration members (docs/overview-api.md)', () => {
    for (const name of [
      '_screensaverSetConfig',
      '_screensaverConnect',
      '_screensaverDisconnect',
      '_screensaverHass',
      '_screensaverSync'
    ]) {
      assert.equal(typeof HouseViewCard.prototype[name], 'function', name);
    }
  });

  it('constructs with the fields the browser suite and old code read', () => {
    const {card} = newCard();
    assert.ok(card._pending instanceof Set);
    assert.equal(typeof card._onResize, 'function');
    assert.ok(card._observer);
    assert.ok(card.shadowRoot);
    assert.deepEqual(Object.keys(card._ext).sort(), ['camera', 'timer']);
  });

  it('keeps hass as a getter and a setter', () => {
    const {card} = newCard();
    const hass = fakeHass();
    card.hass = hass;
    assert.equal(card.hass, hass);
    assert.equal(card._hass, hass);
  });

  it('has no member that two mixins both define (mixin() would have thrown on import)', () => {
    assert.ok(Object.getOwnPropertyNames(HouseViewCard.prototype).length > 60);
  });

  it('names no widget kind in the controller sources', () => {
    const kinds = ['camera', 'timer', 'climate', 'cover', 'lock', 'light', 'media_player', 'clock'];
    for (const file of fs.readdirSync(new URL('../../src/controller/', import.meta.url))) {
      if (file === 'screensaver.js') continue;
      const source = fs.readFileSync(
        new URL(`../../src/controller/${file}`, import.meta.url),
        'utf8'
      );
      const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const kind of kinds) {
        // comparing a widget type with a kind, or looking a kind up by name
        const named = new RegExp(
          `type\\s*[!=]==?\\s*['"\`]${kind}['"\`]|getWidget\\(['"\`]${kind}|case ['"\`]${kind}['"\`]|(?<!['"\`])\\.${kind}\\b`
        );
        assert.ok(!named.test(code), `${file} names the kind "${kind}"`);
      }
    }
  });
});

describe('plain assignable members', () => {
  for (const [name, value] of [
    ['_helpers', {createCardElement: () => null}],
    ['_suppressClickUntil', 123],
    ['_screenKey', 'Music:0'],
    ['_pageIndex', 2],
    ['_message', 'hello'],
    ['_dim', true],
    ['_timer', 7],
    ['_outgoingPage', null],
    ['_pageAnimations', []]
  ]) {
    it(`${name} is an ordinary property`, () => {
      assert.equal(Object.getOwnPropertyDescriptor(HouseViewCard.prototype, name), undefined);
      const {card} = newCard();
      card[name] = value;
      assert.equal(card[name], value);
    });
  }
});

// ---- accessors that live in widget extensions --------------------------------------------------------------------

describe('compat accessors delegate to the extension state', () => {
  it('defines accessors on the prototype, not values on the instance', () => {
    for (const name of [
      '_galleryOpen',
      '_galleryCamera',
      '_refreshGallery',
      '_alarm',
      '_audio',
      '_timerStates'
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(HouseViewCard.prototype, name);
      assert.equal(typeof descriptor.get, 'function', `${name} getter`);
      assert.equal(typeof descriptor.set, 'function', `${name} setter`);
      const {card} = newCard();
      assert.ok(!Object.hasOwn(card, name), `${name} must not be copied onto the instance`);
    }
  });

  it('round-trips writes through the extension state', () => {
    const {card} = newCard();
    card._galleryOpen = true;
    assert.equal(card._ext.camera.open, true);
    card._ext.camera.open = false;
    assert.equal(card._galleryOpen, false);
    card._galleryCamera = 'camera.porch';
    assert.equal(card._ext.camera.camera, 'camera.porch');
    card._alarm = true;
    assert.equal(card._ext.timer.alarm, true);
    const audio = {state: 'running'};
    card._audio = audio;
    assert.equal(card._ext.timer.audio, audio);
    card._timerStates = {'timer.a': {state: 'idle'}};
    assert.deepEqual(card._ext.timer.states, {'timer.a': {state: 'idle'}});
  });

  it('keeps one state per card', () => {
    const {card: first} = newCard();
    const {card: second} = newCard();
    first._galleryOpen = true;
    assert.equal(second._galleryOpen, false);
  });

  it('exposes methods through a getter (card._refreshGallery() works)', () => {
    const {card} = newCard();
    card._refreshGallery();
    card._refreshGallery();
    assert.equal(card._ext.camera.refreshes, 2);
  });

  it('follows the registry: a later widget adds its names, a reset removes them', () => {
    registerWidget(
      defineWidget({
        type: 'sensor',
        label: 'Sensor',
        order: 110,
        render: () => '<div></div>',
        extension: {
          compat: {
            _extra: {
              get: (card) => card._ext.sensor.value,
              set: (card, v) => (card._ext.sensor.value = v)
            }
          },
          state: () => ({value: 1})
        }
      })
    );
    const {card} = newCard();
    assert.equal(card._extra, 1);
    card._extra = 5;
    assert.equal(card._ext.sensor.value, 5);
    _resetRegistry();
    assert.ok(!('_extra' in card));
    assert.ok(!('_galleryOpen' in card));
  });

  it('ignores a write to a read-only compat property instead of throwing', () => {
    registerWidget(
      defineWidget({
        type: 'sensor',
        label: 'Sensor',
        order: 110,
        render: () => '<div></div>',
        extension: {compat: {_readonly: {get: () => 42}}}
      })
    );
    const {card} = newCard();
    card._readonly = 1;
    assert.equal(card._readonly, 42);
  });

  it('refuses to replace a controller member and says so', () => {
    const errors = mock.method(console, 'error', () => {});
    registerWidget(
      defineWidget({
        type: 'sensor',
        label: 'Sensor',
        order: 110,
        render: () => '<div></div>',
        extension: {compat: {_act: {get: () => 'hijacked'}}}
      })
    );
    assert.equal(typeof HouseViewCard.prototype._act, 'function');
    assert.match(String(errors.mock.calls[0].arguments[0]), /_act/);
  });

  it('lets a compat accessor take over a delegate (_ring) and gives it back', () => {
    const {card} = newCard();
    assert.equal(card._ring(), undefined);
    registerWidget(
      defineWidget({
        type: 'sensor',
        label: 'Sensor',
        order: 110,
        render: () => '<div></div>',
        extension: {compat: {_ring: {get: () => () => 'rang'}}}
      })
    );
    assert.equal(card._ring(), 'rang');
    _resetRegistry();
    assert.equal(card._ring(), undefined);
  });
});

// ---- setConfig ---------------------------------------------------------------------------------------------------

describe('setConfig', () => {
  it('stores the normalised config and renders after the screensaver was told', () => {
    const {card, order} = newCard();
    card._ensureCardHelpers = () => order.push(['_ensureCardHelpers']);
    card._screensaverSetConfig = (config) =>
      order.push(['_screensaverSetConfig', config === card._config]);
    card.setConfig(lightConfig());
    assert.deepEqual(order, [['_ensureCardHelpers'], ['_screensaverSetConfig', true], ['_render']]);
    assert.equal(card._config.widgets[0].type, 'light');
  });

  it('accepts the cards format and rejects a config without a list of cards', () => {
    const {card} = newCard();
    card.setConfig({cards: [{type: 'custom:houseview-light-card', entity: 'light.a'}]});
    assert.equal(card._config.widgets[0].entity, 'light.a');
    assert.throws(() => card.setConfig({climate: {entity: 'climate.t'}}), /needs a list of cards/);
    assert.equal(card._config.widgets[0].entity, 'light.a', 'the previous config is kept');
  });

  it('throws the error message and keeps the previous config', () => {
    const {card, order} = newCard();
    card.setConfig(lightConfig());
    const kept = card._config;
    order.length = 0;
    assert.throws(() => card.setConfig({widgets: [{type: 'light', entity: 'switch.x'}]}), {
      message: 'light widget needs a light entity.'
    });
    assert.throws(() => card.setConfig({widgets: [{type: 'nope'}]}), {
      message: 'Unsupported widget: nope'
    });
    assert.equal(card._config, kept);
    assert.deepEqual(order, []);
  });

  it('keeps extension state across setConfig (an open gallery stays open)', () => {
    const {card} = newCard();
    card.setConfig(lightConfig());
    card._galleryOpen = true;
    card.setConfig(lightConfig());
    assert.equal(card._galleryOpen, true);
  });
});

// ---- the hass setter ---------------------------------------------------------------------------------------------

describe('hass setter', () => {
  const states = () => ({'light.a': {state: 'on', attributes: {}}});

  function configured() {
    const made = newCard();
    made.card.setConfig(lightConfig());
    made.order.length = 0;
    made.card.shadowRoot.selectors.set('.shell.adaptive', new FakeNode('ha-card'));
    return made;
  }

  it('does the 5.2 steps in order, ending with the screensaver', () => {
    const {card, order} = configured();
    card._forwardHassToNativeCards = () => order.push('forward');
    card._runOnHass = () => order.push('onHass');
    card._screensaverHass = () => order.push('screensaver');
    card.hass = fakeHass(states());
    assert.deepEqual(
      order
        .filter((x) => typeof x === 'string' || x[0] === '_updateWidgets' || x[0] === '_render')
        .map((x) => (Array.isArray(x) ? x[0] : x)),
      ['forward', 'onHass', '_updateWidgets', 'screensaver']
    );
  });

  it('asks the screensaver even when there is no config yet', () => {
    const {card} = newCard();
    const calls = [];
    card._screensaverHass = () => calls.push('screensaver');
    card.hass = fakeHass();
    assert.deepEqual(calls, ['screensaver']);
  });

  it('renders fully the first time, updates in place afterwards, and does nothing when unchanged', () => {
    const {card, order} = newCard();
    card.setConfig(lightConfig());
    order.length = 0;
    const hass = fakeHass(states());
    card.hass = hass;
    assert.deepEqual(order, [['_render']], 'no shell yet');
    order.length = 0;
    card.shadowRoot.selectors.set('.shell.adaptive', new FakeNode('ha-card'));
    card.hass = hass;
    assert.deepEqual(order, [], 'unchanged signature');
    hass.states['light.a'].state = 'off'; // the browser suite mutates in place
    card.hass = hass;
    assert.deepEqual(order, [['_updateWidgets']]);
    order.length = 0;
    hass.states['unrelated.x'] = {state: '1', attributes: {}};
    card.hass = hass;
    assert.deepEqual(order, [], 'unwatched entities do not render');
  });

  it('compares references when hass has a connection', () => {
    const {card, order} = configured();
    const first = states();
    card.hass = fakeHass(first, {connection: {}});
    order.length = 0;
    card.hass = fakeHass(first, {connection: {}});
    assert.deepEqual(order, [], 'same state objects');
    card.hass = fakeHass(states(), {connection: {}});
    assert.deepEqual(order, [['_updateWidgets']], 'a replaced state object');
  });

  it('gives native cards every update but widget cards none', () => {
    const {card} = configured();
    const native = {localName: 'div', firstElementChild: {hass: null}};
    const tile = {localName: 'houseview-widget-card', firstElementChild: {hass: 'untouched'}};
    card._renderedCards = new Map([
      [0, native],
      [1, tile]
    ]);
    const hass = fakeHass(states());
    card.hass = hass;
    assert.equal(native.firstElementChild.hass, hass);
    assert.equal(tile.firstElementChild.hass, 'untouched');
  });

  it('tells widgets with an onHass hook the previous and the new state, also for hidden pages', () => {
    const {card} = newCard();
    card.setConfig({widgets: [{type: 'timer', entity: 'timer.a'}]});
    const first = fakeHass({'timer.a': {state: 'active', attributes: {}}});
    card.hass = first;
    card.hass = fakeHass({'timer.a': {state: 'idle', attributes: {}}});
    const calls = log.filter((entry) => entry[0] === 'timer.onHass');
    assert.deepEqual(
      calls.map(([, index, previous, next]) => [index, previous, next]),
      [
        [0, undefined, 'active'],
        [0, 'active', 'idle']
      ]
    );
    assert.deepEqual(
      calls[0][4],
      {alarm: false, audio: null, states: {}},
      'ctx.ext is the widget extension state'
    );
  });

  it('survives a throwing onHass hook and reports it once', () => {
    const errors = mock.method(console, 'error', () => {});
    _resetRegistry();
    registerWidget(
      defineWidget({
        type: 'timer',
        label: 'Timer',
        order: 150,
        render: () => '<div></div>',
        onHass: () => {
          throw new Error('boom');
        }
      })
    );
    const {card} = newCard();
    card.setConfig({widgets: [{type: 'timer', entity: 'timer.a'}]});
    card.hass = fakeHass({'timer.a': {state: 'idle', attributes: {}}});
    card.hass = fakeHass({'timer.a': {state: 'active', attributes: {}}});
    assert.equal(errors.mock.callCount(), 1);
  });
});

// ---- lifecycle (docs/architecture.md) --------------------------------------------------------------------------------

describe('lifecycle', () => {
  it('subscribes to the shared ticker while connected and lets go afterwards', () => {
    const {card} = newCard();
    assert.ok(!card._timer);
    card.connectedCallback();
    assert.ok(card._timer, 'a truthy subscription token');
    assert.equal(ticker.subscriberCount(), 1);
    card.disconnectedCallback();
    assert.equal(card._timer, null);
    assert.equal(ticker.subscriberCount(), 0);
  });

  it('subscribes once however often it is connected', () => {
    const {card} = newCard();
    card.connectedCallback();
    card.connectedCallback();
    assert.equal(ticker.subscriberCount(), 1);
    card.disconnectedCallback();
  });

  it('observes size and window resize, and removes the listeners on disconnect', () => {
    const {card} = newCard();
    card.connectedCallback();
    assert.deepEqual(card._observer.observed, [card]);
    assert.equal(env.windowListeners.get('resize').length, 1);
    card.disconnectedCallback();
    assert.equal(card._observer.disconnected, 1);
    assert.equal(env.windowListeners.get('resize').length, 0);
  });

  it('coalesces layout requests into one frame and cancels a pending one on disconnect', () => {
    const {card} = newCard();
    const layouts = [];
    card._layout = () => layouts.push('layout');
    card._scheduleLayout();
    card._scheduleLayout();
    card._onResize();
    assert.equal(env.flushFrames(), 1);
    assert.deepEqual(layouts, ['layout']);
    card._scheduleLayout();
    card.disconnectedCallback();
    env.flushFrames();
    assert.deepEqual(layouts, ['layout'], 'the cancelled frame did not run');
  });

  it('releases everything in the order of 6.4: screensaver first, extensions told it is a disconnect', () => {
    const {card} = newCard();
    const order = [];
    card._screensaverDisconnect = () => order.push('screensaver');
    card._clearPageTransition = () => order.push('transition');
    card._disposeExtensions = (reason) => order.push(`dispose:${reason}`);
    card._restoreChrome = () => order.push('chrome');
    card.connectedCallback();
    card.disconnectedCallback();
    assert.deepEqual(order, ['screensaver', 'transition', 'dispose:disconnect', 'chrome']);
    assert.deepEqual(
      log.filter((entry) => entry[0].endsWith('dispose')),
      []
    );
  });

  it('calls the screensaver last when connecting', () => {
    const {card} = newCard();
    const order = [];
    card._screensaverConnect = () => order.push(`screensaver:${!!card._timer}`);
    card.connectedCallback();
    assert.deepEqual(order, ['screensaver:true'], 'after the ticker subscription');
    card.disconnectedCallback();
  });

  it('the ticker drives _tick', () => {
    const {card} = newCard();
    const ticks = [];
    card._tick = (now) => ticks.push(now);
    card.connectedCallback();
    ticker._pump();
    assert.equal(ticks.length, 1);
    card.disconnectedCallback();
  });

  it('puts the screensaver calls at the documented sites (docs/overview-api.md)', () => {
    const render = fs.readFileSync(
      new URL('../../src/controller/render.js', import.meta.url),
      'utf8'
    );
    assert.match(
      render,
      /this\._screensaverSync\(\);\s*\n {2}\},\s*\n\s*\/\*\*[^]*?_ensureShell\(\)/,
      'last statement of _renderWidgets'
    );
    const shell = fs.readFileSync(
      new URL('../../src/controller/houseview-card.js', import.meta.url),
      'utf8'
    );
    const method = (name) =>
      shell.slice(shell.indexOf(`${name}(`), shell.indexOf('\n  }\n', shell.indexOf(`${name}(`)));
    assert.match(method('set hass').trim().split('\n').at(-1), /this\._screensaverHass\(\);/);
    assert.match(
      method('connectedCallback').trim(),
      /this\._screensaverConnect\(\);[^]*this\._syncEditorPreview\(true\);$/,
      'connect the idle controller before restoring an attached editor preview'
    );
    assert.match(
      method('disconnectedCallback').split('\n')[1],
      /this\._screensaverDisconnect\(\);/
    );
    const setConfig = method('setConfig');
    assert.ok(
      setConfig.indexOf('this._config = validated') <
        setConfig.indexOf('this._screensaverSetConfig(this._config)')
    );
    assert.ok(
      setConfig.indexOf('this._screensaverSetConfig') < setConfig.indexOf('this._render()')
    );
  });
});

// ---- event delegation --------------------------------------------------------------------------------------------

describe('event delegation', () => {
  const button = (dataset, extra = {}) => ({
    dataset,
    disabled: false,
    getAttribute: (name) => (name === 'data-widget' ? (extra.widget ?? null) : null),
    ...extra
  });
  const clickEvent = (target) => ({
    target: {closest: (selector) => (selector === 'button[data-action]' ? target : null)},
    prevented: false,
    preventDefault() {
      this.prevented = true;
    }
  });

  it('runs the action of a clicked button with its entity', () => {
    const {card} = newCard();
    const acts = [];
    card._act = (...args) => acts.push(args);
    card.shadowRoot.emit('click', clickEvent(button({action: 'light', entity: 'light.a'})));
    assert.deepEqual(acts, [['light', 'light.a']]);
  });

  it('ignores disabled buttons and clicks outside a button', () => {
    const {card} = newCard();
    const acts = [];
    card._act = (...args) => acts.push(args);
    card.shadowRoot.emit('click', clickEvent(button({action: 'light'}, {disabled: true})));
    card.shadowRoot.emit('click', clickEvent(null));
    assert.deepEqual(acts, []);
  });

  it('page dots go to a page instead of running an action', () => {
    const {card} = newCard();
    const calls = [];
    card._act = () => calls.push('act');
    card._setPage = (index) => calls.push(['page', index]);
    card.shadowRoot.emit('click', clickEvent(button({action: 'page-select', page: '2'})));
    assert.deepEqual(calls, [['page', 2]]);
  });

  it('swallows the click that follows a swipe', () => {
    const {card} = newCard();
    const acts = [];
    card._act = (...args) => acts.push(args);
    card._suppressClickUntil = Date.now() + 5000;
    const event = clickEvent(button({action: 'light', entity: 'light.a'}));
    card.shadowRoot.emit('click', event);
    assert.equal(event.prevented, true);
    assert.deepEqual(acts, []);
    card._suppressClickUntil = Date.now() - 1;
    card.shadowRoot.emit('click', event);
    assert.equal(acts.length, 1);
  });

  it('pointerdown starts a swipe and tells every extension, pointerup ends it, cancel forgets it', () => {
    const {card} = newCard();
    const calls = [];
    card._swipeStart = () => calls.push('start');
    card._swipeEnd = () => calls.push('end');
    card.shadowRoot.emit('pointerdown', {target: {closest: () => null}});
    card.shadowRoot.emit('pointerup', {});
    assert.deepEqual(calls, ['start', 'end']);
    assert.deepEqual(
      log.filter(([name]) => name.endsWith('pointerdown')).map(([name]) => name),
      ['camera.pointerdown', 'timer.pointerdown']
    );
    card._gesture = {x: 1};
    card.shadowRoot.emit('pointercancel', {});
    assert.equal(card._gesture, null);
  });

  describe('keyboard', () => {
    const key = (name, tag = 'DIV') => ({
      key: name,
      target: {tagName: tag},
      prevented: false,
      preventDefault() {
        this.prevented = true;
      }
    });

    it('arrow keys turn the page', () => {
      const {card} = newCard();
      const pages = [];
      card._setPage = (index) => pages.push(index);
      card._pageIndex = 1;
      const right = key('ArrowRight');
      const left = key('ArrowLeft');
      card.shadowRoot.emit('keydown', right);
      card.shadowRoot.emit('keydown', left);
      assert.deepEqual(pages, [2, 0]);
      assert.ok(right.prevented && left.prevented);
    });

    it('ignores keys typed into form controls and other keys', () => {
      const {card} = newCard();
      const pages = [];
      card._setPage = (index) => pages.push(index);
      for (const tag of ['INPUT', 'SELECT', 'TEXTAREA'])
        card.shadowRoot.emit('keydown', key('ArrowRight', tag));
      card.shadowRoot.emit('keydown', key('a'));
      assert.deepEqual(pages, []);
    });

    it('lets an extension take the key first, and an open overlay swallows the arrows', () => {
      const {card} = newCard();
      const pages = [];
      card._setPage = (index) => pages.push(index);
      card._galleryOpen = true;
      const arrow = key('ArrowRight');
      card.shadowRoot.emit('keydown', arrow);
      assert.deepEqual(pages, []);
      assert.equal(
        arrow.prevented,
        false,
        'arrows are left alone while the gallery owns the screen'
      );
      const escape = key('Escape');
      card.shadowRoot.emit('keydown', escape);
      assert.equal(escape.prevented, true);
      assert.equal(card._galleryOpen, false, 'Escape closed it');
    });
  });
});

describe('tap_action / hold_action on the primary button (opt-in)', () => {
  const tapAction = {
    action: 'perform-action',
    perform_action: 'light.turn_on',
    target: {entity_id: 'light.a'}
  };
  const primary = (index) => ({
    dataset: {action: 'light', entity: 'light.a', widget: String(index)},
    closest(selector) {
      return selector === 'button' || selector === '[data-widget]' ? this : null;
    },
    matches: (selector) => selector === 'button[data-widget]',
    disabled: false,
    isConnected: true,
    getAttribute: (name) => (name === 'data-widget' ? String(index) : null)
  });
  const click = (target) => ({
    target: {closest: () => target},
    preventDefault() {}
  });

  function setup(widget) {
    const {card} = newCard();
    card.setConfig({widgets: [{type: 'light', entity: 'light.a', ...widget}]});
    const hass = fakeHass({'light.a': {state: 'on', attributes: {}}});
    card._hass = hass;
    const acts = [];
    card._act = (...args) => acts.push(args);
    return {card, hass, acts};
  }

  it('without the keys a click runs the internal action, as before', () => {
    const {card, acts} = setup({});
    card.shadowRoot.emit('click', click(primary(0)));
    assert.deepEqual(acts, [['light', 'light.a']]);
  });

  it('a configured tap_action replaces the internal action', async () => {
    const {card, hass, acts} = setup({tap_action: tapAction});
    card.shadowRoot.emit('click', click(primary(0)));
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(acts, []);
    assert.deepEqual(hass.calls, [{d: 'light', s: 'turn_on', data: {entity_id: 'light.a'}}]);
  });

  it('inner controls of a widget (no data-widget) keep their internal action', () => {
    const {card, acts} = setup({tap_action: tapAction});
    const inner = {
      dataset: {action: 'cover-open', entity: 'light.a'},
      disabled: false,
      getAttribute: () => null
    };
    card.shadowRoot.emit('click', click(inner));
    assert.deepEqual(acts, [['cover-open', 'light.a']]);
  });

  it('a hold fires hold_action once and the trailing click is swallowed', async () => {
    const {card, hass, acts} = setup({
      hold_action: {
        action: 'perform-action',
        perform_action: 'light.turn_off',
        target: {entity_id: 'light.a'}
      }
    });
    const button = primary(0);
    const pointer = {
      target: button,
      clientX: 5,
      clientY: 5,
      button: 0,
      pointerType: 'touch'
    };
    card.shadowRoot.emit('pointerdown', pointer);
    await new Promise((resolve) => setTimeout(resolve, 600));
    card.shadowRoot.emit('pointerup', pointer);
    const trailing = click(button);
    trailing.preventDefault = () => (trailing.prevented = true);
    card.shadowRoot.emit('click', trailing);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(
      hass.calls.map((c) => c.s),
      ['turn_off']
    );
    assert.equal(trailing.prevented, true);
    assert.deepEqual(acts, []);
    card._disposeGestures();
  });

  it('a short press on a hold widget still taps (internal action) and swallows its click', () => {
    const {card, acts} = setup({
      hold_action: {
        action: 'perform-action',
        perform_action: 'light.turn_off',
        target: {entity_id: 'light.a'}
      }
    });
    const button = primary(0);
    const pointer = {
      target: button,
      clientX: 5,
      clientY: 5,
      button: 0,
      pointerType: 'touch'
    };
    card.shadowRoot.emit('pointerdown', pointer);
    card.shadowRoot.emit('pointerup', pointer);
    assert.deepEqual(acts, [['light', 'light.a']]);
    const trailing = click(button);
    card.shadowRoot.emit('click', trailing);
    assert.equal(acts.length, 1, 'the click did not run the action a second time');
    card._disposeGestures();
  });
});

// ---- navigation --------------------------------------------------------------------------------------------------

describe('navigation', () => {
  function pagedCard({reduced = false} = {}) {
    const {card, order} = newCard();
    const animations = [];
    const shell = new FakeNode('ha-card');
    const face = new FakeNode('div');
    shell.append(face);
    face.getBoundingClientRect = () => ({height: 321, width: 480});
    face.offsetTop = 44;
    face.offsetLeft = 0;
    face.childNodes.push('child-a', 'child-b');
    face.cloneNode = () => {
      const clone = new FakeNode('div');
      clone.setAttribute('aria-label', 'x');
      clone.append = (...nodes) => (clone.moved = nodes);
      return clone;
    };
    face.animate = (keyframes, options) => {
      const animation = {
        keyframes,
        options,
        cancelled: false,
        cancel() {
          this.cancelled = true;
        }
      };
      animation.finished = new Promise((resolve) => (animation.finish = resolve));
      animations.push(animation);
      return animation;
    };
    // outgoing.animate comes from the clone
    const cloneNode = face.cloneNode;
    face.cloneNode = (...args) => {
      const clone = cloneNode(...args);
      clone.animate = face.animate;
      clone.getBoundingClientRect = face.getBoundingClientRect;
      return clone;
    };
    card.shadowRoot.selectors.set('.face', face);
    card._screens = [{key: 'A:0'}, {key: 'B:0'}, {key: 'C:0'}];
    card._pageIndex = 0;
    card._screenKey = 'A:0';
    env.win.matchMedia = () => ({matches: reduced});
    return {card, order, animations, face, shell};
  }

  it('glides: exact keyframes and timings of the page glide', () => {
    const {card, order, animations} = pagedCard();
    card._setPage(1);
    assert.equal(card._pageIndex, 1);
    assert.equal(card._screenKey, 'B:0');
    assert.deepEqual(order, [['_renderWidgets']]);
    assert.equal(animations.length, 2);
    const [incoming, leaving] = animations;
    assert.deepEqual(incoming.keyframes, [
      {transform: 'translateX(48px)', opacity: 0},
      {transform: 'translateX(0)', opacity: 1}
    ]);
    assert.deepEqual(incoming.options, {duration: 320, easing: 'cubic-bezier(.22,1,.36,1)'});
    assert.deepEqual(leaving.keyframes, [
      {transform: 'translateX(0)', opacity: 1},
      {transform: 'translateX(-36px)', opacity: 0}
    ]);
    assert.deepEqual(leaving.options, {
      duration: 200,
      easing: 'cubic-bezier(.4,0,1,1)',
      fill: 'forwards'
    });
    assert.deepEqual(card._pageAnimations, [incoming, leaving]);
  });

  it('prepares an inert, hidden, fixed-height outgoing layer holding the old widgets', () => {
    const {card, shell} = pagedCard();
    card._setPage(1);
    const outgoing = card._outgoingPage;
    assert.ok(outgoing.classNames.has('page-outgoing'));
    assert.equal(outgoing.inert, true);
    assert.equal(outgoing.getAttribute('aria-hidden'), 'true');
    assert.equal(outgoing.getAttribute('aria-label'), null);
    assert.equal(outgoing.styleValues.get('height'), '321px');
    assert.equal(outgoing.styleValues.get('top'), '44px');
    assert.equal(outgoing.styleValues.get('width'), '480px');
    assert.deepEqual(outgoing.moved, ['child-a', 'child-b']);
    assert.equal(outgoing.parentNode, shell);
  });

  it('glides the other way when going back', () => {
    const {card, animations} = pagedCard();
    card._pageIndex = 2;
    card._screenKey = 'C:0';
    card._setPage(1);
    assert.equal(animations[0].keyframes[0].transform, 'translateX(-48px)');
    assert.equal(animations[1].keyframes[1].transform, 'translateX(36px)');
  });

  it('replaces a running transition (rapid reverse navigation)', () => {
    const {card, animations} = pagedCard();
    card._setPage(1);
    const first = card._outgoingPage;
    card._setPage(0);
    assert.ok(animations[0].cancelled && animations[1].cancelled);
    assert.equal(first.parentNode, null, 'the old outgoing layer was removed');
    assert.equal(card._pageAnimations.length, 2);
  });

  it('cleans up when the incoming animation finishes, but not for a superseded layer', async () => {
    const {card, animations} = pagedCard();
    card._setPage(1);
    animations[0].finish();
    await animations[0].finished;
    await Promise.resolve();
    assert.equal(card._outgoingPage, null);
    assert.deepEqual(card._pageAnimations, []);
  });

  it('navigates immediately when reduced motion is asked for (looked up at call time)', () => {
    const {card, order, animations} = pagedCard({reduced: true});
    card._setPage(2);
    assert.equal(animations.length, 0);
    assert.deepEqual(card._pageAnimations || [], []);
    assert.equal(card._screenKey, 'C:0');
    assert.deepEqual(order, [['_renderWidgets']]);
  });

  it('clamps the page and ignores the page it is already on', () => {
    const {card, order} = pagedCard({reduced: true});
    card._setPage(-4);
    card._setPage(0);
    assert.deepEqual(order, []);
    card._setPage(99);
    assert.equal(card._pageIndex, 2);
  });

  it('does nothing without pages, and nothing while an extension owns the screen', () => {
    const {card, order} = pagedCard({reduced: true});
    card._galleryOpen = true;
    card._setPage(1);
    assert.deepEqual(order, []);
    assert.equal(card._pageIndex, 0);
    card._galleryOpen = false;
    card._screens = [];
    card._setPage(1);
    assert.deepEqual(order, []);
  });

  describe('swipe', () => {
    const touch = (x, y) => ({clientX: x, clientY: y, pointerType: 'touch'});

    it('a long, quick, horizontal drag turns the page and guards the click', () => {
      const {card} = pagedCard({reduced: true});
      card._swipeStart(touch(300, 100));
      card._swipeEnd(touch(100, 110));
      assert.equal(card._pageIndex, 1);
      assert.ok(card._suppressClickUntil > Date.now());
      card._swipeStart(touch(100, 100));
      card._swipeEnd(touch(300, 110));
      assert.equal(card._pageIndex, 0);
    });

    it('is not a swipe when short, steep or slow', () => {
      const {card} = pagedCard({reduced: true});
      card._swipeStart(touch(300, 100));
      card._swipeEnd(touch(241, 100)); // 59 px
      card._swipeStart(touch(300, 100));
      card._swipeEnd(touch(100, 400)); // too steep
      card._swipeStart(touch(300, 100));
      card._gesture.time -= 1500; // too slow
      card._swipeEnd(touch(100, 100));
      assert.equal(card._pageIndex, 0);
      assert.ok(!card._suppressClickUntil);
    });

    it('cancels multi-touch and ignores a different pointer ending the swipe', () => {
      const {card} = pagedCard({reduced: true});
      card._swipeStart({...touch(300, 100), pointerId: 1});
      card._swipeEnd({...touch(100, 100), pointerId: 2});
      assert.equal(card._pageIndex, 0);
      card._swipeStart({...touch(300, 100), pointerId: 1});
      card._swipeStart({...touch(300, 100), pointerId: 2, isPrimary: false});
      card._swipeEnd({...touch(100, 100), pointerId: 1});
      assert.equal(card._pageIndex, 0);
      assert.equal(card._gesture, null);
    });

    it('does not start on a slider, with a mouse side button, or while an overlay is open', () => {
      const {card} = pagedCard({reduced: true});
      card._swipeStart({
        ...touch(1, 1),
        composedPath: () => [{matches: (s) => s.includes('[role=slider]')}]
      });
      assert.equal(card._gesture ?? null, null);
      card._swipeStart({clientX: 1, clientY: 1, pointerType: 'mouse', button: 2});
      assert.equal(card._gesture ?? null, null);
      card._galleryOpen = true;
      card._swipeStart(touch(1, 1));
      assert.equal(card._gesture ?? null, null);
      card._galleryOpen = false;
      card._swipeStart({clientX: 1, clientY: 1, pointerType: 'mouse', button: 0});
      assert.ok(card._gesture);
    });
  });

  it('builds the nav markup: dots, disabled ends, escaped labels', () => {
    const {card} = newCard();
    card._screens = [{label: 'One'}, {label: 'Two <x>'}];
    card._pageIndex = 0;
    const html = card._pageMarkup();
    assert.match(html, /data-action="page-prev" aria-label="Previous page" disabled>/);
    assert.match(html, /data-action="page-next" aria-label="Next page" >/);
    assert.match(html, /class="page-dot selected" aria-label="Go to One" aria-current="page"/);
    assert.match(html, /aria-label="Go to Two &lt;x&gt;" aria-current="false"/);
    card._pageIndex = 1;
    assert.match(card._pageMarkup(), /data-action="page-next" aria-label="Next page" disabled>/);
  });
});

// ---- the elements ------------------------------------------------------------------------------------------------

describe('define.js', () => {
  it('defines an element once and ignores the second definition', () => {
    class A {}
    class B {}
    assert.equal(defineOnce('x-one', A), true);
    assert.equal(defineOnce('x-one', B), false);
    assert.equal(env.defined.get('x-one'), A);
  });

  it('dedupes customCards by type and leaves out empty fields', () => {
    assert.equal(
      registerCustomCard({
        type: 'a',
        name: 'A',
        description: '',
        documentationURL: undefined,
        preview: false
      }),
      true
    );
    assert.equal(registerCustomCard({type: 'a', name: 'again'}), false);
    assert.deepEqual(env.win.customCards, [{type: 'a', name: 'A', preview: false}]);
  });
});

describe('element registration', () => {
  it('defines the generic card and one card per standalone widget, once', () => {
    registerGenericWidgetCard();
    const first = registerKindCards();
    assert.deepEqual(first.sort(), [
      'houseview-camera-card',
      'houseview-light-card',
      'houseview-timer-card'
    ]);
    assert.equal(registerKindCards().length, 0, 'defineOnce');
    const generic = env.defined.get('houseview-widget-card');
    assert.equal(generic, HouseViewWidgetCard);
    assert.equal(env.defined.get('houseview-light-card').widgetKind, 'light');
    assert.ok(env.defined.get('houseview-light-card').prototype instanceof HouseViewWidgetCard);
  });

  it('lists the picker entries once each, with preview, description and "HouseView · label" names', () => {
    registerGenericWidgetCard();
    registerKindCards();
    registerKindCards();
    const cards = env.win.customCards;
    assert.equal(new Set(cards.map((c) => c.type)).size, cards.length);
    const light = cards.find((c) => c.type === 'houseview-light-card');
    assert.equal(light.name, 'HouseView · Light');
    assert.equal(light.preview, true);
    assert.equal(light.description, 'Shared HouseView styling and controls.');
    assert.equal(cards.find((c) => c.type === 'houseview-widget-card').name, 'HouseView · Widget');
  });

  it('honours standalone:false, preview:false, description and a custom tag', () => {
    registerWidget(
      defineWidget({
        type: 'quiet',
        label: 'Quiet',
        order: 700,
        render: () => '<i></i>',
        standalone: false
      })
    );
    registerWidget(
      defineWidget({
        type: 'odd',
        label: 'Odd',
        order: 710,
        render: () => '<i></i>',
        preview: false,
        description: 'Odd one'
      })
    );
    registerKindCards();
    assert.ok(!env.defined.has('houseview-quiet-card'));
    const odd = env.win.customCards.find((c) => c.type === 'houseview-odd-card');
    assert.equal(odd.preview, false);
    assert.equal(odd.description, 'Odd one');
    assert.equal(
      tagOf({type: 'weather_overview', tag: 'houseview-weather-overview-card'}),
      'houseview-weather-overview-card'
    );
    assert.equal(tagOf({type: 'light'}), 'houseview-light-card');
  });
});

describe('houseview-widget-card', () => {
  function embedded({
    widget = {type: 'light', entity: 'light.a'},
    html = '<button>a</button>'
  } = {}) {
    const element = new HouseViewWidgetCard();
    const patched = [];
    const parsed = {parsed: true};
    env.doc.createElement = (tag) =>
      tag === 'template'
        ? {
            set innerHTML(value) {
              parsed.html = value;
            },
            content: {firstElementChild: parsed}
          }
        : new FakeNode(tag);
    const controller = {
      current: html,
      _widget() {
        return typeof this.current === 'function' ? this.current() : this.current;
      },
      _patchNode: (...args) => patched.push(args),
      _hookContext: (w, i, tile) => ({widget: w, index: i, tile})
    };
    element.bind(controller, widget, 0);
    return {element, controller, patched, parsed};
  }

  it('binds as a display:contents wrapper and paints the first time', () => {
    const {element} = embedded();
    assert.equal(element.style.display, 'contents');
    assert.equal(element.innerHTML, '<button>a</button>');
  });

  it('skips unchanged markup and patches changed markup into the existing tile', () => {
    const {element, controller, patched, parsed} = embedded();
    const tile = {name: 'tile'};
    element.firstElementChild = tile;
    element.update();
    assert.equal(patched.length, 0);
    controller.current = '<button>b</button>';
    element.update();
    assert.deepEqual(patched, [[tile, parsed, true]]);
    assert.equal(parsed.html, '<button>b</button>');
  });

  it('force replaces the markup instead of patching', () => {
    const {element, controller, patched} = embedded();
    element.firstElementChild = {};
    controller.current = '<button>c</button>';
    element.update(true);
    assert.equal(element.innerHTML, '<button>c</button>');
    assert.equal(patched.length, 0);
  });

  it('gives the widget patch hook the first go, and alwaysPatch skips the unchanged shortcut', () => {
    _resetRegistry();
    const seen = [];
    let handled = true;
    registerWidget(
      defineWidget({
        type: 'camera',
        label: 'Camera',
        order: 40,
        render: () => '<i></i>',
        alwaysPatch: true,
        patch: (ctx, tile, html) => (seen.push([ctx.index, tile, html]), handled)
      })
    );
    const {element, patched} = embedded({
      widget: {type: 'camera', entity: 'camera.a'},
      html: '<i>same</i>'
    });
    const tile = {name: 'tile'};
    element.firstElementChild = tile;
    element.update();
    element.update();
    assert.equal(seen.length, 2, 'ran although the markup did not change');
    assert.deepEqual(seen[0], [0, tile, '<i>same</i>']);
    assert.equal(patched.length, 0, 'handled: the generic patcher stayed out of it');
    handled = false;
    element.update();
    assert.equal(patched.length, 1, 'not handled: falls back to the generic patcher');
  });

  it('isolates a render error: logged once, the page keeps going', () => {
    const errors = mock.method(console, 'error', () => {});
    const {element, controller} = embedded();
    controller.current = () => {
      throw new Error('broken render');
    };
    element.update();
    element.update();
    assert.equal(errors.mock.callCount(), 1);
    controller.current = '<button>fixed</button>';
    element.update();
    assert.equal(element.innerHTML, '<button>fixed</button>');
  });

  it('does nothing when it is not bound to a controller', () => {
    const element = new HouseViewWidgetCard();
    assert.doesNotThrow(() => element.update());
  });

  describe('standalone', () => {
    /** A card of `kind` (or the generic one) whose nested controller is a recording double. */
    function standalone(kind) {
      const Card = kind ? env.defined.get(`houseview-${kind}-card`) : HouseViewWidgetCard;
      const element = new Card();
      const inner = {
        config: null,
        hass: null,
        setConfig(config) {
          this.config = config;
        }
      };
      env.doc.createElement = (tag) => (tag === 'houseview-card' ? inner : new FakeNode(tag));
      element.attachShadow = function () {
        this.shadowRoot = new FakeNode('#root');
        return this.shadowRoot;
      };
      return {element, inner};
    }

    beforeEach(() => {
      registerGenericWidgetCard();
      registerKindCards();
    });

    it('rejects an unknown kind with the usual message', () => {
      const {element} = standalone();
      assert.throws(() => element.setConfig({widget_type: 'nope'}), {
        message: 'Select a HouseView widget type.'
      });
    });

    it('hosts a single-widget controller configured for a single widget', () => {
      const {element, inner} = standalone('light');
      element.setConfig({
        type: 'custom:houseview-light-card',
        entity: 'light.a',
        camera_gallery: [{entity: 'camera.x'}]
      });
      assert.deepEqual(inner.config, {
        widgets: [{camera_gallery: [{entity: 'camera.x'}], entity: 'light.a', type: 'light'}],
        single_widget: true,
        single_widget_height: undefined,
        single_widget_default_height: 240,
        appearance: 'light',
        wallpaper: 'teal',
        camera_gallery: [{entity: 'camera.x'}]
      });
    });

    it('passes hass down, now and later', () => {
      const {element, inner} = standalone('light');
      const hass = fakeHass();
      element.hass = hass;
      element.setConfig({type: 'custom:houseview-light-card', entity: 'light.a'});
      assert.equal(inner.hass, hass);
      const next = fakeHass();
      element.hass = next;
      assert.equal(inner.hass, next);
    });

    it('answers the picker and the sections view', () => {
      const {element} = standalone('light');
      element.setConfig({type: 'custom:houseview-light-card', entity: 'light.a'});
      assert.equal(element.getCardSize(), 3);
      assert.deepEqual(element.getGridOptions(), {columns: 6, rows: 5});
      element.setConfig({type: 'custom:houseview-light-card', entity: 'light.a', height: 560});
      assert.deepEqual(element.getGridOptions(), {columns: 6, rows: 10});
    });

    it('takes card rows, default height and grid minimums from the widget definition', () => {
      registerWidget(
        defineWidget({
          type: 'media_player',
          label: 'Music',
          order: 130,
          render: () => '<i></i>',
          cardRows: 6,
          standaloneHeight: 380,
          gridOptions: {min_columns: 3},
          domains: ['media_player'],
          stub: () => ({volume: 1})
        })
      );
      registerKindCards();
      const {element, inner} = standalone('media_player');
      element.setConfig({type: 'custom:houseview-media_player-card', entity: 'media_player.a'});
      assert.equal(inner.config.single_widget_default_height, 380);
      assert.equal(element.getCardSize(), 6);
      assert.deepEqual(element.getGridOptions(), {columns: 6, rows: 7, min_columns: 3});
      const hass = fakeHass({'light.a': {state: 'on'}, 'media_player.z': {state: 'idle'}});
      assert.deepEqual(env.defined.get('houseview-media_player-card').getStubConfig(hass), {
        widget_type: 'media_player',
        entity: 'media_player.z',
        size: 'normal',
        volume: 1
      });
    });

    it('stub config: this kind, first matching entity, normal size', () => {
      const light = env.defined.get('houseview-light-card');
      assert.deepEqual(
        light.getStubConfig(fakeHass({'switch.s': {}, 'light.b': {}, 'light.c': {}})),
        {
          widget_type: 'light',
          entity: 'light.b',
          size: 'normal'
        }
      );
      assert.deepEqual(light.getStubConfig(fakeHass({})), {widget_type: 'light', size: 'normal'});
      assert.deepEqual(HouseViewWidgetCard.getStubConfig(undefined), {
        widget_type: 'clock',
        size: 'normal'
      });
    });
  });
});
