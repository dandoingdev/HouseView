// Registry: registration, lookup, derived lists, action ownership, and every way registration can be refused.
import {beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {defineWidget} from '../../src/core/define-widget.js';
import {_resetStrings, translate} from '../../src/core/i18n.js';
import * as registry from '../../src/core/registry.js';

const widget = (type, order, extra = {}) =>
  defineWidget({
    type,
    label: type.toUpperCase(),
    order,
    render: () => `<div>${type}</div>`,
    ...extra
  });

const noop = {run() {}};

beforeEach(() => {
  registry._resetRegistry();
  _resetStrings();
});

describe('registerWidget and lookup', () => {
  it('returns the definition and finds it by type', () => {
    const def = widget('light', 60);
    assert.equal(registry.registerWidget(def), def);
    assert.equal(registry.getWidget('light'), def);
    assert.equal(registry.getWidget('nope'), undefined);
  });

  it('is alias aware: getWidget("scene") is the action widget', () => {
    const action = widget('action', 10, {aliases: ['scene', 'script'], entity: 'custom'});
    registry.registerWidget(action);
    assert.equal(registry.getWidget('scene'), action);
    assert.equal(registry.getWidget('script'), action);
  });

  it('lists widgets by order, whatever the registration order', () => {
    registry.registerWidget(widget('cover', 90));
    registry.registerWidget(widget('action', 10));
    registry.registerWidget(widget('light', 60));
    assert.deepEqual(registry.widgetKinds(), ['action', 'light', 'cover']);
    assert.deepEqual(Object.keys(registry.widgetLabels()), ['action', 'light', 'cover']);
    assert.equal(registry.widgetLabels().light, 'LIGHT');
  });

  it('widgetList returns a copy', () => {
    registry.registerWidget(widget('light', 60));
    registry.widgetList().pop();
    assert.equal(registry.widgetList().length, 1);
  });

  it('knownTypes holds canonical types, aliases and native_card', () => {
    registry.registerWidget(widget('action', 10, {aliases: ['scene'], entity: 'custom'}));
    registry.registerWidget(widget('light', 60));
    assert.deepEqual(registry.knownTypes(), ['action', 'light', 'scene', 'native_card']);
    assert.equal(registry.NATIVE_CARD, 'native_card');
  });

  it('works with nothing registered', () => {
    assert.deepEqual(registry.widgetKinds(), []);
    assert.deepEqual(registry.knownTypes(), ['native_card']);
    assert.deepEqual(registry.unknownOkDomains(), []);
    assert.deepEqual(registry.extensions(), []);
    assert.equal(registry.defaultSizeOf('climate'), 'normal');
    assert.deepEqual(registry.layoutRolesOf('climate'), []);
  });

  it('ignores null, which defineWidget returns for a skipped bad definition', () => {
    assert.equal(registry.registerWidget(null), null);
    assert.equal(registry.registerWidget(undefined), null);
    assert.deepEqual(registry.widgetKinds(), []);
  });

  it('refuses an object that did not come from defineWidget', () => {
    assert.throws(
      () => registry.registerWidget({type: 'x', order: 1, render() {}}),
      /pass the object returned by defineWidget/
    );
  });

  it('derives unknown-ok domains, layout roles and default sizes from the definitions', () => {
    registry.registerWidget(
      widget('action', 10, {entity: 'custom', unknownOkDomains: ['scene', 'button']})
    );
    registry.registerWidget(
      widget('climate', 50, {defaultSize: 'large', layoutRoles: ['climate']})
    );
    registry.registerWidget(widget('calendar', 140, {layoutRoles: ['date']}));
    assert.deepEqual(registry.unknownOkDomains(), ['scene', 'button']);
    assert.equal(registry.defaultSizeOf('climate'), 'large');
    assert.deepEqual(registry.layoutRolesOf('calendar'), ['date']);
    assert.equal(registry.defaultSizeOf('native_card'), 'normal');
  });

  it('lists extensions in picker order', () => {
    const extension = {configKeys: ['camera_gallery']};
    registry.registerWidget(widget('timer', 150, {extension: {}}));
    registry.registerWidget(widget('camera', 40, {extension}));
    registry.registerWidget(widget('light', 60));
    const list = registry.extensions();
    assert.deepEqual(
      list.map((e) => e.type),
      ['camera', 'timer']
    );
    assert.equal(list[0].extension.configKeys[0], 'camera_gallery');
    assert.equal(list[0].def.type, 'camera');
  });

  it('registers the strings passed with the widget', () => {
    registry.registerWidget(widget('cover', 90), {en: {'cover.open': 'Open'}});
    assert.equal(translate('en', 'cover.open'), 'Open');
  });
});

describe('registration is refused for conflicts, and refused atomically', () => {
  it('duplicate type', () => {
    registry.registerWidget(widget('light', 60));
    assert.throws(
      () => registry.registerWidget(widget('light', 61)),
      /duplicate widget type "light"/
    );
  });

  it('duplicate order', () => {
    registry.registerWidget(widget('light', 60));
    assert.throws(() => registry.registerWidget(widget('switch', 60)), /share order 60/);
  });

  it('an alias that is a type, or a type that is an alias', () => {
    registry.registerWidget(widget('light', 60));
    assert.throws(
      () => registry.registerWidget(widget('action', 10, {aliases: ['light'], entity: 'custom'})),
      /alias "light" of "action" is already taken/
    );
    registry.registerWidget(widget('action', 10, {aliases: ['scene'], entity: 'custom'}));
    assert.throws(() => registry.registerWidget(widget('scene', 11)), /already an alias/);
    assert.throws(
      () => registry.registerWidget(widget('other', 12, {aliases: ['scene']})),
      /alias "scene"/
    );
  });

  it('duplicate action name', () => {
    registry.registerWidget(widget('a', 10, {actions: {'a-go': noop}}));
    assert.throws(
      () => registry.registerWidget(widget('b', 20, {actions: {'a-go': noop}})),
      /clashes with action "a-go"/
    );
  });

  it('core and feature names are taken', () => {
    for (const name of ['info', 'toggle', 'dim', 'page-prev', 'page-next', 'page-select']) {
      assert.throws(
        () => registry.registerWidget(widget('x', 10, {actions: {[name]: noop}})),
        /clashes/,
        name
      );
    }
  });

  it('a prefix action clashes with exact names it would cover, and the other way round', () => {
    registry.registerWidget(
      widget('timer', 150, {actions: {'timer-start-*': noop, 'timer-pause': noop}})
    );
    assert.throws(
      () => registry.registerWidget(widget('t2', 160, {actions: {'timer-start-5': noop}})),
      /clashes/
    );
    assert.throws(
      () => registry.registerWidget(widget('t3', 170, {actions: {'timer-*': noop}})),
      /clashes/
    );
  });

  it('actions of one widget may not overlap each other', () => {
    assert.throws(
      () =>
        registry.registerWidget(
          widget('timer', 150, {
            actions: {'timer-*': noop},
            extension: {actions: {'timer-x': noop}}
          })
        ),
      /clashes/
    );
  });

  it('a refused widget leaves no trace', () => {
    registry.registerWidget(widget('a', 10, {actions: {'a-go': noop}}));
    assert.throws(() =>
      registry.registerWidget(
        widget('b', 20, {aliases: ['bb'], actions: {'b-ok': noop, 'a-go': noop}})
      )
    );
    assert.equal(registry.getWidget('b'), undefined);
    assert.equal(registry.getWidget('bb'), undefined);
    assert.equal(registry.resolveAction('b-ok'), null);
    assert.deepEqual(registry.widgetKinds(), ['a']);
  });
});

describe('resolveAction', () => {
  it('finds widget actions, extension actions and prefix actions with their param', () => {
    registry.registerWidget(
      widget('timer', 150, {
        actions: {'timer-start-*': noop, 'timer-pause': noop},
        extension: {actions: {'dismiss-alarm': {immediate: true, run() {}}}}
      })
    );
    const exact = registry.resolveAction('timer-pause');
    assert.deepEqual(
      [exact.owner, exact.source, exact.param, exact.key],
      ['timer', 'widget', '', 'timer-pause']
    );
    const prefixed = registry.resolveAction('timer-start-15');
    assert.deepEqual(
      [prefixed.owner, prefixed.param, prefixed.key],
      ['timer', '15', 'timer-start-*']
    );
    const ext = registry.resolveAction('dismiss-alarm');
    assert.deepEqual([ext.owner, ext.source], ['timer', 'extension']);
    assert.equal(ext.def.immediate, true);
  });

  it('knows the core actions and features without any widget', () => {
    assert.equal(registry.resolveAction('info').owner, 'core');
    assert.equal(registry.resolveAction('toggle').source, 'core');
    for (const name of ['dim', 'page-prev', 'page-next', 'page-select']) {
      const hit = registry.resolveAction(name);
      assert.equal(hit.source, 'feature', name);
      assert.equal(hit.def.immediate, true, name);
    }
  });

  it('returns null for unknown or non-string names', () => {
    assert.equal(registry.resolveAction('bogus'), null);
    assert.equal(registry.resolveAction(undefined), null);
    assert.equal(registry.resolveAction('timer-start'), null);
  });

  it('an exact name wins over a prefix that covers it (when the prefix was registered first)', () => {
    registry.registerWidget(widget('t', 10, {actions: {'t-a-*': noop}}));
    assert.equal(registry.resolveAction('t-a-1').key, 't-a-*');
  });
});

describe('registerFeature', () => {
  it('adds an immediate card-level action', () => {
    const run = () => {};
    registry.registerFeature('card-refresh', {immediate: true, run});
    const hit = registry.resolveAction('card-refresh');
    assert.equal(hit.source, 'feature');
    assert.equal(hit.def.run, run);
  });

  it('validates the action shape and the name', () => {
    assert.throws(() => registry.registerFeature('Bad Name', noop), /not a valid action name/);
    assert.throws(() => registry.registerFeature('card-x', {}), /run must be a function/);
    assert.throws(() => registry.registerFeature('info', noop), /clashes/);
  });
});

describe('onRegistryChange', () => {
  it('fires for widgets and features, and can be unsubscribed', () => {
    const seen = [];
    const off = registry.onRegistryChange((e) => seen.push(e.type));
    registry.registerWidget(widget('light', 60));
    registry.registerFeature('card-x', noop);
    off();
    registry.registerWidget(widget('switch', 70));
    assert.deepEqual(seen, ['widget', 'feature']);
  });

  it('a failing listener does not break registration', () => {
    const originalError = console.error;
    console.error = () => {};
    const off = registry.onRegistryChange(() => {
      throw new Error('boom');
    });
    try {
      assert.doesNotThrow(() => registry.registerWidget(widget('light', 60)));
    } finally {
      off();
      console.error = originalError;
    }
  });
});
