import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defineOverview,
  contextFor,
  layerMarkup,
  resolveOptions,
  checkOptions,
  checkEntity,
  RESERVED_KEYS
} from '../../src/core/define-overview.js';
import {createRenderContext, createHookContext} from '../../src/core/context.js';
import {registerOverview} from '../../src/core/overview-registry.js';
import {createHost} from '../fixtures/card-host.mjs';
import {demo} from './_demo-overview.mjs';

const base = {
  type: 'x',
  label: 'X',
  order: 1,
  domains: ['sensor'],
  strings: {en: {'x_overview.label': 'X', 'x_overview.description': 'X.'}},
  render: () => '<div class="ov-scene"></div>'
};

test('shape errors', () => {
  assert.throws(() => defineOverview({...base, type: 'X-1'}), /snake_case/);
  assert.throws(() => defineOverview({...base, render: undefined}), /needs a render function/);
  assert.throws(() => defineOverview({...base, label: ''}), /needs a label/);
  assert.throws(() => defineOverview({...base, order: 'a'}), /integer order/);
  assert.throws(() => defineOverview({...base, entity: 'maybe'}), /required, optional or none/);
  assert.throws(() => defineOverview({...base, domains: []}), /needs entity domains/);
  assert.throws(() => defineOverview({...base, domains: undefined}), /needs entity domains/);
  assert.throws(() => defineOverview({...base, tick: {every: 0, run() {}}}), /tick\.every/);
  assert.throws(
    () => defineOverview({...base, strings: {en: {'x.label': 'X'}}}),
    /must start with x_overview\./
  );
  assert.throws(
    () => defineOverview({...base, strings: {en: {'x_overview.label': 'X'}}}),
    /needs the English string x_overview\.description/
  );
  assert.throws(() => defineOverview({...base, strings: undefined}), /needs the English string/);
  assert.throws(() => defineOverview({...base, options: {entity: {type: 'text'}}}), /reserved/);
  assert.throws(() => defineOverview({...base, options: {q: {type: 'unknown'}}}), /unknown type/);
  assert.throws(
    () => defineOverview({...base, options: {q: {type: 'enum'}}}),
    /needs a non-empty values list/
  );
  assert.throws(
    () => defineOverview({...base, options: {q: {type: 'enum_list', values: []}}}),
    /needs a non-empty values list/
  );
  assert.throws(
    () => defineOverview({...base, options: {q: {type: 'entity'}}}),
    /needs entity domains/
  );
  assert.ok(defineOverview({...base, entity: 'none', domains: []}));
  for (const key of RESERVED_KEYS) {
    assert.throws(() => defineOverview({...base, options: {[key]: {type: 'text'}}}), /reserved/);
  }
  assert.ok(RESERVED_KEYS.includes('idle_timeout'));
});

test('the module and its options are frozen', () => {
  assert.ok(
    Object.isFrozen(demo) && Object.isFrozen(demo.options) && Object.isFrozen(demo.options.flag)
  );
  assert.ok(
    Object.isFrozen(demo.options.picks.values) && Object.isFrozen(demo.options.picks.default)
  );
  assert.ok(
    Object.isFrozen(demo.domains) && Object.isFrozen(demo.tap) && Object.isFrozen(demo.strings.en)
  );
  assert.throws(() => {
    'use strict';
    demo.options.flag.default = false;
  }, TypeError);
});

test("the author's own objects are not frozen by defineOverview", () => {
  const options = {flag: {type: 'boolean', default: true}};
  const strings = {en: {'x_overview.label': 'X', 'x_overview.description': 'X.'}};
  defineOverview({...base, options, strings});
  assert.equal(Object.isFrozen(options), false);
  assert.equal(Object.isFrozen(strings.en), false);
});

test('defaults: entity required, no options, card tap is info', () => {
  const o = defineOverview(base);
  assert.equal(o.entity, 'required');
  assert.deepEqual(o.options, {});
  assert.deepEqual(o.tap, {card: 'info'});
  assert.equal(defineOverview({...base, tap: {card: 'none'}}).tap.card, 'none');
});

test('derived widget: same registry contract as every other widget', () => {
  const w = demo.widget;
  assert.equal(w.type, 'demo_overview');
  assert.equal(w.tag, 'houseview-demo-overview-card');
  assert.equal(w.overview, 'demo');
  assert.equal(w.label, 'Demo overview');
  assert.equal(w.order, 1190);
  assert.equal(w.entity, 'custom');
  assert.equal(w.defaultSize, 'large');
  assert.equal(w.availability, 'always');
  assert.equal(w.standaloneHeight, 380);
  assert.equal(w.cardRows, 6);
  assert.deepEqual(w.gridOptions, {min_columns: 3, min_rows: 4});
  assert.deepEqual(w.domains, ['sensor', 'weather']);
  assert.deepEqual(Object.keys(w.options), Object.keys(demo.options));
  assert.deepEqual(w.actions, {});
  assert.throws(() => w.validate({entity: 'light.x'}), {
    message: 'demo overview needs a sensor or weather entity.'
  });
  assert.throws(() => w.validate({entity: 'sensor.x', mode: 'q'}), {
    message: 'Demo overview mode must be one of: a, b.'
  });
  w.validate({entity: 'sensor.x'});
  assert.deepEqual(w.watch({entity: 'sensor.x'}), ['sensor.x', 'sun.sun']);
  assert.equal(w.afterRender, undefined);
  assert.equal(w.tick, undefined);
});

test('the tag of a multi-word type uses dashes', () => {
  const o = defineOverview({
    ...base,
    type: 'now_playing',
    strings: {
      en: {'now_playing_overview.label': 'N', 'now_playing_overview.description': 'N.'}
    }
  });
  assert.equal(o.widget.tag, 'houseview-now-playing-overview-card');
  assert.equal(o.widget.type, 'now_playing_overview');
});

test('the context can read Home Assistant and cannot change it', () => {
  const hass = {
    states: {'sensor.x': {state: '1', attributes: {friendly_name: '<b>x</b>'}}},
    callService() {
      throw new Error('called');
    }
  };
  const ctx = contextFor(demo, {hass, config: {}, raw: {entity: 'sensor.x'}, mode: 'screensaver'});
  for (const forbidden of ['call', 'card', 'confirm', 'callService', 'isPending', 'info', 'tile'])
    assert.equal(forbidden in ctx, false, forbidden);
  assert.equal(ctx.name, '&lt;b&gt;x&lt;/b&gt;');
  assert.equal(ctx.rawName, '<b>x</b>');
  assert.equal(ctx.ok, true);
  assert.equal(ctx.mode, 'screensaver');
  assert.equal(ctx.overview, 'demo');
  assert.deepEqual(ctx.data, {daily: null});
  assert.equal(
    demo.render(ctx, 'screensaver'),
    '<div class="ov-scene">&lt;b&gt;x&lt;/b&gt;|screensaver</div>'
  );
  assert.throws(() => contextFor(demo, {hass, raw: {}, mode: 'tablet'}), /Unknown overview mode/);
});

test('ok is false for a missing, unavailable or unknown entity; the name falls back to the label', () => {
  const at = (states, raw = {entity: 'sensor.x'}) =>
    contextFor(demo, {hass: {states}, config: {}, raw, mode: 'card'});
  assert.equal(at({}).ok, false);
  assert.equal(at({}).name, 'Demo overview');
  assert.equal(at({'sensor.x': {state: 'unavailable', attributes: {}}}).ok, false);
  assert.equal(at({'sensor.x': {state: 'unknown', attributes: {}}}).ok, false);
  assert.equal(
    at({'sensor.x': {state: '1', attributes: {}}}, {entity: 'sensor.x', name: 'Mine'}).name,
    'Mine'
  );
  assert.equal(at({}, {}).ok, false);
});

test('the other helpers: escape, number, icon, translate, units', () => {
  const ctx = contextFor(demo, {
    hass: {states: {}, config: {unit_system: {temperature: '°F'}}, locale: {language: 'en'}},
    config: {},
    raw: {entity: 'sensor.x'},
    mode: 'card'
  });
  assert.equal(ctx.esc('<&>'), '&lt;&amp;&gt;');
  assert.equal(ctx.num(1), true);
  assert.equal(ctx.num('1'), false);
  assert.equal(ctx.icon('lamp'), '<ha-icon icon="mdi:lamp" aria-hidden="true"></ha-icon>');
  assert.equal(ctx.icon('hass:lamp'), '<ha-icon icon="hass:lamp" aria-hidden="true"></ha-icon>');
  assert.equal(ctx.t('screensaver.more_info', {name: 'Home'}), 'More info: Home');
  assert.equal(ctx.unit(), '°F');
  assert.equal(ctx.lang(), 'en');
  assert.equal(ctx.formatNumber(-0.4), '-0');
  assert.equal(ctx.formatNumber(12.6), '13');
  assert.equal(ctx.formatNumber(1.25, {maximumFractionDigits: 1}), '1.3');
});

test('preview_time drives now(); time parts follow the user format and zone', () => {
  const hass = {
    states: {},
    locale: {language: 'en-GB', time_format: '24', time_zone: 'server'},
    config: {time_zone: 'Asia/Tokyo'}
  };
  const ctx = contextFor(demo, {
    hass,
    config: {preview_time: '2026-10-15T10:09:00+01:00'},
    raw: {entity: 'sensor.x'},
    mode: 'card'
  });
  assert.equal(ctx.now(), Date.parse('2026-10-15T10:09:00+01:00'));
  assert.equal(ctx.timeParts(ctx.now()).main, '18:09'); // Tokyo is UTC+9
  assert.equal(ctx.dayOffset(Date.parse('2026-10-16T10:09:00+01:00')), 1);
});

test('12 hour time has a day period; the display zone decides "today"', () => {
  const at = (locale, zone, preview = '2026-10-15T23:30:00Z') =>
    contextFor(demo, {
      hass: {states: {}, locale, config: {time_zone: zone}},
      config: {preview_time: preview},
      raw: {entity: 'sensor.x'},
      mode: 'card'
    });
  const twelve = at(
    {language: 'en-US', time_format: '12', time_zone: 'server'},
    'America/New_York'
  );
  const parts = twelve.timeParts(Date.parse('2026-10-15T14:09:00Z'));
  assert.equal(parts.main, '10:09');
  assert.equal(parts.period, 'AM');
  assert.match(parts.text, /^10:09\sAM$/);
  const twentyFour = at(
    {language: 'en-US', time_format: '24', time_zone: 'server'},
    'America/New_York'
  );
  const p24 = twentyFour.timeParts(Date.parse('2026-10-15T20:09:00Z'));
  assert.equal(p24.main, '16:09');
  assert.equal(p24.period, '');
  // 23:30 UTC is already the next day in Tokyo, still today in New York
  const tokyo = at({language: 'en', time_zone: 'server'}, 'Asia/Tokyo');
  const newYork = at({language: 'en', time_zone: 'server'}, 'America/New_York');
  const tomorrowUtc = Date.parse('2026-10-16T12:00:00Z');
  assert.equal(tokyo.dayOffset(tomorrowUtc), 0);
  assert.equal(newYork.dayOffset(tomorrowUtc), 1);
  assert.deepEqual(tokyo.localParts(Date.parse('2026-10-15T23:30:00Z')), {
    year: 2026,
    month: 10,
    day: 16,
    hour: 8,
    minute: 30
  });
  assert.equal(newYork.localParts(Date.parse('2026-10-16T04:00:00Z')).hour, 0); // midnight is 0, never 24
});

test('a malformed language tag or time zone falls back to the browser instead of throwing', () => {
  const ctx = contextFor(demo, {
    hass: {
      states: {},
      locale: {language: 'not a tag', time_zone: 'server'},
      config: {time_zone: 'Nowhere/Land'}
    },
    config: {},
    raw: {entity: 'sensor.x'},
    mode: 'card'
  });
  assert.match(ctx.timeParts(0).main, /\d/);
  assert.equal(typeof ctx.formatNumber(3), 'string');
  assert.equal(typeof ctx.dayOffset(0), 'number');
});

test('data is read with peek() and never undefined', () => {
  const ctx = contextFor(demo, {hass: {states: {}}, config: {}, raw: {}, mode: 'card'});
  assert.deepEqual(ctx.data, {}); // no entity: demo declares no spec
  const withEntity = contextFor(demo, {
    hass: {
      states: {
        'weather.h': {
          state: 'x',
          attributes: {
            forecast: [{datetime: '2026-10-15T00:00:00Z'}, {datetime: '2026-10-16T00:00:00Z'}]
          }
        }
      }
    },
    config: {},
    raw: {entity: 'weather.h'},
    mode: 'card'
  });
  assert.equal(withEntity.data.daily.length, 2); // attributes.forecast fallback
});

test('resolveOptions applies defaults, copies arrays and drops unknown keys', () => {
  const options = resolveOptions(demo, {entity: 'sensor.x', level: 4, typo: 1, flag: null});
  assert.deepEqual(options, {
    entity: 'sensor.x',
    name: undefined,
    flag: true,
    level: 4,
    mode: 'a',
    kind: 'x',
    picks: ['one'],
    peer: 'sun.sun',
    note: undefined
  });
  assert.notEqual(options.picks, demo.options.picks.default);
  assert.deepEqual(Object.keys(resolveOptions(demo)).slice(0, 2), ['entity', 'name']);
});

test('checkOptions: every type, every message', () => {
  const bad = (patch, message) =>
    assert.throws(() => checkOptions(demo, {...resolveOptions(demo, {}), ...patch}), {message});
  bad({flag: 1}, 'Demo overview flag must be true or false.');
  bad({level: Infinity}, 'Demo overview level must be a number from 1 to 5.');
  bad({level: 0}, 'Demo overview level must be a number from 1 to 5.');
  bad({note: {}}, 'Demo overview note must be text.');
  bad({picks: ['one', 'two', 'three']}, 'Demo overview picks can have at most 2 entries.');
  bad({peer: 'sun'}, 'Demo overview peer must be a sun entity.');
  checkOptions(demo, resolveOptions(demo, {level: 5, picks: ['one', 'two'], note: 'hi'}));
});

test('a number option without a range, a validate() hook and a multi-domain entity message', () => {
  const o = defineOverview({
    ...base,
    domains: ['sensor', 'weather', 'climate'],
    options: {n: {type: 'number', default: 1}},
    validate: (options) => {
      if (options.n === 7) throw new Error('Seven is not allowed.');
    }
  });
  assert.throws(() => checkOptions(o, {n: 'x'}), {message: 'X n must be a number.'});
  assert.throws(() => checkOptions(o, {n: 7}), {message: 'Seven is not allowed.'});
  checkOptions(o, {n: 2});
  assert.throws(() => checkEntity(o, 'light.x', 'screensaver'), {
    message: 'x screensaver needs a sensor or weather or climate entity.'
  });
});

test('entity rules: optional accepts nothing or a right domain, none accepts anything', () => {
  const optional = defineOverview({...base, entity: 'optional'});
  checkEntity(optional, undefined, 'screensaver');
  checkEntity(optional, 'sensor.x', 'screensaver');
  assert.throws(() => checkEntity(optional, 'light.x', 'screensaver'), {
    message: 'x screensaver entity must be a sensor entity.'
  });
  const none = defineOverview({...base, entity: 'none', domains: []});
  checkEntity(none, undefined, 'overview');
  checkEntity(none, 'anything', 'overview');
});

test('layer markup is a labelled modal dialog with one dismiss button', () => {
  const html = layerMarkup(demo, '<div class="ov-scene"></div>', {
    label: 'Demo "x"',
    dismiss: 'Dismiss screensaver'
  });
  assert.match(
    html,
    /^<div class="hv-screensaver" data-screensaver="demo" data-state="entering" role="dialog" aria-modal="true" aria-label="Demo &quot;x&quot;">/
  );
  assert.match(
    html,
    /<div class="ov ov-demo ov-mode-screensaver"><div class="ov-scene"><\/div><\/div>/
  );
  assert.match(
    html,
    /<button type="button" class="ov-dismiss" aria-label="Dismiss screensaver"><\/button><\/div>$/
  );
});

test('a pinned layer has a close button and no full-area dismiss', () => {
  const html = layerMarkup(demo, '<div class="ov-scene"></div>', {
    label: 'Weather',
    dismiss: 'Close',
    pinned: true
  });
  assert.match(html, /class="hv-screensaver hv-pinned"/);
  assert.match(
    html,
    /<button type="button" class="ov-panel-key ov-panel-close ov-manual-close" data-action="overview-close" aria-label="Close"><ha-icon class="ov-panel-icon" icon="mdi:close" aria-hidden="true"><\/ha-icon><\/button><\/div>$/
  );
  assert.equal(html.includes('ov-dismiss'), false);
});

// ---- the derived widget through the real widget engine ----

registerOverview(demo);
const widgetFor = (widget) => ({type: 'demo_overview', ...widget});
const hostFor = (states, widget) =>
  createHost({
    states,
    config: {widgets: [widgetFor(widget)], preview_time: '2026-10-15T10:09:00+01:00'}
  });

test('card mode: the section, the scene and the more-info button', () => {
  const host = hostFor(
    {'sensor.x': {state: '1', attributes: {friendly_name: 'Pool'}}},
    {entity: 'sensor.x'}
  );
  const ctx = createRenderContext(host, host._config.widgets[0], 3);
  const html = demo.widget.render(ctx);
  assert.match(
    html,
    /^<section data-widget="3" class="ov ov-demo ov-mode-card size-large" data-overview="demo">/
  );
  assert.ok(html.includes('<div class="ov-scene">Pool|card</div>'));
  assert.match(
    html,
    /<button aria-label="More info: Pool" class="ov-tap" data-action="info" data-entity="sensor\.x" ><\/button><\/section>$/
  );
  assert.equal(html.includes('class="tile'), false);
  assert.equal(html.includes(' widget '), false);
});

test('card mode: size, a missing entity (disabled tap), tap none', () => {
  const missing = hostFor({}, {entity: 'sensor.x', size: 'wide'});
  const html = demo.widget.render(createRenderContext(missing, missing._config.widgets[0], 0));
  assert.ok(html.includes('size-wide'));
  assert.match(html, /class="ov-tap" data-action="info" data-entity="sensor\.x" disabled>/);

  const quiet = defineOverview({
    ...base,
    type: 'quiet',
    order: 2,
    tap: {card: 'none'},
    strings: {en: {'quiet_overview.label': 'Q', 'quiet_overview.description': 'Q.'}}
  });
  registerOverview(quiet);
  const host = createHost({
    states: {'sensor.x': {state: '1', attributes: {}}},
    config: {widgets: [{type: 'quiet_overview', entity: 'sensor.x'}]}
  });
  const out = quiet.widget.render(createRenderContext(host, host._config.widgets[0], 0));
  assert.equal(out.includes('ov-tap'), false);
});

test('card mode: a hostile name cannot create an element', () => {
  const evil = '<img src=x onerror=alert(1)>"\'';
  const host = hostFor(
    {'sensor.x': {state: '1', attributes: {friendly_name: evil}}},
    {entity: 'sensor.x'}
  );
  const html = demo.widget.render(createRenderContext(host, host._config.widgets[0], 0));
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('onerror=alert(1)>'), false);
  assert.ok(html.includes('&lt;img'));
});

test('card mode: rendering never calls a service', () => {
  const host = hostFor({'sensor.x': {state: '1', attributes: {}}}, {entity: 'sensor.x'});
  host._hass.callService = () => {
    throw new Error('callService');
  };
  demo.widget.render(createRenderContext(host, host._config.widgets[0], 0));
});

test('afterRender and tick wrappers rebuild the overview hook context', () => {
  const seen = [];
  const hooked = defineOverview({
    ...base,
    type: 'hooked',
    order: 3,
    strings: {en: {'hooked_overview.label': 'H', 'hooked_overview.description': 'H.'}},
    afterRender: (ctx) =>
      seen.push([
        'after',
        ctx.mode,
        ctx.el,
        ctx.options.entity,
        typeof ctx.requestRender,
        ctx.store
      ]),
    tick: {every: 2000, run: (ctx) => seen.push(['tick', ctx.mode, ctx.el, ctx.now()])}
  });
  registerOverview(hooked);
  assert.equal(hooked.widget.tick.every, 2000);
  const host = createHost({
    states: {'sensor.x': {state: '1', attributes: {}}},
    config: {
      widgets: [{type: 'hooked_overview', entity: 'sensor.x'}],
      preview_time: '2026-10-15T10:09:00+01:00'
    }
  });
  const el = {tag: 'section'};
  const hctx = createHookContext(host, host._config.widgets[0], 0, el);
  hooked.widget.afterRender(hctx);
  hooked.widget.tick.run(hctx);
  assert.deepEqual(seen[0].slice(0, 5), ['after', 'card', el, 'sensor.x', 'function']);
  assert.ok(seen[0][5] instanceof Map);
  assert.deepEqual(seen[1], ['tick', 'card', el, Date.parse('2026-10-15T10:09:00+01:00')]);
});
