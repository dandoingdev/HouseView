import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerOverview,
  getOverview,
  overviewList,
  overviewTypes,
  overviewLabels,
  validateScreensaver,
  normalizeScreensaver,
  pickEntry
} from '../../src/core/overview-registry.js';
import {defineOverview} from '../../src/core/define-overview.js';
import {getWidget, widgetByTag} from '../../src/core/registry.js';
import {hasString, t} from '../../src/core/i18n.js';
import {demo} from './_demo-overview.mjs';

registerOverview(demo);
const bad = (screensaver, message, config = {widgets: [{}]}) =>
  assert.throws(() => validateScreensaver({...config, screensaver}), {message});
const ok = {type: 'demo', entity: 'sensor.x'};

test('registry registers the overview, its derived widget and its strings', () => {
  assert.equal(getOverview('demo'), demo);
  assert.equal(getWidget('demo_overview'), demo.widget);
  assert.equal(widgetByTag('houseview-demo-overview-card'), demo.widget);
  assert.deepEqual(
    overviewList().map((o) => o.type),
    ['demo']
  );
  assert.deepEqual(overviewTypes(), ['demo']);
  assert.deepEqual(overviewLabels(), {demo: 'Demo overview'});
  assert.equal(t({}, 'demo_overview.description'), 'A demo.');
  assert.equal(t({}, 'screensaver.dismiss'), 'Dismiss screensaver');
  assert.ok(hasString('screensaver.helper.preview'));
});

test('a duplicate type or order is refused', () => {
  assert.throws(() => registerOverview(demo), {message: 'Duplicate overview: demo'});
  const twin = defineOverview({
    type: 'twin',
    label: 'Twin overview',
    order: 990,
    domains: ['sensor'],
    strings: {en: {'twin_overview.label': 'Twin', 'twin_overview.description': 'Twin.'}},
    render: () => '<div class="ov-scene"></div>'
  });
  assert.throws(() => registerOverview(twin), {message: 'Duplicate overview order: 990'});
  assert.equal(getOverview('twin'), undefined);
});

test('an overview whose widget the registry refuses is not left half registered', () => {
  const define = (type, order) =>
    defineOverview({
      type,
      label: `${type} overview`,
      order,
      domains: ['sensor'],
      strings: {
        en: {[`${type}_overview.label`]: type, [`${type}_overview.description`]: type}
      },
      render: () => '<div class="ov-scene"></div>'
    });
  const first = define('clash', 991);
  registerOverview(first);
  // a second module that (wrongly) carries the first one's derived widget: the widget registry refuses it
  const impostor = Object.freeze({...define('impostor', 992), widget: first.widget});
  assert.throws(() => registerOverview(impostor), /duplicate widget type "clash_overview"/);
  assert.equal(getOverview('impostor'), undefined);
  assert.deepEqual(
    overviewList().map((o) => o.type),
    ['demo', 'clash']
  );
});

test('no screensaver key is a no-op', () => {
  validateScreensaver({widgets: [{}]});
  validateScreensaver({climate: {}}); // a config without cards, untouched
  assert.deepEqual(normalizeScreensaver({widgets: []}), []);
});

test('screensaver block errors (exact strings)', () => {
  bad(5, 'Screensaver must be an object or a list of objects.');
  bad('weather', 'Screensaver must be an object or a list of objects.');
  bad(null, 'Screensaver must be an object or a list of objects.');
  bad([], 'Screensaver list needs at least one entry.');
  bad([null], 'Screensaver must be an object or a list of objects.');
  bad([ok, 'x'], 'Screensaver must be an object or a list of objects.');
  bad({}, 'Screensaver needs a type.');
  bad({type: 'nope'}, 'Unsupported screensaver: nope');
  bad({type: 'demo'}, 'demo screensaver needs a sensor or weather entity.');
  bad({type: 'demo', entity: 'light.x'}, 'demo screensaver needs a sensor or weather entity.');
  bad({type: 'demo', entity: 5}, 'demo screensaver needs a sensor or weather entity.');
  bad({...ok, enabled: 'yes'}, 'Screensaver enabled must be true or false.');
  bad({...ok, preview: 1}, 'Screensaver preview must be true or false.');
  bad({...ok, start_in_edit_mode: 'no'}, 'Screensaver start_in_edit_mode must be true or false.');
  for (const idle_timeout of [-1, 4, 86401, '60', NaN, null, true]) {
    bad(
      {...ok, idle_timeout},
      'Screensaver idle_timeout must be 0 or a number of seconds from 5 to 86400.'
    );
  }
});

test('the order of the checks: type, booleans, idle_timeout, entity, options', () => {
  bad({type: 'nope', enabled: 'x'}, 'Unsupported screensaver: nope');
  bad({type: 'demo', enabled: 'x'}, 'Screensaver enabled must be true or false.');
  bad(
    {type: 'demo', enabled: true, idle_timeout: 1},
    'Screensaver idle_timeout must be 0 or a number of seconds from 5 to 86400.'
  );
  bad(
    {type: 'demo', idle_timeout: 1, flag: 'x'},
    'Screensaver idle_timeout must be 0 or a number of seconds from 5 to 86400.'
  );
  bad({type: 'demo', flag: 'x'}, 'demo screensaver needs a sensor or weather entity.');
  bad({...ok, flag: 'x', level: 99}, 'Demo overview flag must be true or false.');
});

test('option errors come from the option specs', () => {
  bad({...ok, flag: 'x'}, 'Demo overview flag must be true or false.');
  bad({...ok, level: 9}, 'Demo overview level must be a number from 1 to 5.');
  bad({...ok, level: '3'}, 'Demo overview level must be a number from 1 to 5.');
  bad({...ok, mode: 'z'}, 'Demo overview mode must be one of: a, b.');
  bad({...ok, kind: 'z'}, 'Demo kind must be x or y.');
  bad({...ok, picks: ['one', 'zzz']}, 'Demo overview picks must be a list of: one, two, three.');
  bad({...ok, picks: 'one'}, 'Demo overview picks must be a list of: one, two, three.');
  bad({...ok, picks: ['one', 'two', 'three']}, 'Demo overview picks can have at most 2 entries.');
  bad({...ok, peer: 'light.x'}, 'Demo overview peer must be a sun entity.');
  bad({...ok, note: 5}, 'Demo overview note must be text.');
});

test('null falls back to the default; unknown keys are ignored', () => {
  validateScreensaver({
    widgets: [{}],
    screensaver: {...ok, flag: null, level: undefined, mode: null, typo: 'ignored'}
  });
});

test('valid blocks, including 0 and lists', () => {
  validateScreensaver({widgets: [{}], screensaver: {...ok, idle_timeout: 0}});
  validateScreensaver({widgets: [{}], screensaver: {...ok, idle_timeout: 5}});
  validateScreensaver({widgets: [{}], screensaver: {...ok, idle_timeout: 86400}});
  validateScreensaver({widgets: [{}], screensaver: [ok, {...ok, enabled: false}]});
});

test('a failing entry in a list is reported even when it is not the first', () => {
  bad([ok, {...ok, level: 0}], 'Demo overview level must be a number from 1 to 5.');
});

test('normalise: defaults, order, rotation skips disabled entries', () => {
  const entries = normalizeScreensaver({
    screensaver: [
      {...ok, entity: 'sensor.a'},
      {...ok, entity: 'sensor.b', enabled: false},
      {...ok, entity: 'sensor.c', idle_timeout: 30, preview: true, start_in_edit_mode: true}
    ]
  });
  assert.equal(entries[0].idleTimeout, 120);
  assert.equal(entries[0].enabled, true);
  assert.equal(entries[0].preview, false);
  assert.equal(entries[0].startInEditMode, false);
  assert.deepEqual(entries[0].options.picks, ['one']);
  assert.equal(entries[0].options.peer, 'sun.sun');
  assert.equal(entries[0].overview, demo);
  assert.equal(entries[1].enabled, false);
  assert.equal(entries[2].idleTimeout, 30);
  assert.equal(entries[2].preview, true);
  assert.equal(entries[2].startInEditMode, true);
  assert.deepEqual(
    entries.map((e) => e.index),
    [0, 1, 2]
  );
  let pick = pickEntry(entries, 0);
  assert.equal(pick.entry.options.entity, 'sensor.a');
  pick = pickEntry(entries, pick.next);
  assert.equal(pick.entry.options.entity, 'sensor.c');
  pick = pickEntry(entries, pick.next);
  assert.equal(pick.entry.options.entity, 'sensor.a');
  assert.equal(pickEntry([{enabled: false}], 0).entry, undefined);
  assert.equal(pickEntry([], 0).entry, undefined);
});

test('normalise keeps a single object as one entry and never throws on an unknown type', () => {
  assert.equal(normalizeScreensaver({screensaver: ok}).length, 1);
  assert.deepEqual(normalizeScreensaver({screensaver: {type: 'gone'}}), []);
  assert.deepEqual(normalizeScreensaver({screensaver: [null, 5]}), []);
});

test('the default array of an option is copied, never shared', () => {
  const [a, b] = normalizeScreensaver({screensaver: [ok, ok]});
  assert.notEqual(a.options.picks, b.options.picks);
  a.options.picks.push('two');
  assert.deepEqual(b.options.picks, ['one']);
  assert.deepEqual(demo.options.picks.default, ['one']);
});
