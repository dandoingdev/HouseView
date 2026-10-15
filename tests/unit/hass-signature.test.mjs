// hass change detection: deep (JSON) for mocks, reference compare for real Home Assistant, state_compare override.
import {beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createMockHass} from '../fixtures/mock-hass.js';
import {defineWidget} from '../../src/core/define-widget.js';
import {
  computeSignature,
  hassChanged,
  resolveMode,
  sameSignature,
  watchedIds
} from '../../src/core/hass-signature.js';
import {_resetRegistry, registerWidget} from '../../src/core/registry.js';

const render = () => '';
const def = (type, order, extra = {}) => defineWidget({type, label: type, order, render, ...extra});

beforeEach(() => {
  _resetRegistry();
  registerWidget(def('light', 60));
  registerWidget(def('clock', 20, {entity: 'none'}));
  registerWidget(
    def('camera', 40, {
      extension: {entities: (config) => (config.camera_gallery || []).map((c) => c.entity)}
    })
  );
  registerWidget(def('climate', 50, {watch: (widget) => [widget.outdoor_sensor, 'sun.sun']}));
});

describe('watchedIds', () => {
  it('lists widget entities, widget watch() ids and extension entities, without duplicates', () => {
    const config = {
      widgets: [
        {type: 'light', entity: 'light.a'},
        {type: 'clock'},
        {type: 'climate', entity: 'climate.a', outdoor_sensor: 'sensor.out'},
        {type: 'light', entity: 'light.a'},
        {type: 'native_card', entity: 'sensor.native'},
        {type: 'native_card'}
      ],
      camera_gallery: [{entity: 'camera.a'}, {entity: 'camera.b'}]
    };
    assert.deepEqual(watchedIds(config), [
      'light.a',
      'climate.a',
      'sensor.out',
      'sun.sun',
      'sensor.native',
      'camera.a',
      'camera.b'
    ]);
  });

  it('copes with no config', () => {
    assert.deepEqual(watchedIds(undefined), []);
    assert.deepEqual(watchedIds({widgets: []}), []);
  });
});

describe('mode', () => {
  it('auto: deep for a mock, reference when hass.connection exists', () => {
    assert.equal(resolveMode({}, createMockHass().hass), 'deep');
    assert.equal(resolveMode({}, createMockHass({connection: true}).hass), 'reference');
    assert.equal(resolveMode(undefined, undefined), 'deep');
  });

  it('state_compare overrides', () => {
    const real = createMockHass({connection: true}).hass;
    const mock = createMockHass().hass;
    assert.equal(resolveMode({state_compare: 'deep'}, real), 'deep');
    assert.equal(resolveMode({state_compare: 'reference'}, mock), 'reference');
    assert.equal(resolveMode({state_compare: 'auto'}, real), 'reference');
  });
});

describe('deep signatures (mock hass objects mutate state objects in place)', () => {
  it('an in-place change is detected', () => {
    const mock = createMockHass({states: {'light.a': {state: 'on'}}});
    const before = computeSignature(mock.hass, ['light.a'], 'deep');
    assert.equal(typeof before, 'string');
    assert.ok(sameSignature(before, computeSignature(mock.hass, ['light.a'], 'deep')));
    mock.setState('light.a', {state: 'off'});
    assert.ok(!sameSignature(before, computeSignature(mock.hass, ['light.a'], 'deep')));
  });

  it('attribute changes count, other entities do not', () => {
    const mock = createMockHass({states: {'light.a': {state: 'on'}, 'light.b': {state: 'on'}}});
    const before = computeSignature(mock.hass, ['light.a'], 'deep');
    mock.setState('light.b', {state: 'off'});
    assert.ok(sameSignature(before, computeSignature(mock.hass, ['light.a'], 'deep')));
    mock.setState('light.a', {attributes: {brightness: 5}});
    assert.ok(!sameSignature(before, computeSignature(mock.hass, ['light.a'], 'deep')));
  });

  it('an entity appearing or disappearing counts', () => {
    const mock = createMockHass({states: {}});
    const before = computeSignature(mock.hass, ['light.a'], 'deep');
    mock.setState('light.a', {state: 'on'});
    assert.ok(!sameSignature(before, computeSignature(mock.hass, ['light.a'], 'deep')));
  });
});

describe('reference signatures (real Home Assistant)', () => {
  it('a new state object is a change; the same object, even mutated, is not', () => {
    const mock = createMockHass({connection: true, states: {'light.a': {state: 'on'}}});
    const before = computeSignature(mock.hass, ['light.a'], 'reference');
    assert.equal(typeof before, 'object');
    assert.ok(sameSignature(before, computeSignature(mock.hass, ['light.a'], 'reference')));
    mock.setState('light.a', {state: 'off'}); // in place: reference mode cannot see it, by design
    assert.ok(sameSignature(before, computeSignature(mock.hass, ['light.a'], 'reference')));
    mock.replaceState('light.a', {state: 'off'});
    assert.ok(!sameSignature(before, computeSignature(mock.hass, ['light.a'], 'reference')));
  });

  it('the whole of hass.states is never read', () => {
    const states = new Proxy(
      {'light.a': {state: 'on'}},
      {
        ownKeys() {
          throw new Error('hass.states was enumerated');
        }
      }
    );
    const hass = {states, connection: {}};
    assert.doesNotThrow(() => computeSignature(hass, ['light.a'], 'reference'));
    assert.doesNotThrow(() => computeSignature({states}, ['light.a'], 'deep'));
  });
});

describe('scalars: unit, language, dark mode and time zone', () => {
  const variants = {
    unit: (hass) => (hass.config.unit_system.temperature = '°F'),
    language: (hass) => (hass.locale.language = 'de'),
    darkMode: (hass) => (hass.themes = {darkMode: true}),
    userZone: (hass) => (hass.locale.time_zone = 'server'),
    serverZone: (hass) => (hass.config.time_zone = 'Europe/Berlin')
  };

  for (const mode of ['deep', 'reference']) {
    for (const [name, change] of Object.entries(variants)) {
      it(`${name} changes the ${mode} signature`, () => {
        const hass = createMockHass({connection: mode === 'reference'}).hass;
        const before = computeSignature(hass, [], mode);
        change(hass);
        assert.ok(!sameSignature(before, computeSignature(hass, [], mode)));
      });
    }
  }

  it('missing locale/config do not throw', () => {
    assert.doesNotThrow(() => computeSignature({}, ['light.a'], 'deep'));
    assert.doesNotThrow(() => computeSignature({}, ['light.a'], 'reference'));
    assert.doesNotThrow(() => computeSignature(undefined, [], 'deep'));
  });
});

describe('sameSignature', () => {
  it('different modes never match; nothing never matches', () => {
    const hass = createMockHass().hass;
    assert.ok(
      !sameSignature(computeSignature(hass, [], 'deep'), computeSignature(hass, [], 'reference'))
    );
    assert.ok(!sameSignature(undefined, computeSignature(hass, [], 'deep')));
    assert.ok(!sameSignature(undefined, computeSignature(hass, [], 'reference')));
    assert.ok(!sameSignature(undefined, undefined));
  });
});

describe('hassChanged(card, hass)', () => {
  it('true the first time and after a change, false when nothing watched changed', () => {
    const mock = createMockHass({states: {'light.a': {state: 'on'}, 'light.z': {state: 'on'}}});
    const card = {_config: {widgets: [{type: 'light', entity: 'light.a'}]}};
    assert.equal(hassChanged(card, mock.hass), true);
    assert.equal(hassChanged(card, mock.hass), false);
    mock.setState('light.z', {state: 'off'});
    assert.equal(hassChanged(card, mock.hass), false);
    mock.setState('light.a', {state: 'off'});
    assert.equal(hassChanged(card, mock.hass), true);
    assert.equal(hassChanged(card, mock.hass), false);
  });

  it('works in reference mode too and stores the signature on the card', () => {
    const mock = createMockHass({connection: true, states: {'light.a': {state: 'on'}}});
    const card = {_config: {widgets: [{type: 'light', entity: 'light.a'}]}};
    assert.equal(hassChanged(card, mock.hass), true);
    assert.equal(typeof card._signature, 'object');
    assert.equal(hassChanged(card, mock.hass), false);
    mock.replaceState('light.a', {state: 'off'});
    assert.equal(hassChanged(card, mock.hass), true);
  });

  it('a config change of the compare mode re-renders once', () => {
    const mock = createMockHass({connection: true, states: {'light.a': {state: 'on'}}});
    const card = {_config: {widgets: [{type: 'light', entity: 'light.a'}]}};
    hassChanged(card, mock.hass);
    card._config = {...card._config, state_compare: 'deep'};
    assert.equal(hassChanged(card, mock.hass), true);
    assert.equal(hassChanged(card, mock.hass), false);
  });
});
