import test from 'node:test';
import assert from 'node:assert/strict';
import {createOverviewSession} from '../../src/core/overview-session.js';
import {configure, openCount} from '../../src/core/subscriptions.js';
import {demo} from './_demo-overview.mjs';

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('leases follow entity changes, supported features and dispose', async () => {
  const timers = [];
  configure({graceMs: 1, setTimeout: (fn) => timers.push(fn), clearTimeout() {}});
  const subscribed = [];
  const unsubscribed = [];
  const connection = {
    subscribeMessage: (callback, message) => {
      subscribed.push(`${message.entity_id}|${message.forecast_type}`);
      return Promise.resolve(() =>
        unsubscribed.push(`${message.entity_id}|${message.forecast_type}`)
      );
    }
  };
  const states = {
    'weather.a': {state: 'sunny', attributes: {supported_features: 1}},
    'weather.b': {state: 'sunny', attributes: {supported_features: 2}} // no daily bit
  };
  const hass = {connection, states};
  const session = createOverviewSession({
    overview: demo,
    options: {entity: 'weather.a'},
    getHass: () => hass,
    onChange() {}
  });
  session.sync();
  session.sync(); // idempotent
  await settle();
  assert.deepEqual(subscribed, ['weather.a|daily']);

  session.setOptions({entity: 'weather.b'}); // entity change: the old lease goes, the new spec is unsupported
  timers.splice(0).forEach((fn) => fn());
  await settle();
  assert.deepEqual(unsubscribed, ['weather.a|daily']);
  assert.deepEqual(subscribed, ['weather.a|daily']);

  states['weather.b'].attributes.supported_features = 1; // the integration now supports daily: next sync picks it up
  session.sync();
  await settle();
  assert.deepEqual(subscribed, ['weather.a|daily', 'weather.b|daily']);

  session.dispose();
  assert.equal(session.size, 0);
  timers.splice(0).forEach((fn) => fn());
  assert.equal(openCount(), 0);
});

test('a new websocket connection starts clean', async () => {
  configure({graceMs: 1, setTimeout: (fn) => fn(), clearTimeout() {}});
  let opened = 0;
  const make = () => ({subscribeMessage: () => (opened++, Promise.resolve(() => {}))});
  const states = {'weather.a': {state: 'sunny', attributes: {}}};
  let hass = {connection: make(), states};
  const session = createOverviewSession({
    overview: demo,
    options: {entity: 'weather.a'},
    getHass: () => hass,
    onChange() {}
  });
  session.sync();
  hass = {connection: make(), states};
  session.sync();
  await settle();
  assert.equal(opened, 2);
  session.dispose();
});

test('without a hass, or without a connection, nothing is leased or thrown', () => {
  const current = {hass: undefined};
  const session = createOverviewSession({
    overview: demo,
    options: {entity: 'weather.a'},
    getHass: () => current.hass,
    onChange() {}
  });
  session.sync();
  assert.equal(session.size, 0);
  current.hass = {states: {'weather.a': {state: 'sunny', attributes: {}}}}; // mock hass: no connection
  session.sync();
  assert.equal(session.size, 1); // a no-op lease, retried on every sync
  session.dispose();
  assert.equal(session.size, 0);
});

test('an overview without data() leases nothing; onChange is the consumer callback', async () => {
  configure({graceMs: 1, setTimeout: (fn) => fn(), clearTimeout() {}});
  let callback;
  const hass = {
    connection: {
      subscribeMessage: (cb) => ((callback = cb), Promise.resolve(() => {}))
    },
    states: {'weather.a': {state: 'sunny', attributes: {supported_features: 3}}}
  };
  let changes = 0;
  const session = createOverviewSession({
    overview: demo,
    options: {entity: 'weather.a'},
    getHass: () => hass,
    onChange: () => changes++
  });
  session.sync();
  await settle();
  callback({forecast: [{temperature: 5}]});
  assert.equal(changes, 1);
  session.dispose();
  const bare = createOverviewSession({
    overview: {},
    options: {},
    getHass: () => hass,
    onChange() {}
  });
  bare.sync();
  assert.equal(bare.size, 0);
});

test('a sync with nothing new to look at does not rebuild the specs (hass arrives for every state in the house)', async () => {
  configure({graceMs: 1, setTimeout: (fn) => fn(), clearTimeout() {}});
  let built = 0;
  const overview = {
    ...demo,
    data: (args) => {
      built++;
      return demo.data(args);
    }
  };
  const connection = {subscribeMessage: () => Promise.resolve(() => {})};
  const weather = {state: 'sunny', attributes: {supported_features: 1}};
  let hass = {connection, states: {'weather.a': weather, 'sensor.other': {state: '1'}}};
  const session = createOverviewSession({
    overview,
    options: {entity: 'weather.a'},
    getHass: () => hass,
    onChange() {}
  });
  session.sync();
  await settle();
  const first = built;
  for (let i = 0; i < 50; i++) {
    hass = {connection, states: {...hass.states, 'sensor.other': {state: String(i)}}};
    session.sync();
  }
  assert.equal(built, first, 'fifty unrelated updates: the specs are not rebuilt');
  hass = {connection, states: {...hass.states, 'weather.a': {...weather}}}; // the entity itself was replaced
  session.sync();
  assert.equal(built, first + 1, 'a new state object for the entity is looked at again');
  session.setOptions({entity: 'weather.a', extra: 1});
  assert.equal(built, first + 2, 'new options are too');
  session.dispose();
});
