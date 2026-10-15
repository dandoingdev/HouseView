import test from 'node:test';
import assert from 'node:assert/strict';
import timer from '../../src/overviews/timer/index.js';
import {variants, NOW} from '../../src/overviews/timer/fixtures.js';
import {
  durationParts,
  formatClock,
  litTicks,
  parseDuration,
  timerModel
} from '../../src/overviews/timer/model.js';
import {contextFor} from '../../src/core/define-overview.js';
import {registerStrings} from '../../src/core/i18n.js';
import strings from '../../src/overviews/timer/strings.js';

registerStrings(strings);

const nowMs = Date.parse(NOW);
const ctxOf = (variant, mode = 'screensaver', config = variant.config) => {
  const hass = {states: structuredClone(variant.states), ...variant.hass};
  return contextFor(timer, {hass, config, raw: variant.options, mode});
};
const modelOf = (variant) => {
  const ctx = ctxOf(variant);
  return timerModel({state: ctx.state, attrs: ctx.attrs, now: ctx.now()});
};

test('parseDuration reads HA durations, minutes:seconds, bare numbers and rejects the rest', () => {
  assert.equal(parseDuration('0:15:00'), 900);
  assert.equal(parseDuration('1:30:00'), 5400);
  assert.equal(parseDuration('0:00:45'), 45);
  assert.equal(parseDuration('15:00'), 900);
  assert.equal(parseDuration('45'), 45);
  assert.equal(parseDuration(' 0:10:56 '), 656);
  assert.equal(parseDuration('0:00:10.5'), 10.5);
  assert.equal(parseDuration(900), 900);
  assert.equal(parseDuration(0), 0);
  for (const bad of [
    undefined,
    null,
    '',
    'abc',
    '1:2:3:4',
    '-5',
    '1:xx',
    NaN,
    -3,
    Infinity,
    {},
    []
  ]) {
    assert.equal(parseDuration(bad), null, `${String(bad)} is not a duration`);
  }
});

test('formatClock: m:ss, h:mm:ss from an hour, rounds up, never negative', () => {
  assert.equal(formatClock(656), '10:56');
  assert.equal(formatClock(900), '15:00');
  assert.equal(formatClock(59), '0:59');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(-5), '0:00');
  assert.equal(formatClock(10.2), '0:11');
  assert.equal(formatClock(3599), '59:59');
  assert.equal(formatClock(3600), '1:00:00');
  assert.equal(formatClock(4354), '1:12:34');
  assert.equal(formatClock(NaN), '0:00');
});

test('durationParts: minutes, seconds, hours, and nothing for zero', () => {
  assert.deepEqual(durationParts(900), [['min', 15]]);
  assert.deepEqual(durationParts(45), [['sec', 45]]);
  assert.deepEqual(durationParts(60), [['min', 1]]);
  assert.deepEqual(durationParts(90), [
    ['min', 1],
    ['sec', 30]
  ]);
  assert.deepEqual(durationParts(3600), [['h', 1]]);
  assert.deepEqual(durationParts(5400), [
    ['h', 1],
    ['min', 30]
  ]);
  assert.deepEqual(durationParts(7200 + 20), [['h', 2]]); // seconds are rounded away from an hour up
  assert.deepEqual(durationParts(0), []);
});

test('litTicks = ceil(60 * remaining / total), clamped', () => {
  assert.equal(litTicks(900, 900), 60);
  assert.equal(litTicks(656, 900), 44);
  assert.equal(litTicks(450, 900), 30);
  assert.equal(litTicks(7, 900), 1);
  assert.equal(litTicks(1, 3600), 1);
  assert.equal(litTicks(0, 900), 0);
  assert.equal(litTicks(-3, 900), 0);
  assert.equal(litTicks(900, 600), 60, 'more time than the duration clamps to a full ring');
  assert.equal(litTicks(5, 0), 0, 'no total: nothing lit');
  // the step falls exactly on tick boundaries, with no floating point surprise
  for (let k = 1; k <= 60; k++) assert.equal(litTicks(k * 15, 900), k);
});

test('the reference: 15 minutes, 10:56 left, 44 ticks lit', () => {
  const model = modelOf(variants.ok);
  assert.deepEqual(model, {
    status: 'running',
    remaining: 656,
    total: 900,
    lit: 44,
    hasDuration: true
  });
});

test('running: counts down to finishes_at with the clock, never below zero', () => {
  const ctx = ctxOf(variants.ok);
  const state = ctx.state;
  const at = (offset) => timerModel({state, attrs: ctx.attrs, now: nowMs + offset * 1000});
  assert.equal(at(0).remaining, 656);
  assert.equal(at(1).remaining, 655);
  assert.equal(at(1).lit, 44); // ceil(60 * 655 / 900) = 44
  assert.equal(at(11).lit, 43); // 645 / 15 = 43 exactly
  assert.equal(at(656).remaining, 0);
  assert.equal(at(700).remaining, 0);
  assert.equal(at(700).lit, 0);
});

test('running with finishes_at in the past: 0:00, nothing lit, no negative', () => {
  const model = modelOf(variants.pastFinish);
  assert.equal(model.remaining, 0);
  assert.equal(model.lit, 0);
  assert.equal(model.status, 'running');
});

test('paused: remaining comes from attributes.remaining and still lights ticks', () => {
  const model = modelOf(variants.paused);
  assert.deepEqual(
    [model.status, model.remaining, model.total, model.lit],
    ['paused', 450, 900, 30]
  );
});

test('idle: the duration, nothing lit', () => {
  const model = modelOf(variants.idle);
  assert.deepEqual([model.status, model.remaining, model.total, model.lit], ['idle', 900, 900, 0]);
});

test('unavailable, unknown and missing entities are unavailable', () => {
  for (const name of ['unavailable', 'unknown', 'missing']) {
    const model = modelOf(variants[name]);
    assert.equal(model.status, 'unavailable', name);
    assert.equal(model.lit, 0, name);
  }
});

test('a missing duration falls back to the longest length the data proves', () => {
  const model = modelOf(variants.noDuration);
  assert.equal(model.hasDuration, false);
  assert.equal(model.remaining, 656);
  assert.equal(model.total, 900, '656 left + 244 s since the last change');
  assert.equal(model.lit, 44);
});

test('a running timer without finishes_at uses attributes.remaining', () => {
  const model = modelOf(variants.noFinish);
  assert.equal(model.remaining, 900);
  assert.equal(model.lit, 60);
});

test('more time than the duration (timer.change) keeps a full ring', () => {
  const model = modelOf(variants.extended);
  assert.deepEqual([model.remaining, model.total, model.lit], [900, 600, 60]);
});

// ---- the words and the markup ----

const sceneOf = (name, mode = 'screensaver') => timer.render(ctxOf(variants[name], mode), mode);
const textOf = (html, role) => new RegExp(`data-ov="${role}">([^<]*)<`).exec(html)?.[1];
const litOf = (html) => (html.match(/ov-timer-tick on"/g) ?? []).length;

test('the reference face reads 10:56 and 15 MIN with 44 lit ticks of 60', () => {
  const html = sceneOf('ok');
  assert.equal(textOf(html, 'time'), '10:56');
  assert.equal(textOf(html, 'caption'), '15 MIN');
  assert.equal(litOf(html), 44);
  assert.equal((html.match(/class="ov-timer-tick/g) ?? []).length, 60);
  assert.match(html, /data-status="running" data-lit="44"/);
});

test('captions: minutes, seconds, hours', () => {
  assert.equal(textOf(sceneOf('shortTimer'), 'caption'), '45 SEC');
  assert.equal(textOf(sceneOf('oneHalf'), 'caption'), '1 H 30 MIN');
  assert.equal(textOf(sceneOf('hour'), 'caption'), '1 H');
  assert.equal(textOf(sceneOf('justStarted'), 'caption'), '15 MIN');
});

test('hours switch the time to h:mm:ss and the long class', () => {
  const html = sceneOf('oneHalf');
  assert.equal(textOf(html, 'time'), '1:12:34');
  assert.match(html, /class="ov-timer-time ov-timer-long"/);
  assert.doesNotMatch(sceneOf('ok'), /ov-timer-long/);
});

test('paused says PAUSED with the length, running states do not', () => {
  const html = sceneOf('paused');
  assert.equal(textOf(html, 'time'), '7:30');
  assert.equal(textOf(html, 'caption'), 'PAUSED · 15 MIN');
  assert.equal(litOf(html), 30);
});

test('idle card shows the length, READY and an unlit ring', () => {
  const html = sceneOf('idle', 'card');
  assert.equal(textOf(html, 'time'), '15:00');
  assert.equal(textOf(html, 'caption'), 'READY');
  assert.equal(litOf(html), 0);
});

test('unavailable shows a calm note and no caption', () => {
  for (const name of ['unavailable', 'unknown', 'missing']) {
    const html = sceneOf(name, 'card');
    assert.equal(textOf(html, 'time'), 'Timer unavailable', name);
    assert.equal(textOf(html, 'caption'), '', name);
    assert.equal(litOf(html), 0, name);
  }
});

test('a hostile friendly_name is escaped in the aria label', () => {
  const html = sceneOf('evilName');
  assert.ok(!html.includes('<img'), 'no element was created');
  assert.match(html, /aria-label="&lt;img src=x onerror=alert\(1\)&gt;, 10:56 remaining"/);
});

test('autoShow follows the active state (a finish time already past is over), autoWake everything except active and paused', () => {
  const show = (name) => timer.autoShow(ctxOf(variants[name]));
  const wake = (name) => timer.autoWake(ctxOf(variants[name]));
  assert.deepEqual(
    ['ok', 'paused', 'idle', 'unavailable', 'unknown', 'missing', 'pastFinish'].map(show),
    [true, false, false, false, false, false, false]
  );
  assert.deepEqual(['ok', 'paused', 'idle', 'unavailable', 'unknown', 'missing'].map(wake), [
    false,
    false,
    true,
    true,
    true,
    true
  ]);
});

test('it is an event overview: never started by idle time', () => {
  assert.equal(timer.activation, 'event');
  assert.equal(timer.type, 'timer');
  assert.deepEqual([...timer.domains], ['timer']);
  assert.equal(timer.entity, 'required');
});
