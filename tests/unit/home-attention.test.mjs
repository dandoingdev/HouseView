import test from 'node:test';
import {validateConfig} from '../../src/config/validate.js';
import assert from 'node:assert/strict';
import {attentionItems, attentionIds, discoveredBatteries} from '../../src/core/home-attention.js';
import home from '../../src/overviews/home/index.js';
import {contextFor} from '../../src/core/define-overview.js';
import {registerStrings} from '../../src/core/i18n.js';
import strings from '../../src/overviews/home/strings.js';
import {createMockHass} from '../fixtures/mock-hass.js';

registerStrings(strings);
const now = Date.parse('2026-10-16T12:00:00Z');
const state = (value, minutes = 10, attributes = {}) => ({
  state: value,
  last_changed: new Date(now - minutes * 60000).toISOString(),
  attributes
});
const rule = (entity, kind, extra = {}) => ({entity, kind, ...extra});
const items = (rules, states, time = now) =>
  attentionItems({home_attention: rules}, (id) => states[id], time);

test('only explicit checks appear; open contacts, genuine low batteries, long-running lights, offline devices sort by priority', () => {
  const rules = [
    rule('media_player.a', 'device'),
    rule('light.a', 'light'),
    rule('sensor.a', 'battery'),
    rule('binary_sensor.a', 'opening'),
    rule('binary_sensor.a', 'opening')
  ];
  const states = {
    'binary_sensor.a': state('on'),
    'sensor.a': state('0'),
    'light.a': state('on', 121),
    'media_player.a': state('unavailable'),
    'binary_sensor.unselected': state('on')
  };
  const rows = items(rules, states);
  assert.deepEqual(
    rows.map((r) => r.entity),
    ['binary_sensor.a', 'sensor.a', 'light.a', 'media_player.a']
  );
  assert.equal(rows[1].value, 0);
  assert.equal(rows[2].hours, 2);
  assert.deepEqual(
    attentionIds({home_attention: rules}),
    rules.slice(0, 4).map((r) => r.entity)
  );
});
test('unknown/missing contacts are never reported closed or omitted from an all-clear', () => {
  const rules = [
    rule('binary_sensor.a', 'opening'),
    rule('binary_sensor.b', 'opening'),
    rule('binary_sensor.c', 'opening')
  ];
  assert.deepEqual(
    items(rules, {
      'binary_sensor.a': state('unavailable'),
      'binary_sensor.b': state('unknown')
    }).map((r) => r.reason),
    ['unavailable', 'unknown', 'missing']
  );
});
test('transient unavailable states wait five minutes, recover on state changes, and do not flag normal off devices', () => {
  const r = [rule('climate.a', 'device')];
  assert.equal(items(r, {'climate.a': state('unavailable', 4)}).length, 0);
  assert.equal(items(r, {'climate.a': state('unavailable', 5)}).length, 1);
  assert.equal(items(r, {'climate.a': state('off', 20)}).length, 0);
});
test('battery threshold is inclusive and rejects blank, negative, unknown and malformed readings', () => {
  const r = [rule('sensor.a', 'battery')];
  for (const value of ['', ' ', '-1', 'NaN', 'unknown', 'unavailable']) {
    const rows = items(r, {'sensor.a': state(value)});
    assert(!rows.some((row) => row.reason === 'battery_value'), value);
  }
  assert.equal(items(r, {'sensor.a': state('20')})[0].value, 20);
  assert.equal(items(r, {'sensor.a': state('21')}).length, 0);
  assert.equal(
    items([rule('binary_sensor.a', 'battery')], {'binary_sensor.a': state('on')})[0].reason,
    'battery'
  );
});
test('lights need a genuine continuous-on timestamp; thresholds update as time passes', () => {
  const r = [rule('light.a', 'light')];
  assert.equal(items(r, {'light.a': state('on', 119)}).length, 0);
  assert.equal(items(r, {'light.a': state('on', 119)}, now + 60000).length, 1);
  assert.equal(items(r, {'light.a': {state: 'on'}}).length, 0);
  assert.equal(items(r, {'light.a': state('off', 200)}).length, 0);
  assert.equal(
    items([rule('light.a', 'light', {after: 30})], {'light.a': state('on', 31)}).length,
    1
  );
});
test('Home renders escaped information rows in both modes, watches non-widget entities and ticks without a visible clock', () => {
  const config = {
    widgets: [],
    preview_time: new Date(now).toISOString(),
    home_attention: [rule('binary_sensor.a', 'opening', {name: '<img src=x>'})]
  };
  const hass = createMockHass({states: {'binary_sensor.a': state('on')}}).hass;
  for (const mode of ['card', 'screensaver']) {
    const ctx = contextFor(home, {hass, config, raw: {show_time: false}, mode});
    const html = home.render(ctx, mode);
    assert(html.includes('data-action="info"'));
    assert(html.includes('&lt;img src=x&gt;'));
    assert(!html.includes('<img src=x>'));
    assert(home.watch({}, config).includes('binary_sensor.a'));
    const store = new Map();
    const hook = {...ctx, el: {}, store};
    home.afterRender(hook);
    assert.notEqual(store.get('stamp'), null);
  }
  const ctx = contextFor(home, {
    hass: createMockHass({states: {'binary_sensor.a': state('off')}}).hass,
    config,
    raw: {},
    mode: 'card'
  });
  assert(home.render(ctx, 'card').includes('No issues detected in monitored devices'));
  assert(
    !home
      .render(contextFor(home, {hass, config: {widgets: []}, raw: {}, mode: 'card'}), 'card')
      .includes('House needs attention')
  );
});

test('config rejects malformed attention categories, entity domains, labels and thresholds', () => {
  for (const value of [
    {},
    [rule('light.a', 'opening')],
    [rule('sensor.a', 'light')],
    [rule('light.a', 'battery')],
    [rule('sensor.a', 'unknown')],
    [rule('light.a', 'light', {after: -1})],
    [rule('sensor.a', 'battery', {below: 101})],
    [rule('sensor.a', 'battery', {below: '20'})],
    [rule('sensor.a', 'battery', {name: 42})]
  ]) {
    assert.throws(() => validateConfig({cards: [], home_attention: value}), /home_attention/);
  }
  assert.doesNotThrow(() =>
    validateConfig({
      cards: [],
      home_attention: [
        rule('binary_sensor.a', 'opening'),
        rule('sensor.a', 'battery', {below: 0}),
        rule('light.a', 'light', {after: 0}),
        rule('cover.a', 'device')
      ]
    })
  );
});

test('automatic discovery follows battery device class and visibility, including unassigned binary sensors', () => {
  const hass = {
    states: {
      'sensor.unrelated_name': state('10', 10, {device_class: 'battery'}),
      'binary_sensor.low': state('on', 10, {device_class: 'battery'}),
      'sensor.battery_temperature': state('10', 10, {device_class: 'temperature'}),
      'sensor.hidden': state('1', 10, {device_class: 'battery'}),
      'sensor.disabled': state('1', 10, {device_class: 'battery'}),
      'number.level': state('1', 10, {device_class: 'battery'})
    },
    entities: {'sensor.hidden': {hidden: true}, 'sensor.disabled': {disabled_by: 'user'}}
  };
  assert.deepEqual(
    discoveredBatteries(hass).map((r) => r.entity),
    ['sensor.unrelated_name', 'binary_sensor.low']
  );
  const config = {home_battery_auto: true};
  assert.deepEqual(
    attentionItems(config, (id) => hass.states[id], now, hass).map((r) => r.entity),
    ['sensor.unrelated_name', 'binary_sensor.low']
  );
  assert.deepEqual(
    attentionItems({}, (id) => hass.states[id], now, hass),
    []
  );
});
test('percentage warnings are suppressed while charging; binary low-battery sensors keep their reported semantics', () => {
  const hass = {
    states: {
      'sensor.battery': state('5', 10, {device_class: 'battery'}),
      'binary_sensor.low': state('on', 10, {device_class: 'battery'}),
      'binary_sensor.charging': state('on', 10, {device_class: 'battery_charging'})
    },
    entities: {
      'sensor.battery': {device_id: 'phone'},
      'binary_sensor.low': {device_id: 'phone'},
      'binary_sensor.charging': {device_id: 'phone'}
    }
  };
  const config = {home_battery_auto: true};
  assert(attentionIds(config, hass).includes('binary_sensor.charging'));
  assert.deepEqual(
    attentionItems(config, (id) => hass.states[id], now, hass).map((r) => r.entity),
    ['binary_sensor.low']
  );
  hass.states['binary_sensor.charging'].state = 'off';
  assert.equal(attentionItems(config, (id) => hass.states[id], now, hass).length, 2);
  for (const value of ['unknown', 'unavailable', 'abc', '']) {
    hass.states['sensor.battery'].state = value;
    assert(
      !attentionItems(config, (id) => hass.states[id], now, hass).some(
        (r) => r.entity === 'sensor.battery'
      )
    );
  }
});
test('new batteries and charging sensors enter Home watch lists without adding rules', () => {
  const config = {home_battery_auto: true, widgets: []};
  const hass = {states: {'sensor.a': state('20', 10, {device_class: 'battery'})}, entities: {}};
  assert(home.watch({}, config, hass).includes('sensor.a'));
  hass.states['sensor.new'] = state('1', 10, {device_class: 'battery'});
  assert(home.watch({}, config, hass).includes('sensor.new'));
  assert.throws(() => validateConfig({cards: [], home_battery_auto: 'yes'}), /home_battery_auto/);
});
