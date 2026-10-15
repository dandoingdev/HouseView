// Event-activated overviews (`activation: 'event'`) in the screensaver mixin: shown by their own autoShow instead of
// by idle time, through the same layer. Fake clock (Node mock timers), the real shared ticker and idle manager, and a
// fake shell: see screensaver-env.mjs. The real browser behaviour is covered by the overview suite.
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {PREVIEW_RESHOW_SECONDS, SWALLOW_MS} from '../../src/controller/screensaver.js';
import {defineOverview} from '../../src/core/define-overview.js';
import {registerOverview} from '../../src/core/overview-registry.js';
import {demo} from './_demo-overview.mjs';
import {fire, setup, states} from './screensaver-env.mjs';

const strings = (type) => ({
  en: {[`${type}_overview.label`]: `${type} label`, [`${type}_overview.description`]: type}
});
const scene = (ctx) => `<div class="ov-scene">${ctx.rawName}|${ctx.state?.state}</div>`;

// A bell: shows while the binary sensor is on, gives way when it is not.
const calls = {ding: 0};
const ding = defineOverview({
  type: 'ding',
  label: 'Ding overview',
  order: 981,
  domains: ['binary_sensor'],
  strings: strings('ding'),
  activation: 'event',
  render: scene,
  autoShow: (ctx) => {
    calls.ding++;
    return ctx.state?.state === 'on';
  },
  autoWake: (ctx) => ctx.state?.state !== 'on'
});
// A second one, to put two event overviews against each other.
const dong = defineOverview({
  type: 'dong',
  label: 'Dong overview',
  order: 982,
  domains: ['binary_sensor'],
  strings: strings('dong'),
  activation: 'event',
  render: scene,
  autoShow: (ctx) => ctx.state?.state === 'on',
  autoWake: (ctx) => ctx.state?.state !== 'on'
});
// Its predicate does not read hass at all: only the shared tick can notice it.
const flag = {on: false};
const clocked = defineOverview({
  type: 'clocked',
  label: 'Clocked overview',
  order: 983,
  domains: ['sensor'],
  strings: strings('clocked'),
  activation: 'event',
  render: scene,
  autoShow: () => flag.on,
  autoWake: () => !flag.on
});
const exploding = defineOverview({
  type: 'exploding_event',
  label: 'Exploding event',
  order: 984,
  domains: ['sensor'],
  strings: strings('exploding_event'),
  activation: 'event',
  render: scene,
  autoShow: () => {
    throw new Error('autoShow exploded');
  }
});
// No autoWake: it stays up until the user dismisses it.
const sticky = defineOverview({
  type: 'sticky',
  label: 'Sticky overview',
  order: 985,
  domains: ['binary_sensor'],
  strings: strings('sticky'),
  activation: 'event',
  render: scene,
  autoShow: (ctx) => ctx.state?.state === 'on'
});
// autoWake always asks to go while autoShow is still true: a badly written pair must not flap.
const flap = defineOverview({
  type: 'flap',
  label: 'Flap overview',
  order: 986,
  domains: ['binary_sensor'],
  strings: strings('flap'),
  activation: 'event',
  render: scene,
  autoShow: (ctx) => ctx.state?.state === 'on',
  autoWake: () => true
});
for (const overview of [demo, ding, dong, clocked, exploding, sticky, flap])
  registerOverview(overview);

const bell = (patch = {}) => ({type: 'ding', entity: 'binary_sensor.bell', ...patch});
const idle = (patch = {}) => ({type: 'demo', entity: 'sensor.a', idle_timeout: 10, ...patch});

const withStates = (extra) => ({states: {...states(), ...extra}});
const on = (id = 'binary_sensor.bell', name = 'Bell') => ({
  [id]: {state: 'on', attributes: {friendly_name: name}}
});
const off = (id = 'binary_sensor.bell', name = 'Bell') => ({
  [id]: {state: 'off', attributes: {friendly_name: name}}
});

/** Hand a new hass to the card the way the controller's setter does. */
function update(env, extra) {
  env.host._hass = withStates(extra);
  env.host._screensaverHass();
}
const sceneOf = (env) => env.layer?.ov.innerHTML.replace(/<[^>]*>/g, '') ?? null;
const inEdit = {localName: 'hui-card-options', parentElement: null};
const hassOff = () => withStates(off());

test('edge triggered: it shows when autoShow turns true, not before', (t) => {
  const env = setup(t, {screensaver: bell(), hass: hassOff()});
  env.second(3);
  assert.equal(env.layer, null, 'the predicate is false');
  update(env, on());
  assert.equal(env.state, 'on');
  assert.equal(sceneOf(env), 'Bell|on');
  assert.equal(env.layer.html.includes('data-screensaver="ding"'), true);
  assert.equal(env.shell.children.length, 1);
});

test('it shows at connect when the predicate is already true (a page reload during a timer)', (t) => {
  const env = setup(t, {screensaver: bell(), hass: withStates(on())});
  assert.equal(env.state, 'on');
});

test('it never starts by idle time: an all-event config does not activate, whatever idle_timeout says', (t) => {
  const env = setup(t, {
    screensaver: [bell({idle_timeout: 5}), bell({type: 'dong', idle_timeout: 5})],
    hass: hassOff()
  });
  env.second(120);
  assert.equal(env.layer, null);
  assert.equal(env.host._screensaver.idle.active, false);
  assert.equal(env.host._screensaverTimeout(undefined), 0);
});

test('disconnect releases the tick subscription and the listeners of an event config', (t) => {
  const env = setup(t, {screensaver: bell(), hass: hassOff()});
  assert.ok(env.host._screensaver.idle);
  env.host._screensaverDisconnect();
  assert.equal(env.host._screensaver.idle, null);
  assert.equal(env.shadowRoot.listeners.length, 0);
});

test('a predicate that only the tick can see is evaluated on the tick', (t) => {
  flag.on = false;
  const env = setup(t, {screensaver: {type: 'clocked', entity: 'sensor.a'}});
  env.second(3);
  assert.equal(env.layer, null);
  flag.on = true;
  env.second(1);
  assert.equal(env.state, 'on');
  flag.on = false;
  env.second(1); // the tick runs autoWake too
  assert.equal(env.state, 'leaving');
});

test('a hass update that changes nothing the overview reads does not re-evaluate it; the tick does', (t) => {
  const env = setup(t, {screensaver: bell(), hass: hassOff()});
  const before = calls.ding;
  env.host._hass = {
    states: {...env.host._hass.states, 'light.other': {state: 'on', attributes: {}}}
  };
  env.host._screensaverHass();
  assert.equal(calls.ding, before, 'a state it does not watch changed');
  update(env, off());
  assert.equal(calls.ding, before, 'the same state as before');
  env.second(1);
  assert.equal(calls.ding, before + 1, 'the tick always evaluates');
  update(env, on());
  assert.equal(calls.ding, before + 2);
});

test('blocked: nothing shows while the gallery or the alarm is up, and it shows when they clear', (t) => {
  const env = setup(t, {screensaver: bell(), hass: hassOff()});
  env.host._galleryOpen = true;
  update(env, on());
  env.second(5);
  assert.equal(env.layer, null);
  env.host._galleryOpen = false;
  env.host._alarm = {};
  env.second(2);
  assert.equal(env.layer, null, 'the alarm blocks too');
  env.host._alarm = null;
  env.second(1);
  assert.equal(env.state, 'on', 'the edge was remembered');
});

test('blocked by edit mode, unless start_in_edit_mode', (t) => {
  const env = setup(t, {screensaver: bell(), hass: hassOff()});
  env.host.parentElement = inEdit;
  update(env, on());
  env.second(3);
  assert.equal(env.layer, null);
  env.host._screensaver.entries[0].startInEditMode = true;
  env.second(1);
  assert.equal(env.state, 'on');
});

test('a pending service call does NOT block an event entry (a timer started from a tile), but still blocks idle ones', (t) => {
  const env = setup(t, {screensaver: [idle(), bell()], hass: hassOff()});
  env.host._pending.add('timer.start');
  update(env, on());
  assert.equal(env.state, 'on');
  assert.equal(sceneOf(env), 'Bell|on');
  env.second(2);
  assert.equal(env.state, 'on', 'the pending call does not wake the event layer either');
  fire(env.layer, 'pointerup');
  env.wait(400);
  env.second(60);
  assert.equal(env.layer, null, 'idle entries still wait for the call');
  env.host._pending.clear();
  env.second(10);
  assert.equal(env.state, 'on');
  assert.equal(sceneOf(env), 'A|screensaver');
});

test('a blocker that starts while the layer is up wakes it, and it comes back when the blocker clears', (t) => {
  const env = setup(t, {screensaver: bell(), hass: withStates(on())});
  assert.equal(env.state, 'on');
  env.host._galleryOpen = true;
  env.second(1);
  assert.equal(env.state, 'leaving');
  assert.equal(env.host._suppressClickUntil, undefined, 'a blocker wake swallows nothing');
  env.wait(400);
  assert.equal(env.layer, null);
  env.second(3);
  assert.equal(env.layer, null);
  env.host._galleryOpen = false;
  env.second(1);
  assert.equal(env.state, 'on');
});

test('a hidden page removes the layer; nothing shows while hidden; it returns when visible', (t) => {
  const env = setup(t, {screensaver: bell(), hass: withStates(on())});
  assert.equal(env.state, 'on');
  const visibility = env.documentListeners[0].fn;
  env.document.hidden = true;
  visibility();
  assert.equal(env.layer, null);
  update(env, on());
  env.second(3);
  assert.equal(env.layer, null);
  env.document.hidden = false;
  visibility();
  env.second(1);
  assert.equal(env.state, 'on');
});

test('dismissal sticks until the predicate has gone false and true again', (t) => {
  const env = setup(t, {screensaver: bell(), hass: hassOff()});
  update(env, on());
  assert.equal(env.state, 'on');
  fire(env.layer, 'pointerup'); // the user taps it away
  assert.equal(env.state, 'leaving');
  env.wait(400);
  assert.equal(env.layer, null);
  update(env, on()); // new state objects, still on
  env.second(30);
  assert.equal(env.layer, null, 'stays dismissed while the predicate stays true');
  update(env, off());
  env.second(2);
  update(env, on());
  assert.equal(env.state, 'on', 'false -> true shows it again');
});

for (const key of ['Escape', 'Enter', ' ']) {
  test(`dismissal by the ${JSON.stringify(key)} key sticks too`, (t) => {
    const env = setup(t, {screensaver: bell(), hass: withStates(on())});
    assert.equal(env.state, 'on');
    fire(env.layer, 'keydown', {key});
    env.wait(400);
    env.second(5);
    assert.equal(env.layer, null);
  });
}

test('the first tap only wakes: the click is swallowed, as for any screensaver', (t) => {
  const env = setup(t, {screensaver: bell(), hass: withStates(on())});
  const down = fire(env.layer, 'pointerdown');
  assert.equal(down.stopped, true, 'the swipe tracker never starts');
  const up = fire(env.layer, 'pointerup');
  assert.equal(up.stopped, true);
  assert.equal(env.state, 'leaving');
  assert.ok(env.host._suppressClickUntil >= Date.now() + SWALLOW_MS - 1);
  const click = fire(env.layer, 'click');
  assert.equal(click.prevented, true);
  assert.equal(env.state, 'leaving', 'the layer still catches the trailing click');
});

test('autoWake dismisses it by itself, with no tap swallow, and the entry shows again on the next false -> true', (t) => {
  const env = setup(t, {screensaver: bell(), hass: withStates(on())});
  assert.equal(env.state, 'on');
  update(env, off());
  assert.equal(env.state, 'leaving');
  assert.equal(env.host._suppressClickUntil, undefined);
  env.wait(400);
  assert.equal(env.layer, null);
  update(env, on());
  assert.equal(env.state, 'on');
});

test('an autoWake that fires while autoShow is still true does not flap', (t) => {
  const env = setup(t, {screensaver: bell({type: 'flap'}), hass: hassOff()});
  update(env, on());
  assert.equal(env.state, 'on');
  update(env, on('binary_sensor.bell', 'Bell2'));
  assert.equal(env.state, 'leaving');
  env.wait(400);
  env.second(10);
  update(env, on('binary_sensor.bell', 'Bell3'));
  assert.equal(env.layer, null, 'the edge was used up');
});

test('an event entry without autoWake stays up until it is dismissed', (t) => {
  const env = setup(t, {screensaver: bell({type: 'sticky'}), hass: hassOff()});
  update(env, on());
  assert.equal(env.state, 'on');
  update(env, off());
  env.second(5);
  assert.equal(env.state, 'on');
});

test('an event layer replaces an idle screensaver that is on screen', (t) => {
  const env = setup(t, {screensaver: [idle(), bell()], hass: hassOff()});
  env.second(10);
  assert.equal(sceneOf(env), 'A|screensaver');
  const old = env.layer;
  update(env, on());
  assert.equal(env.shell.children.length, 1, 'one layer');
  assert.notEqual(env.layer, old);
  assert.equal(old.parentNode, null, 'the idle layer is gone at once');
  assert.equal(sceneOf(env), 'Bell|on');
  assert.equal(env.state, 'on');
  assert.equal(env.host._screensaver.idle.active, true);
});

test('replacing an idle layer that already covers the card uncovers it without a catch-up, then covers again', (t) => {
  const env = setup(t, {screensaver: [idle(), bell()], hass: hassOff()});
  let resumed = 0;
  env.host._resumeAfterCover = () => resumed++;
  env.second(10);
  env.wait(600);
  env.second(1);
  assert.equal(env.host._screensaverCovered(), true);
  update(env, on());
  assert.equal(env.host._screensaverCovered(), false);
  assert.equal(resumed, 0, 'another layer takes over at once: nothing to catch up');
  env.second(2);
  assert.equal(env.host._screensaverCovered(), true, 'the event layer covers the card too');
  fire(env.layer, 'keydown', {key: 'Escape'});
  assert.equal(resumed, 1);
});

test('the event layer behaves like any layer: focus, cover and uncover', (t) => {
  const env = setup(t, {screensaver: bell(), hass: hassOff()});
  const focused = {isConnected: true, focus() {}};
  env.shadowRoot.activeElement = focused;
  update(env, on());
  assert.equal(
    env.shadowRoot.activeElement,
    env.layer.button,
    'the card had focus: it moves to the layer'
  );
  assert.equal(env.host._screensaverCovered(), false, 'still fading in');
  env.second(1);
  assert.equal(env.host._screensaverCovered(), true);
  assert.ok('covered' in env.shell.dataset);
  fire(env.layer, 'keydown', {key: 'Escape'});
  assert.equal('covered' in env.shell.dataset, false);
});

test('the round robin of idle entries skips event entries and is not moved by them', (t) => {
  const env = setup(t, {
    screensaver: [idle({entity: 'sensor.a'}), bell(), idle({entity: 'sensor.b'})],
    hass: hassOff()
  });
  const seen = [];
  const showIdle = () => {
    env.second(10);
    seen.push(sceneOf(env));
    fire(env.layer, 'keydown', {key: 'Escape'});
    env.wait(400);
  };
  showIdle(); // A
  update(env, on()); // an event in between: must not consume a turn
  seen.push(sceneOf(env));
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
  update(env, off());
  showIdle(); // B
  showIdle(); // A again
  showIdle(); // B again
  assert.deepEqual(seen, [
    'A|screensaver',
    'Bell|on',
    'B|screensaver',
    'A|screensaver',
    'B|screensaver'
  ]);
});

test('the idle timer restarts from the dismissal of an event layer, with the next idle entry timeout', (t) => {
  const env = setup(t, {screensaver: [idle({idle_timeout: 20}), bell()], hass: hassOff()});
  update(env, on());
  env.second(3);
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
  env.second(19);
  assert.equal(env.layer, null);
  env.second(1);
  assert.equal(sceneOf(env), 'A|screensaver');
});

const twoEvents = () => [bell(), {type: 'dong', entity: 'binary_sensor.gong'}];

test('two event entries firing together: the first wins and the loser does not pop up afterwards', (t) => {
  const env = setup(t, {screensaver: twoEvents(), hass: hassOff()});
  update(env, {...on(), ...on('binary_sensor.gong', 'Gong')});
  assert.equal(sceneOf(env), 'Bell|on');
  assert.equal(env.shell.children.length, 1);
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
  env.second(5);
  assert.equal(env.layer, null);
});

test('two event entries: a later edge replaces the event layer that is on screen', (t) => {
  const env = setup(t, {screensaver: twoEvents(), hass: hassOff()});
  update(env, on());
  assert.equal(sceneOf(env), 'Bell|on');
  update(env, {...on(), ...on('binary_sensor.gong', 'Gong')});
  assert.equal(sceneOf(env), 'Gong|on');
  assert.equal(env.shell.children.length, 1);
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
  env.second(5);
  assert.equal(env.layer, null, 'the replaced entry does not come back by itself');
});

test('manual open still works next to an event config, and does not disturb it', (t) => {
  const env = setup(t, {screensaver: bell(), hass: hassOff()});
  env.host._config.widgets = [{type: 'demo_overview', entity: 'sensor.a'}];
  env.host._screensaverOpen('sensor.a');
  assert.equal(env.state, 'on');
  assert.equal(sceneOf(env), 'A|screensaver');
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
  assert.equal(env.host._screensaver.entries.length, 1, 'the manual entry is dropped again');
  env.second(120);
  assert.equal(env.layer, null, 'nothing starts by itself afterwards');
  update(env, on());
  assert.equal(sceneOf(env), 'Bell|on', 'the event entry still works');
});

test('manual open with no screensaver configured is unchanged', (t) => {
  const env = setup(t, {});
  env.host._config.widgets = [{type: 'demo_overview', entity: 'sensor.a'}];
  env.host._screensaverOpen('sensor.a');
  assert.equal(env.state, 'on');
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
  env.wait(1000);
  assert.equal(env.host._screensaver, null);
});

test('manual open of an event overview is shown (it goes through the cursor, not through autoShow)', (t) => {
  const env = setup(t, {});
  env.host._config.widgets = [{type: 'sticky_overview', entity: 'binary_sensor.bell'}];
  env.host._hass = hassOff();
  env.host._screensaverOpen('binary_sensor.bell');
  assert.equal(env.state, 'on');
  assert.equal(sceneOf(env), 'Bell|off');
});

test('preview shows an event entry whatever the predicate says, ignores autoWake, and returns after a dismissal', (t) => {
  const env = setup(t, {screensaver: bell({preview: true}), hass: hassOff()});
  assert.equal(env.state, 'on');
  update(env, off());
  env.second(3);
  assert.equal(env.state, 'on', 'autoWake does not take a preview away');
  fire(env.layer, 'pointerup');
  env.wait(400);
  assert.equal(env.layer, null);
  env.second(PREVIEW_RESHOW_SECONDS - 1);
  assert.equal(env.layer, null);
  env.second(1);
  assert.equal(env.state, 'on');
});

test('a preview is not held back by edit mode', (t) => {
  const env = setup(t, {screensaver: bell({preview: true}), hass: hassOff(), connect: false});
  env.host.parentElement = inEdit;
  env.connect();
  assert.equal(env.state, 'on');
});

test('it waits for the first shell, then _screensaverSync shows it', (t) => {
  const env = setup(t, {screensaver: bell(), hass: withStates(on()), connect: false});
  env.shell.attached = false;
  env.connect();
  env.second(2);
  assert.equal(env.layer, null);
  env.shell.attached = true;
  env.host._screensaverSync();
  assert.equal(env.state, 'on');
});

test('it waits for the first hass', (t) => {
  const env = setup(t, {screensaver: bell(), hass: null});
  env.second(3);
  assert.equal(env.layer, null);
  update(env, on());
  assert.equal(env.state, 'on');
});

test('a broken autoShow never breaks the card', (t) => {
  const errors = [];
  const errorSpy = mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  const env = setup(t, {screensaver: {type: 'exploding_event', entity: 'sensor.a'}});
  env.host._screensaverHass();
  env.second(3);
  assert.equal(env.layer, null);
  assert.ok(errors.some((e) => /autoShow failed/.test(e)));
  errorSpy.mock.restore();
});

test('a disabled event entry is not evaluated at all', (t) => {
  const before = calls.ding;
  const env = setup(t, {screensaver: [bell({enabled: false}), idle()], hass: withStates(on())});
  env.second(3);
  assert.equal(calls.ding, before);
  assert.equal(env.host._screensaver.events.size, 0);
});

test('without event entries nothing is evaluated: no extra state, hass updates cost nothing', (t) => {
  const env = setup(t, {screensaver: idle()});
  assert.equal(env.host._screensaver.events.size, 0);
  const spy = mock.method(env.host, '_screensaverContext');
  env.host._screensaverHass();
  env.second(3);
  assert.equal(spy.mock.callCount(), 0);
});

test('setConfig with the same config keeps the dismissal: the running event does not pop up again', (t) => {
  const env = setup(t, {screensaver: bell(), hass: withStates(on())});
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
  env.second(5);
  assert.equal(env.layer, null);
  env.configure();
  env.second(3);
  assert.equal(env.layer, null, 'same type and entity: the dismissal is remembered');
  update(env, off());
  env.second(1);
  update(env, on());
  assert.equal(env.state, 'on', 'false then true again shows it');
});

test('setConfig with the same config keeps a layer that was up and never dismissed', (t) => {
  const env = setup(t, {screensaver: bell(), hass: withStates(on())});
  assert.equal(env.state, 'on');
  env.configure();
  env.second(2);
  assert.equal(env.state, 'on');
  assert.equal(env.shell.children.length, 1);
});

test('setConfig with another entity starts that entry fresh: a running event shows', (t) => {
  const env = setup(t, {
    screensaver: bell(),
    hass: withStates({...on(), ...on('binary_sensor.gong', 'Gong')})
  });
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
  env.host._config = {...env.host._config, screensaver: bell({entity: 'binary_sensor.gong'})};
  env.configure();
  assert.equal(sceneOf(env), 'Gong|on');
});

test('a view switch (disconnect, connect) brings back a layer that was up and never dismissed', (t) => {
  const env = setup(t, {screensaver: bell(), hass: withStates(on())});
  assert.equal(env.state, 'on');
  env.host._screensaverDisconnect();
  assert.equal(env.layer, null);
  env.connect();
  env.second(2);
  assert.equal(env.state, 'on');
});

test('a view switch does not bring back a layer that was dismissed', (t) => {
  const env = setup(t, {screensaver: bell(), hass: withStates(on())});
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
  env.host._screensaverDisconnect();
  env.connect();
  env.second(5);
  assert.equal(env.layer, null);
});

test('a replaced event entry is parked, not lost: it returns when the replacing layer goes by itself', (t) => {
  const env = setup(t, {screensaver: twoEvents(), hass: hassOff()});
  update(env, on());
  update(env, {...on(), ...on('binary_sensor.gong', 'Gong')});
  assert.equal(sceneOf(env), 'Gong|on');
  update(env, on()); // the gong is cancelled: autoWake; the bell is still wanted
  env.wait(400);
  env.second(1);
  assert.equal(sceneOf(env), 'Bell|on');
  assert.equal(env.shell.children.length, 1);
  env.second(5);
  assert.equal(sceneOf(env), 'Bell|on', 'and it stays');
});

test('an entry that lost the same pass comes back after the winner goes by itself', (t) => {
  const env = setup(t, {screensaver: twoEvents(), hass: hassOff()});
  update(env, {...on(), ...on('binary_sensor.gong', 'Gong')});
  assert.equal(sceneOf(env), 'Bell|on');
  update(env, on('binary_sensor.gong', 'Gong'));
  env.wait(400);
  env.second(1);
  assert.equal(sceneOf(env), 'Gong|on');
});

test('a parked entry whose predicate went false meanwhile does not come back', (t) => {
  const env = setup(t, {screensaver: twoEvents(), hass: hassOff()});
  update(env, on());
  update(env, {...on(), ...on('binary_sensor.gong', 'Gong')});
  update(env, {...off(), ...on('binary_sensor.gong', 'Gong')}); // the bell is over while parked
  update(env, off('binary_sensor.gong', 'Gong'));
  env.wait(400);
  env.second(5);
  assert.equal(env.layer, null);
});

test('a parked entry is never armed while another event layer is up (no flip-flop)', (t) => {
  const env = setup(t, {screensaver: twoEvents(), hass: hassOff()});
  update(env, on());
  update(env, {...on(), ...on('binary_sensor.gong', 'Gong')});
  for (let i = 0; i < 5; i++) {
    env.second(1);
    assert.equal(sceneOf(env), 'Gong|on');
    assert.equal(env.shell.children.length, 1);
  }
});

test('removing the card while an event layer is up leaves nothing behind', (t) => {
  const env = setup(t, {screensaver: bell(), hass: withStates(on())});
  assert.equal(env.state, 'on');
  env.host._screensaverDisconnect();
  assert.equal(env.layer, null);
  env.second(5);
  assert.equal(env.layer, null);
  assert.equal(env.documentListeners.length, 0);
});
