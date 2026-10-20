// The `activation` / `autoShow` contract of an overview definition, its normalisation into screensaver entries, the
// round robin that ignores event entries, validation of a screensaver block that holds them, and the editor form.
import test from 'node:test';
import assert from 'node:assert/strict';
import {defineOverview} from '../../src/core/define-overview.js';
import {
  registerOverview,
  validateScreensaver,
  normalizeScreensaver,
  pickEntry
} from '../../src/core/overview-registry.js';
import {registerStrings} from '../../src/core/i18n.js';
import screensaverStrings from '../../src/core/screensaver-strings.js';
import {
  applyScreensaver,
  screensaverSchema,
  screensaverData
} from '../../src/editor/screensaver-form.js';
import {demo} from './_demo-overview.mjs';

const base = {
  type: 'bell',
  label: 'Bell overview',
  order: 970,
  domains: ['binary_sensor'],
  strings: {en: {'bell_overview.label': 'Bell overview', 'bell_overview.description': 'A bell.'}},
  render: () => '<div class="ov-scene"></div>'
};
const eventBase = {...base, activation: 'event', autoShow: (ctx) => ctx.state?.state === 'on'};

test('activation defaults to idle and is exposed on the frozen module', () => {
  const idle = defineOverview(base);
  assert.equal(idle.activation, 'idle');
  assert.equal(idle.autoShow, undefined);
  assert.ok(Object.isFrozen(idle));
  const explicit = defineOverview({...base, activation: 'idle'});
  assert.equal(explicit.activation, 'idle');
  const event = defineOverview(eventBase);
  assert.equal(event.activation, 'event');
  assert.equal(typeof event.autoShow, 'function');
  assert.ok(Object.isFrozen(event));
});

test('an event overview needs an autoShow function; only an event overview may have one', () => {
  assert.throws(() => defineOverview({...base, activation: 'event'}), {
    message: 'Overview bell: an event overview needs an autoShow function.'
  });
  assert.throws(() => defineOverview({...base, activation: 'event', autoShow: 'yes'}), {
    message: 'Overview bell: an event overview needs an autoShow function.'
  });
  assert.throws(() => defineOverview({...base, autoShow: () => true}), {
    message: "Overview bell: autoShow needs activation: 'event'."
  });
  assert.throws(() => defineOverview({...eventBase, activation: 'idle'}), {
    message: "Overview bell: autoShow needs activation: 'event'."
  });
});

test('an unknown activation is refused', () => {
  for (const activation of ['timer', 'IDLE', '', null, 1, true]) {
    if (activation == null) continue; // null / undefined fall back to the default
    assert.throws(() => defineOverview({...base, activation}), {
      message: 'Overview bell: activation must be idle or event.'
    });
  }
  assert.equal(defineOverview({...base, activation: undefined}).activation, 'idle');
});

test('autoWake must be a function when given', () => {
  assert.throws(() => defineOverview({...eventBase, autoWake: true}), {
    message: 'Overview bell: autoWake must be a function.'
  });
  assert.equal(typeof defineOverview({...eventBase, autoWake: () => false}).autoWake, 'function');
});

test('the derived card widget is the same for an event overview', () => {
  const event = defineOverview(eventBase);
  assert.equal(event.widget.type, 'bell_overview');
  assert.equal(event.widget.overview, 'bell');
  assert.equal(event.widget.tag, 'houseview-bell-overview-card');
});

// ---- registry: normalise, pick, validate ----

const idleOverview = demo;
const eventOverview = defineOverview(eventBase);
registerOverview(idleOverview);
registerOverview(eventOverview);

test('normalizeScreensaver marks event entries and keeps everything else', () => {
  const entries = normalizeScreensaver({
    screensaver: [
      {type: 'demo', entity: 'sensor.a', idle_timeout: 30},
      {type: 'bell', entity: 'binary_sensor.b', idle_timeout: 45, enabled: false}
    ]
  });
  assert.equal(entries[0].event, false);
  assert.equal(entries[0].idleTimeout, 30);
  assert.equal(entries[1].event, true);
  assert.equal(entries[1].idleTimeout, 45, 'accepted and kept, but ignored for event entries');
  assert.equal(entries[1].enabled, false);
  assert.equal(entries[1].overview, eventOverview);
  assert.deepEqual(
    normalizeScreensaver({screensaver: {type: 'bell', entity: 'binary_sensor.b'}}).map(
      (e) => e.event
    ),
    [true]
  );
});

test('pickEntry never picks an event entry and keeps the round robin of the others', () => {
  const entries = normalizeScreensaver({
    screensaver: [
      {type: 'demo', entity: 'sensor.a'},
      {type: 'bell', entity: 'binary_sensor.b'},
      {type: 'demo', entity: 'sensor.c'}
    ]
  });
  const picked = [];
  let cursor = 0;
  for (let i = 0; i < 5; i++) {
    const {entry, next} = pickEntry(entries, cursor);
    picked.push(entry.options.entity);
    cursor = next;
  }
  assert.deepEqual(picked, ['sensor.a', 'sensor.c', 'sensor.a', 'sensor.c', 'sensor.a']);
});

test('with only event entries (or none enabled) there is nothing to pick', () => {
  const onlyEvents = normalizeScreensaver({
    screensaver: [
      {type: 'bell', entity: 'binary_sensor.a'},
      {type: 'bell', entity: 'binary_sensor.b'}
    ]
  });
  assert.deepEqual(pickEntry(onlyEvents, 0), {entry: undefined, next: 0});
  assert.deepEqual(pickEntry(onlyEvents, 1), {entry: undefined, next: 1});
  const mixed = normalizeScreensaver({
    screensaver: [
      {type: 'demo', entity: 'sensor.a', enabled: false},
      {type: 'bell', entity: 'binary_sensor.b'}
    ]
  });
  assert.equal(pickEntry(mixed, 0).entry, undefined);
});

test('a screensaver block with event entries validates like any other, idle_timeout included', () => {
  const config = (screensaver) => ({widgets: [{}], screensaver});
  assert.doesNotThrow(() =>
    validateScreensaver(config({type: 'bell', entity: 'binary_sensor.b', idle_timeout: 60}))
  );
  assert.doesNotThrow(() =>
    validateScreensaver(
      config([
        {type: 'demo', entity: 'sensor.a'},
        {type: 'bell', entity: 'binary_sensor.b', idle_timeout: 0}
      ])
    )
  );
  assert.throws(
    () => validateScreensaver(config({type: 'bell', entity: 'binary_sensor.b', idle_timeout: 2})),
    {message: 'Screensaver idle_timeout must be 0 or a number of seconds from 5 to 86400.'}
  );
  assert.throws(() => validateScreensaver(config({type: 'bell', entity: 'sensor.b'})), {
    message: 'bell screensaver needs a binary_sensor entity.'
  });
  assert.throws(() => validateScreensaver(config({type: 'bell'})), {
    message: 'bell screensaver needs a binary_sensor entity.'
  });
  assert.throws(
    () => validateScreensaver(config({type: 'bell', entity: 'binary_sensor.b', preview: 1})),
    {message: 'Screensaver preview must be true or false.'}
  );
});

// ---- editor ----

registerStrings(screensaverStrings);

test('the editor hides idle_timeout for an event overview and keeps it for an idle one', () => {
  const hass = {locale: {language: 'en'}};
  const names = (data) => screensaverSchema(hass, data).map((f) => f.name);
  assert.ok(names({type: 'demo'}).includes('idle_timeout'));
  const event = names({type: 'bell'});
  assert.equal(event.includes('idle_timeout'), false);
  assert.deepEqual(event.slice(0, 3), ['type', 'enabled', 'entity']);
  assert.equal(event.at(-1), 'start_in_edit_mode');
  assert.equal(event.includes('preview'), false);
});

test('an idle_timeout already in the YAML of an event entry survives an edit in the form', () => {
  const config = {screensaver: {type: 'bell', entity: 'binary_sensor.b', idle_timeout: 60}};
  const data = screensaverData(config);
  assert.equal(data.idle_timeout, 60);
  assert.deepEqual(applyScreensaver(config, {...data, preview: true}).screensaver, {
    type: 'bell',
    entity: 'binary_sensor.b',
    idle_timeout: 60,
    preview: true
  });
});
