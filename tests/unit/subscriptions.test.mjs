import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquire,
  peek,
  configure,
  openCount,
  forecastSpec,
  legacyForecast,
  messageSpec,
  eventSpec,
  supportsForecast
} from '../../src/core/subscriptions.js';

/** Fake grace timers and a fake websocket connection that records subscriptions and unsubscriptions. */
function fake() {
  const timers = [];
  let id = 0;
  configure({
    graceMs: 2000,
    setTimeout: (fn, ms) => {
      timers.push({id: ++id, fn, ms});
      return id;
    },
    clearTimeout: (i) => {
      const k = timers.findIndex((t) => t.id === i);
      if (k >= 0) timers.splice(k, 1);
    }
  });
  const subs = [];
  const unsubbed = [];
  const connection = {
    subscribeMessage: (callback, message) =>
      new Promise((resolve) => {
        subs.push({callback, message});
        resolve(() => unsubbed.push(message));
      }),
    subscribeEvents: (callback, type) =>
      new Promise((resolve) => {
        subs.push({callback, type});
        resolve(() => unsubbed.push(type));
      })
  };
  const hass = {
    connection,
    states: {'weather.home': {state: 'sunny', attributes: {supported_features: 3}}}
  };
  return {timers, subs, unsubbed, hass, fire: () => timers.splice(0).forEach((t) => t.fn())};
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
const quiet = (fn) => {
  const original = console.error;
  const seen = [];
  console.error = (...args) => seen.push(args);
  try {
    return fn(seen);
  } finally {
    console.error = original;
  }
};

test('dedupe, replay, grace unsubscribe', async () => {
  const f = fake();
  const spec = forecastSpec('weather.home', 'daily');
  const seen = [];
  const a = acquire(f.hass, spec, () => seen.push('a'));
  const b = acquire(f.hass, spec, () => seen.push('b'));
  await settle();
  assert.equal(f.subs.length, 1);
  assert.equal(openCount(), 1);
  assert.deepEqual(f.subs[0].message, {
    type: 'weather/subscribe_forecast',
    forecast_type: 'daily',
    entity_id: 'weather.home'
  });
  f.subs[0].callback({type: 'daily', forecast: [{datetime: 'x', temperature: 3}]});
  assert.deepEqual(seen, ['a', 'b']);
  assert.equal(peek(f.hass, spec)[0].temperature, 3);
  f.subs[0].callback({type: 'daily', forecast: [{datetime: 'x', temperature: 3}]}); // identical: no notify
  assert.deepEqual(seen, ['a', 'b']);
  a.release();
  a.release(); // releasing twice is harmless
  assert.equal(f.timers.length, 0);
  b.release();
  assert.equal(f.timers.length, 1);
  assert.equal(f.timers[0].ms, 2000);
  assert.equal(f.unsubbed.length, 0);
  assert.equal(peek(f.hass, spec)[0].temperature, 3); // still served during the grace period
  const c = acquire(f.hass, spec);
  assert.equal(f.timers.length, 0);
  assert.equal(f.subs.length, 1); // re-lease inside grace: no new websocket subscription
  c.release();
  f.fire();
  assert.equal(f.unsubbed.length, 1);
  assert.equal(openCount(), 0);
  assert.equal(peek(f.hass, spec), null);
});

test('a different payload is delivered; a null forecast falls back', async () => {
  const f = fake();
  const spec = forecastSpec('weather.home', 'daily');
  let n = 0;
  const lease = acquire(f.hass, spec, () => n++);
  await settle();
  f.subs[0].callback({forecast: [{temperature: 1}]});
  f.subs[0].callback({forecast: [{temperature: 2}]});
  assert.equal(n, 2);
  assert.equal(peek(f.hass, spec)[0].temperature, 2);
  f.hass.states['weather.home'].attributes.forecast = [
    {datetime: '2026-10-15T00:00:00Z'},
    {datetime: '2026-10-16T00:00:00Z'}
  ];
  f.subs[0].callback({forecast: null});
  assert.equal(n, 3);
  assert.equal(peek(f.hass, spec).length, 2); // no payload value: attributes.forecast serves
  lease.release();
  f.fire();
});

test('release before confirmation still unsubscribes', async () => {
  const f = fake();
  const spec = forecastSpec('weather.home', 'hourly');
  const lease = acquire(f.hass, spec);
  lease.release();
  f.fire();
  assert.equal(openCount(), 0);
  await settle();
  assert.equal(f.unsubbed.length, 1);
});

test('values arriving after the entry closed are ignored', async () => {
  const f = fake();
  const spec = forecastSpec('weather.home', 'hourly');
  let n = 0;
  const lease = acquire(f.hass, spec, () => n++);
  await settle();
  lease.release();
  f.fire();
  f.subs[0].callback({forecast: [{temperature: 1}]});
  assert.equal(n, 0);
  assert.equal(peek(f.hass, spec), null);
});

test('unsupported feature bit: no subscription, fallback only', async () => {
  const f = fake();
  f.hass.states['weather.home'].attributes.supported_features = 1; // daily only
  f.hass.states['weather.home'].attributes.forecast = [
    {datetime: '2026-10-15T00:00:00Z'},
    {datetime: '2026-10-16T00:00:00Z'}
  ];
  const hourly = forecastSpec('weather.home', 'hourly');
  assert.equal(acquire(f.hass, hourly).live, false);
  await settle();
  assert.equal(f.subs.length, 0);
  assert.equal(peek(f.hass, hourly), null);
  assert.equal(peek(f.hass, forecastSpec('weather.home', 'daily')).length, 2);
});

test('a missing entity is not subscribed; a non-numeric feature field tries and falls back', async () => {
  const f = fake();
  assert.equal(acquire(f.hass, forecastSpec('weather.nowhere', 'daily')).live, false);
  assert.equal(supportsForecast(undefined, 'daily'), false);
  assert.equal(supportsForecast({attributes: {}}, 'daily'), true);
  assert.equal(supportsForecast({attributes: {supported_features: 4}}, 'daily'), false);
  assert.equal(supportsForecast({attributes: {supported_features: 3}}, 'hourly'), true);
  f.hass.states['weather.home'].attributes.supported_features = undefined;
  assert.equal(acquire(f.hass, forecastSpec('weather.home', 'daily')).live, true);
  await settle();
  assert.equal(f.subs.length, 1);
});

test('no connection: fallback; rejected subscribe: notify once and fall back', async () => {
  const list = [{datetime: '2026-10-15T00:00:00Z'}, {datetime: '2026-10-16T00:00:00Z'}];
  const hass = {states: {'weather.home': {state: 'x', attributes: {forecast: list}}}};
  assert.equal(acquire(hass, forecastSpec('weather.home', 'daily')).live, false);
  assert.equal(peek(hass, forecastSpec('weather.home', 'daily')).length, 2);

  const f = fake();
  f.hass.connection.subscribeMessage = () => Promise.reject(new Error('nope'));
  f.hass.states['weather.home'].attributes.forecast = list;
  let n = 0;
  acquire(f.hass, forecastSpec('weather.home', 'daily'), () => n++);
  await settle();
  assert.equal(n, 1);
  assert.equal(peek(f.hass, forecastSpec('weather.home', 'daily')).length, 2);
});

test('a subscribe that throws synchronously counts as a failure, not an exception', async () => {
  const f = fake();
  f.hass.connection.subscribeMessage = () => {
    throw new Error('sync');
  };
  let n = 0;
  assert.doesNotThrow(() => acquire(f.hass, forecastSpec('weather.home', 'daily'), () => n++));
  await settle();
  assert.equal(n, 1);
});

test('a throwing consumer does not stop the other leases', async () => {
  const f = fake();
  const spec = forecastSpec('weather.home', 'daily');
  const seen = [];
  acquire(f.hass, spec, () => {
    throw new Error('boom');
  });
  acquire(f.hass, spec, () => seen.push('second'));
  await settle();
  quiet(() => f.subs[0].callback({forecast: [{temperature: 1}]}));
  assert.deepEqual(seen, ['second']);
});

test('one subscription per connection and spec id', async () => {
  const f = fake();
  const other = fake();
  configure({}); // keep f's timers: nothing to do here, other's were installed last
  const spec = forecastSpec('weather.home', 'daily');
  acquire(f.hass, spec);
  acquire(other.hass, spec);
  acquire(f.hass, forecastSpec('weather.home', 'hourly'));
  await settle();
  assert.equal(f.subs.length, 2);
  assert.equal(other.subs.length, 1);
});

test('attributes.forecast is served to the type it looks like', () => {
  const daily = [{datetime: '2026-10-15T00:00:00Z'}, {datetime: '2026-10-16T00:00:00Z'}];
  const hourly = [{datetime: '2026-10-15T00:00:00Z'}, {datetime: '2026-10-15T01:00:00Z'}];
  const entity = (forecast) => ({attributes: {forecast}});
  assert.equal(legacyForecast(entity(daily), 'daily'), daily);
  assert.equal(legacyForecast(entity(daily), 'hourly'), null);
  assert.equal(legacyForecast(entity(hourly), 'hourly'), hourly);
  assert.equal(legacyForecast(entity(hourly), 'daily'), null);
  assert.equal(legacyForecast(entity([{datetime: 'x'}]), 'daily').length, 1);
  assert.equal(legacyForecast(entity([]), 'daily'), null);
  assert.equal(legacyForecast({attributes: {}}, 'daily'), null);
  assert.equal(legacyForecast(undefined, 'daily'), null);
});

test('messageSpec and eventSpec subscribe through the connection and map payloads', async () => {
  const f = fake();
  const message = {type: 'energy/get_prefs'};
  const m = messageSpec('energy-prefs', message, {map: (event) => event.value});
  const e = eventSpec('timer-finished', 'timer.finished', {map: (event) => event.data});
  assert.equal(m.id, 'energy-prefs');
  acquire(f.hass, m);
  acquire(f.hass, e);
  await settle();
  assert.deepEqual(f.subs[0].message, message);
  assert.equal(f.subs[1].type, 'timer.finished');
  f.subs[0].callback({value: 42});
  f.subs[1].callback({data: {entity_id: 'timer.x'}});
  assert.equal(peek(f.hass, m), 42);
  assert.deepEqual(peek(f.hass, e), {entity_id: 'timer.x'});
});

test('a spec with a fallback serves it before the first payload', () => {
  const f = fake();
  const spec = messageSpec('x', {type: 'x'}, {fallback: () => 'from-state'});
  assert.equal(peek(f.hass, spec), 'from-state');
  assert.equal(peek(undefined, spec), 'from-state');
  assert.equal(peek(undefined, messageSpec('y', {type: 'y'})), null);
});

test('subscriptions never poll: no interval is created', async () => {
  const real = globalThis.setInterval;
  const before = openCount(); // earlier tests may have left subscriptions open
  let created = 0;
  globalThis.setInterval = (...args) => {
    // the test runner has intervals of its own: only count the ones created from src/core
    if (new Error().stack.includes('/src/core/')) created++;
    return real(...args);
  };
  try {
    const f = fake();
    const spec = forecastSpec('weather.home', 'daily');
    const lease = acquire(f.hass, spec);
    await settle();
    f.subs[0].callback({forecast: []});
    lease.release();
    f.fire();
  } finally {
    globalThis.setInterval = real;
  }
  assert.equal(created, 0);
  assert.equal(openCount(), before);
});
