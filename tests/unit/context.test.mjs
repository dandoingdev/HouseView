// Render, hook and action contexts: the helper byte contract (G2 depends on it), availability policies and
// the one route to hass.callService.
import {beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createHost} from '../fixtures/card-host.mjs';
import {defineWidget} from '../../src/core/define-widget.js';
import {
  createActionContext,
  createBaseContext,
  createExtensionContext,
  createHookContext,
  createRenderContext
} from '../../src/core/context.js';
import {_resetStrings} from '../../src/core/i18n.js';
import {controlTile} from '../../src/widgets/_shared/control-tile.js';
import {fireEvent, moreInfo} from '../../src/core/events.js';
import {
  dateFormat,
  formatNumber,
  formatTime,
  numberFormat,
  temperatureUnit,
  timeZoneOf
} from '../../src/core/format.js';
import {buttonHTML, esc, iconHTML, num} from '../../src/core/html.js';
import {mixin} from '../../src/core/mixin.js';
import {domainOf, isAvailable, isUsable} from '../../src/core/state.js';
import {_resetRegistry, registerWidget, resolveAction} from '../../src/core/registry.js';

const render = () => '<div></div>';
const widgetDef = (type, order, extra = {}) =>
  defineWidget({type, label: type, order, render, ...extra});

beforeEach(() => {
  _resetRegistry();
  _resetStrings();
  registerWidget(widgetDef('light', 60, {family: 'icon-tile'}));
  registerWidget(widgetDef('cover', 90, {availability: 'allow-unknown'}));
  registerWidget(widgetDef('clock', 20, {entity: 'none', availability: 'always'}));
  registerWidget(
    widgetDef('action', 10, {entity: 'custom', aliases: ['scene'], unknownOkDomains: ['scene']})
  );
  registerWidget(widgetDef('climate', 50, {defaultSize: 'large'}));
});

const hostWith = (states, widget, config = {}) =>
  createHost({states, config: {...config, widgets: [widget]}});

describe('base context', () => {
  it('reads states and attributes, and tolerates missing ones', () => {
    const host = hostWith({'light.a': {state: 'on', attributes: {brightness: 5}}}, {type: 'light'});
    const ctx = createBaseContext(host);
    assert.equal(ctx.stateOf('light.a').state, 'on');
    assert.deepEqual(ctx.attrsOf('light.a'), {brightness: 5});
    assert.deepEqual(ctx.attrsOf('light.none'), {});
    assert.equal(ctx.stateOf('light.none'), undefined);
    assert.equal(ctx.hass, host._hass);
  });

  it('availableOf follows the registry: unknown is fine only for unknownOkDomains', () => {
    const host = hostWith(
      {
        'scene.a': {state: 'unknown'},
        'light.a': {state: 'unknown'},
        'light.b': {state: 'unavailable'},
        'light.c': {state: 'on'}
      },
      {type: 'light'}
    );
    const ctx = createBaseContext(host);
    assert.equal(ctx.availableOf('scene.a'), true);
    assert.equal(ctx.availableOf('light.a'), false);
    assert.equal(ctx.availableOf('light.b'), false);
    assert.equal(ctx.availableOf('light.c'), true);
    assert.equal(ctx.availableOf('light.missing'), false);
    assert.equal(ctx.availableOf(undefined), false);
  });

  it('esc and num', () => {
    const ctx = createBaseContext(createHost());
    assert.equal(
      ctx.esc(`<a href="x">'&'</a>`),
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
    assert.equal(ctx.esc(undefined), '');
    assert.equal(ctx.esc(null), '');
    assert.equal(ctx.esc(0), '0');
    assert.equal(ctx.num(1), true);
    assert.equal(ctx.num(NaN), false);
    assert.equal(ctx.num('1'), false);
    assert.equal(ctx.num(Infinity), false);
  });

  it('t translates with the hass language and interpolates', () => {
    const ctx = createBaseContext(createHost());
    assert.equal(ctx.t('state.unavailable'), 'Unavailable');
    assert.equal(ctx.t('error.action', {reason: 'nope'}), 'Could not complete action: nope');
  });

  it('unit and lang', () => {
    assert.equal(createBaseContext(createHost()).unit(), '°C');
    assert.equal(createBaseContext(createHost()).lang(), 'en-GB');
    const fahrenheit = createHost({hass: {config: {unit_system: {temperature: '°F'}}}});
    assert.equal(createBaseContext(fahrenheit).unit(), '°F');
    const bare = createHost({hass: {config: null, locale: null}});
    assert.equal(createBaseContext(bare).unit(), '°C');
    assert.equal(createBaseContext(bare).lang(), undefined);
  });

  it('icon prefixes mdi: unless the name carries a prefix, and escapes', () => {
    const ctx = createBaseContext(createHost());
    assert.equal(ctx.icon('lamp'), '<ha-icon icon="mdi:lamp" aria-hidden="true"></ha-icon>');
    assert.equal(ctx.icon('mdi:lamp'), '<ha-icon icon="mdi:lamp" aria-hidden="true"></ha-icon>');
    assert.equal(ctx.icon('hass:bulb'), '<ha-icon icon="hass:bulb" aria-hidden="true"></ha-icon>');
    assert.equal(ctx.icon('a"b'), '<ha-icon icon="mdi:a&quot;b" aria-hidden="true"></ha-icon>');
  });

  it('isPending reads the card', () => {
    const ctx = createBaseContext(createHost({pending: ['light.a']}));
    assert.equal(ctx.isPending('light.a'), true);
    assert.equal(ctx.isPending('light.b'), false);
  });

  it('now honours preview_time and otherwise the clock', () => {
    const pinned = createBaseContext(createHost({config: {preview_time: '2026-10-15T10:09:00Z'}}));
    assert.equal(pinned.now(), Date.UTC(2026, 9, 15, 10, 9, 0));
    const before = Date.now();
    const live = createBaseContext(createHost()).now();
    assert.ok(live >= before && live <= Date.now());
  });

  it('call is the route to hass.callService and returns its promise', async () => {
    const host = createHost();
    const ctx = createBaseContext(host);
    await ctx.call('light', 'toggle', {entity_id: 'light.a'});
    assert.deepEqual(host.calls, [{d: 'light', s: 'toggle', data: {entity_id: 'light.a'}}]);
  });

  it('info goes through card._info', () => {
    const host = createHost();
    createBaseContext(host).info('light.a');
    assert.deepEqual(host.infos, ['light.a']);
  });
});

describe('render context', () => {
  it('exposes the widget, its state and the naming fields', () => {
    const widget = {type: 'light', entity: 'light.a', name: '<b>Hall</b>'};
    const host = hostWith({'light.a': {state: 'on', attributes: {friendly_name: 'Lamp'}}}, widget);
    const ctx = createRenderContext(host, widget, 3);
    assert.equal(ctx.widget, widget);
    assert.equal(ctx.index, 3);
    assert.equal(ctx.type, 'light');
    assert.equal(ctx.entityId, 'light.a');
    assert.equal(ctx.state.state, 'on');
    assert.equal(ctx.rawName, '<b>Hall</b>');
    assert.equal(ctx.name, '&lt;b&gt;Hall&lt;/b&gt;');
    assert.equal(ctx.attr, 'data-widget="3"');
    assert.equal(ctx.cls, 'widget light size-normal');
    assert.equal(ctx.size, 'normal');
  });

  it('name falls back to friendly_name, then the type with spaces', () => {
    const named = {type: 'light', entity: 'light.a'};
    const host = hostWith({'light.a': {state: 'on', attributes: {friendly_name: 'Lamp'}}}, named);
    assert.equal(createRenderContext(host, named, 0).rawName, 'Lamp');
    const bare = {type: 'light', entity: 'light.zz'};
    assert.equal(createRenderContext(hostWith({}, bare), bare, 0).rawName, 'light');
    registerWidget(widgetDef('media_player', 130));
    const player = {type: 'media_player', entity: 'media_player.x'};
    assert.equal(createRenderContext(hostWith({}, player), player, 0).rawName, 'media player');
  });

  it('size uses the widget size, else the definition default', () => {
    const climate = {type: 'climate', entity: 'climate.a'};
    const host = hostWith({}, climate);
    assert.equal(createRenderContext(host, climate, 0).cls, 'widget climate size-large');
    const wide = {type: 'climate', entity: 'climate.a', size: 'wide'};
    assert.equal(createRenderContext(host, wide, 0).cls, 'widget climate size-wide');
  });

  it('refuses a type nobody registered', () => {
    const host = createHost();
    assert.throws(
      () => createRenderContext(host, {type: 'vacuum'}, 0),
      /Unsupported widget: vacuum/
    );
  });

  it('accepts an alias type and uses the canonical type for classes', () => {
    const widget = {type: 'scene', entity: 'scene.a'};
    const host = hostWith({'scene.a': {state: 'unknown'}}, widget);
    const ctx = createRenderContext(host, widget, 0);
    assert.equal(ctx.type, 'action');
    assert.equal(ctx.cls, 'widget action size-normal');
    assert.equal(ctx.ok, true);
  });

  describe('ok (availability policy)', () => {
    const okFor = (type, states, entity = `${type}.a`) => {
      const widget = {type, entity};
      return createRenderContext(hostWith(states, widget), widget, 0).ok;
    };

    it('entity policy: exists, not unavailable, not unknown', () => {
      assert.equal(okFor('light', {'light.a': {state: 'on'}}), true);
      assert.equal(okFor('light', {'light.a': {state: 'unknown'}}), false);
      assert.equal(okFor('light', {'light.a': {state: 'unavailable'}}), false);
      assert.equal(okFor('light', {}), false);
    });

    it('allow-unknown policy (cover): unknown stays usable, unavailable and missing do not', () => {
      assert.equal(okFor('cover', {'cover.a': {state: 'unknown'}}), true);
      assert.equal(okFor('cover', {'cover.a': {state: 'unavailable'}}), false);
      assert.equal(okFor('cover', {}), false);
    });

    it('always policy and entity "none": ok without any state', () => {
      const widget = {type: 'clock'};
      assert.equal(createRenderContext(hostWith({}, widget), widget, 0).ok, true);
    });

    it('the action widget is ok in state unknown for scene, not for script', () => {
      assert.equal(okFor('action', {'scene.a': {state: 'unknown'}}, 'scene.a'), true);
      assert.equal(okFor('action', {'script.a': {state: 'unknown'}}, 'script.a'), false);
    });
  });

  describe('markup helpers (byte contract)', () => {
    const make = (states, widget, config) => {
      const host = hostWith(states, widget, config);
      return {host, ctx: createRenderContext(host, widget, 2)};
    };

    it('btn writes attributes in a fixed order', () => {
      const {ctx} = make({'light.a': {state: 'on'}}, {type: 'light', entity: 'light.a'});
      assert.equal(
        ctx.btn('light', '<i></i>', 'control active'),
        '<button class="control active" data-action="light" data-entity="light.a" ><i></i></button>'
      );
    });

    it('btn disables when not enabled or pending, and takes an entity and attrs', () => {
      const {ctx} = make({'light.a': {state: 'on'}}, {type: 'light', entity: 'light.a'});
      assert.match(ctx.btn('x', 'c', '', false), /data-entity="light.a" disabled>/);
      assert.equal(
        ctx.btn('x', 'c', 'k', true, {entity: 'a&b', attrs: 'aria-label="L" '}),
        '<button aria-label="L" class="k" data-action="x" data-entity="a&amp;b" >c</button>'
      );
      const pendingHost = createHost({
        states: {'light.a': {state: 'on'}},
        config: {widgets: [{type: 'light', entity: 'light.a'}]},
        pending: ['light.a']
      });
      const pending = createRenderContext(pendingHost, {type: 'light', entity: 'light.a'}, 0);
      assert.match(pending.btn('x', 'c'), /disabled>/);
      assert.doesNotMatch(pending.btn('x', 'c', '', true, {entity: 'light.other'}), /disabled/);
    });

    it('btn defaults to ctx.ok', () => {
      const {ctx} = make({'light.a': {state: 'unavailable'}}, {type: 'light', entity: 'light.a'});
      assert.match(ctx.btn('x', 'c'), /disabled>/);
    });

    it('tile is the root button: data-widget first, tile + cls + extra classes', () => {
      const {ctx} = make({'light.a': {state: 'on'}}, {type: 'light', entity: 'light.a'});
      assert.equal(
        ctx.tile('light', 'X', 'control active'),
        '<button data-widget="2" class="tile widget light size-normal control active" data-action="light" data-entity="light.a" >X</button>'
      );
    });

    it('root is a non-button root', () => {
      const {ctx} = make({'light.a': {state: 'on'}}, {type: 'light', entity: 'light.a'});
      assert.equal(
        ctx.root('section', 'blinds-panel', '<b></b>'),
        '<section data-widget="2" class="tile widget light size-normal blinds-panel"><b></b></section>'
      );
    });

    it('feature(bit) needs ok and the supported_features bit', () => {
      const widget = {type: 'cover', entity: 'cover.a'};
      const {ctx} = make({'cover.a': {state: 'open', attributes: {supported_features: 9}}}, widget);
      assert.equal(ctx.feature(1), true);
      assert.equal(ctx.feature(8), true);
      assert.equal(ctx.feature(2), false);
      const off = make(
        {'cover.a': {state: 'unavailable', attributes: {supported_features: 9}}},
        widget
      );
      assert.equal(off.ctx.feature(1), false);
    });

    it('iconName prefers the configured icon', () => {
      const {ctx} = make({}, {type: 'light', entity: 'light.a', icon: 'mdi:ceiling-light'});
      assert.equal(ctx.iconName('lightbulb'), 'mdi:ceiling-light');
      assert.equal(
        make({}, {type: 'light', entity: 'light.a'}).ctx.iconName('lightbulb'),
        'lightbulb'
      );
    });

    it('stateText replaces underscores, copes with no state, and localizes on request', () => {
      const widget = {type: 'light', entity: 'light.a'};
      const {ctx} = make({'light.a': {state: 'half_open'}}, widget);
      assert.equal(ctx.stateText(), 'half open');
      assert.equal(ctx.stateText({state: 'a_b_c'}), 'a b c');
      assert.equal(make({}, widget).ctx.stateText(), '');

      const localized = createHost({
        states: {'light.a': {state: 'on'}},
        config: {widgets: [widget], localized_states: true},
        hass: {formatEntityState: true}
      });
      assert.equal(createRenderContext(localized, widget, 0).stateText(), 'on (localized)');
      const off = createHost({
        states: {'light.a': {state: 'on'}},
        config: {widgets: [widget]},
        hass: {formatEntityState: true}
      });
      assert.equal(createRenderContext(off, widget, 0).stateText(), 'on');
    });
  });
});

describe('hook context', () => {
  it('adds el, requestRender and a store that survives contexts of the same widget', () => {
    const widget = {type: 'light', entity: 'light.a'};
    const host = hostWith({}, widget);
    const el = {};
    const first = createHookContext(host, widget, 0, el);
    first.store.set('previous', 'active');
    const second = createHookContext(host, widget, 0);
    assert.equal(first.el, el);
    assert.equal(second.el, null);
    assert.equal(second.store.get('previous'), 'active');
    const other = createHookContext(host, {type: 'light', entity: 'light.b'}, 1);
    assert.equal(other.store.size, 0);
  });

  it('requestRender asks the card: _requestWidgetRender, else the mounted element, else all', () => {
    const widget = {type: 'light', entity: 'light.a'};
    const calls = [];
    const host = hostWith({}, widget);
    host._requestWidgetRender = (index) => calls.push(['direct', index]);
    createHookContext(host, widget, 4).requestRender();

    delete host._requestWidgetRender;
    host._renderedCards = new Map([[4, {update: () => calls.push(['element'])}]]);
    createHookContext(host, widget, 4).requestRender();

    host._renderedCards = new Map();
    host._updateWidgets = () => calls.push(['all']);
    createHookContext(host, widget, 4).requestRender();
    assert.deepEqual(calls, [['direct', 4], ['element'], ['all']]);
  });
});

describe('action context', () => {
  const widgets = [
    {type: 'cover', entity: 'light.shared'},
    {type: 'light', entity: 'light.shared'}
  ];

  it('carries action, param, fail and no card for widget actions', () => {
    const host = createHost({config: {widgets}});
    const ctx = createActionContext(host, 'light', 'light.shared', {
      owner: 'light',
      source: 'widget',
      param: ''
    });
    assert.equal(ctx.action, 'light');
    assert.equal(ctx.param, '');
    assert.equal(ctx.card, undefined);
    assert.equal(ctx.root, undefined);
    assert.equal(typeof ctx.call, 'function');
  });

  it('widget is the first configured widget with the entity owned by the action module', () => {
    const host = createHost({config: {widgets}});
    const ctx = createActionContext(host, 'light', 'light.shared', {
      owner: 'light',
      source: 'widget'
    });
    assert.equal(ctx.widget, widgets[1]);
    const cover = createActionContext(host, 'cover-open', 'light.shared', {
      owner: 'cover',
      source: 'widget'
    });
    assert.equal(cover.widget, widgets[0]);
  });

  it('widget is undefined for direct calls and unconfigured entities', () => {
    assert.equal(
      createActionContext(createHost({config: {climate: {}}}), 'up', 'climate.a').widget,
      undefined
    );
    assert.equal(
      createActionContext(createHost({config: {widgets}}), 'light', 'light.zzz').widget,
      undefined
    );
  });

  it('core actions see any widget with the entity', () => {
    const host = createHost({config: {widgets}});
    const hit = resolveAction('toggle');
    assert.equal(createActionContext(host, 'toggle', 'light.shared', hit).widget, widgets[0]);
  });

  it('param comes from the registry hit', () => {
    const ctx = createActionContext(createHost(), 'timer-start-15', 'timer.a', {
      owner: 'timer',
      source: 'widget',
      param: '15'
    });
    assert.equal(ctx.param, '15');
  });

  it('fail puts a message in the feedback line and refreshes', () => {
    const host = createHost();
    createActionContext(host, 'x', 'light.a').fail('Broken');
    assert.equal(host._message, 'Broken');
    assert.equal(host.refreshes, 1);
  });

  it('extension actions get ext state, render, focus and shadow-root lookups', () => {
    const calls = [];
    const focused = [];
    const host = createHost({config: {widgets: []}});
    host._ext = {camera: {open: false}};
    host._render = () => calls.push('render');
    host.shadowRoot = {
      querySelector: (selector) => ({focus: (options) => focused.push([selector, options])})
    };
    const ctx = createActionContext(host, 'camera-grid', 'camera.a', {
      owner: 'camera',
      source: 'extension'
    });
    assert.equal(ctx.ext, host._ext.camera);
    ctx.ext.open = true;
    assert.equal(host._ext.camera.open, true);
    ctx.render();
    ctx.focus('[data-action="camera-back"]');
    assert.deepEqual(calls, ['render']);
    assert.deepEqual(focused, [['[data-action="camera-back"]', {preventScroll: true}]]);
    assert.equal(ctx.card, undefined);
    assert.equal(typeof ctx.q, 'function');
  });

  it('features are core code and get the card', () => {
    const host = createHost();
    const ctx = createActionContext(host, 'dim', undefined, resolveAction('dim'));
    assert.equal(ctx.card, host);
  });

  it('createExtensionContext works without a shadow root', () => {
    const ctx = createExtensionContext(createHost(), 'camera');
    assert.equal(ctx.q('.x'), null);
    assert.doesNotThrow(() => ctx.focus('.x'));
  });
});

describe('controlTile (the shared icon + name + state tile)', () => {
  const tile = (state, widget = {}, options = {}) => {
    const w = {type: 'light', entity: 'light.a', ...widget};
    const host = hostWith(state ? {'light.a': {state}} : {}, w);
    return controlTile(createRenderContext(host, w, 0), {
      action: 'light',
      icon: 'lightbulb-outline',
      ...options
    });
  };

  it('is byte-identical to the markup contract of the control tile', () => {
    assert.equal(
      tile('on'),
      '<button data-widget="0" class="tile widget light size-normal control active" data-action="light" data-entity="light.a" ><ha-icon icon="mdi:lightbulb-outline" aria-hidden="true"></ha-icon><span>light</span><small>on</small></button>'
    );
    assert.equal(
      tile('off', {name: 'Hall', icon: 'mdi:ceiling-light'}),
      '<button data-widget="0" class="tile widget light size-normal control " data-action="light" data-entity="light.a" ><ha-icon icon="mdi:ceiling-light" aria-hidden="true"></ha-icon><span>Hall</span><small>off</small></button>'
    );
  });

  it('unavailable is disabled and says Unavailable', () => {
    assert.match(
      tile('unavailable'),
      /data-entity="light.a" disabled><ha-icon.*<small>Unavailable<\/small>/
    );
    assert.match(tile(null), /disabled>.*<small>Unavailable<\/small>/);
  });

  it('escapes the state text and supports on and sub overrides', () => {
    assert.match(tile('<b>_x'), /<small>&lt;b&gt; x<\/small>/);
    assert.match(tile('off', {}, {on: true}), /control active/);
    assert.match(
      tile('on', {}, {sub: (ctx) => `Level ${ctx.attrs.level ?? 0}`}),
      /<small>Level 0<\/small>/
    );
  });
});

// The small core utilities the contexts are built from.

describe('html helpers', () => {
  it('esc escapes the five characters and stringifies', () => {
    assert.equal(esc(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
    assert.equal(esc(5), '5');
    assert.equal(esc(false), 'false');
    assert.equal(esc(undefined), '');
  });

  it('num is true only for finite numbers', () => {
    assert.deepEqual([1, 0, -1.5].map(num), [true, true, true]);
    assert.deepEqual([NaN, Infinity, '1', null, undefined, {}].map(num), Array(6).fill(false));
  });

  it('iconHTML', () => {
    assert.equal(iconHTML('x'), '<ha-icon icon="mdi:x" aria-hidden="true"></ha-icon>');
    assert.equal(iconHTML(undefined), '<ha-icon icon="mdi:" aria-hidden="true"></ha-icon>');
    assert.equal(iconHTML('phu:bulb'), '<ha-icon icon="phu:bulb" aria-hidden="true"></ha-icon>');
  });

  it('buttonHTML matches the _button markup contract', () => {
    assert.equal(
      buttonHTML('info', 'sensor.a', '<b>x</b>', 'k', true),
      '<button class="k" data-action="info" data-entity="sensor.a" ><b>x</b></button>'
    );
    assert.equal(
      buttonHTML('info', 'a"b', 'x', '', false),
      '<button class="" data-action="info" data-entity="a&quot;b" disabled>x</button>'
    );
    assert.match(buttonHTML('a', 'e', 'x', 'k', true, {pending: true}), /disabled>/);
    assert.match(
      buttonHTML('a', 'e', 'x', 'k', true, {attrs: 'data-widget="1" '}),
      /^<button data-widget="1" class="k"/
    );
  });
});

describe('state helpers', () => {
  it('domainOf', () => {
    assert.equal(domainOf('light.kitchen'), 'light');
    assert.equal(domainOf('nodot'), 'nodot');
    assert.equal(domainOf(undefined), '');
    assert.equal(domainOf(5), '');
  });

  it('isAvailable follows the registry for "unknown"', () => {
    assert.equal(isAvailable({state: 'on'}, 'light.a'), true);
    assert.equal(isAvailable({state: 'unknown'}, 'light.a'), false);
    assert.equal(
      isAvailable({state: 'unknown'}, 'scene.a'),
      true,
      'action registers scene as unknown-ok'
    );
    assert.equal(isAvailable({state: 'unavailable'}, 'scene.a'), false);
    assert.equal(isAvailable(undefined, 'scene.a'), false);
  });

  it('isUsable applies a policy', () => {
    assert.equal(isUsable({state: 'unknown'}, 'cover.a', 'allow-unknown'), true);
    assert.equal(isUsable({state: 'unavailable'}, 'cover.a', 'allow-unknown'), false);
    assert.equal(isUsable(undefined, 'cover.a', 'allow-unknown'), false);
    assert.equal(isUsable(undefined, 'clock', 'always'), true);
    assert.equal(isUsable({state: 'unknown'}, 'cover.a'), false);
    assert.equal(isUsable({state: 'unknown'}, 'cover.a', 'entity'), false);
  });
});

describe('mixin', () => {
  it('copies methods, getters and setters without calling them', () => {
    let reads = 0;
    const source = {
      method() {
        return 'm';
      },
      get value() {
        reads++;
        return this._v ?? 1;
      },
      set value(v) {
        this._v = v;
      }
    };
    class Target {}
    mixin(Target.prototype, source);
    assert.equal(reads, 0, 'the getter was not invoked while copying');
    const t = new Target();
    assert.equal(t.method(), 'm');
    assert.equal(t.value, 1);
    t.value = 5;
    assert.equal(t.value, 5, 'accessors survive and use this');
  });

  it('throws on a duplicate member, from the class or from an earlier mixin', () => {
    class Target {
      render() {}
    }
    assert.throws(() => mixin(Target.prototype, {render() {}}), /duplicate member "render"/);
    mixin(Target.prototype, {a() {}});
    assert.throws(() => mixin(Target.prototype, {a() {}}), /duplicate member "a"/);
  });

  it('copies symbol keys and several sources', () => {
    const key = Symbol('k');
    const target = {};
    mixin(target, {[key]: 1}, {b: 2});
    assert.equal(target[key], 1);
    assert.equal(target.b, 2);
  });
});

describe('events', () => {
  it('fireEvent dispatches a bubbling, composed CustomEvent with the detail', () => {
    const seen = [];
    const node = {dispatchEvent: (event) => seen.push(event)};
    const event = fireEvent(node, 'config-changed', {a: 1});
    assert.equal(seen[0], event);
    assert.deepEqual(
      [event.type, event.detail, event.bubbles, event.composed, event.cancelable],
      ['config-changed', {a: 1}, true, true, false]
    );
    assert.equal(fireEvent(node, 'x', null, {bubbles: false, cancelable: true}).bubbles, false);
  });

  it('moreInfo is hass-more-info with the entity id', () => {
    const seen = [];
    moreInfo({dispatchEvent: (event) => seen.push(event)}, 'light.a');
    assert.equal(seen[0].type, 'hass-more-info');
    assert.deepEqual(seen[0].detail, {entityId: 'light.a'});
    assert.ok(seen[0].bubbles && seen[0].composed);
  });
});

describe('format helpers', () => {
  it('timeZoneOf: only the "server" preference uses the server zone', () => {
    assert.equal(
      timeZoneOf({locale: {time_zone: 'server'}, config: {time_zone: 'Europe/Berlin'}}),
      'Europe/Berlin'
    );
    assert.equal(
      timeZoneOf({locale: {time_zone: 'local'}, config: {time_zone: 'Europe/Berlin'}}),
      undefined
    );
    assert.equal(timeZoneOf({locale: {time_zone: 'server'}}), undefined);
    assert.equal(timeZoneOf(undefined), undefined);
  });

  it('numbers use the user language', () => {
    assert.equal(formatNumber({locale: {language: 'de'}}, 21.55), '21,6');
    assert.equal(formatNumber({locale: {language: 'en-GB'}}, 21.55), '21.6');
    assert.equal(formatNumber(undefined, 3), '3');
    assert.equal(numberFormat({}, {minimumFractionDigits: 1}).format(2), '2.0');
    assert.equal(temperatureUnit({config: {unit_system: {temperature: '°F'}}}), '°F');
    assert.equal(temperatureUnit({}), '°C');
  });

  it('dates use the language and, on request, the server zone', () => {
    const date = new Date(Date.UTC(2026, 9, 15, 23, 30));
    const server = {
      locale: {language: 'en-GB', time_zone: 'server'},
      config: {time_zone: 'Asia/Tokyo'}
    };
    assert.match(formatTime(server, date), /^0?8:30/);
    const local = {
      locale: {language: 'en-GB', time_zone: 'local'},
      config: {time_zone: 'Asia/Tokyo'}
    };
    assert.equal(formatTime(local, date), formatTime({locale: {language: 'en-GB'}}, date));
    const german = dateFormat({locale: {language: 'de'}}, {month: 'long', timeZone: 'UTC'});
    assert.equal(german.format(date), 'Oktober');
    const browser = dateFormat(
      {locale: {language: 'de'}},
      {month: 'long', timeZone: 'UTC'},
      {browserLocale: true}
    );
    assert.equal(
      browser.resolvedOptions().locale,
      new Intl.DateTimeFormat().resolvedOptions().locale
    );
  });
});
