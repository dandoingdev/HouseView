import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  clockPalette,
  handAngles,
  clockDate,
  isClockColour,
  digitalTime
} from '../../src/overviews/clock/model.js';
import {createOverviewContext} from '../../src/core/overview-context.js';
import {checkOptions, resolveOptions} from '../../src/core/define-overview.js';
import clock from '../../src/overviews/clock/index.js';

test('clock hands include minute and second fractions without a wrap animation', () => {
  assert.deepEqual(handAngles({hour: 10, minute: 9}, 30), {hour: 304.75, minute: 57, second: 180});
  assert.deepEqual(handAngles({hour: 0, minute: 0}, 0), {hour: 0, minute: 0, second: 0});
  assert.deepEqual(handAngles({hour: 23, minute: 59}, 59), {
    hour: 359.9916666666667,
    minute: 359.9,
    second: 354
  });
});
test('clock colours accept hex and native RGB and adapt contrast', () => {
  assert.equal(clockPalette('#fff').background, '#ffffff');
  assert.equal(clockPalette([59, 146, 95]).background, '#3b925f');
  for (const invalid of [
    [0, 0],
    [0, 0, 256],
    [0, -1, 0],
    [1.5, 0, 0],
    ['1', 0, 0]
  ])
    assert.equal(isClockColour(invalid), false);
  assert.equal(clockPalette('#3B925F').ink, '#050706');
  assert.equal(clockPalette('#000').ink, '#f7faf8');
  for (const c of [
    'red',
    'transparent',
    '#00000000',
    'url(https://example.com)',
    '";background:red',
    'var(--secret)'
  ]) {
    assert.equal(isClockColour(c), false);
    assert.throws(
      () => checkOptions(clock, resolveOptions(clock, {background_color: c})),
      /hex colour/
    );
    assert.throws(
      () => checkOptions(clock, resolveOptions(clock, {second_color: c})),
      /hex colour/
    );
  }
});
test('clock uses HA display time zone and local day across midnight and DST', () => {
  const context = (zone) =>
    createOverviewContext({
      hass: {locale: {language: 'en-GB', time_zone: 'server'}, config: {time_zone: zone}},
      options: {},
      mode: 'screensaver',
      overview: clock
    });
  const tokyo = context('Asia/Tokyo');
  const p = tokyo.localParts(Date.parse('2026-10-16T16:00:00Z'));
  assert.equal(p.day, 17);
  assert.equal(p.hour, 1);
  assert.equal(clockDate(tokyo, p), 'SAT 17');
  const london = context('Europe/London');
  assert.equal(london.localParts(Date.parse('2026-10-25T00:30:00Z')).hour, 1);
  assert.equal(london.localParts(Date.parse('2026-10-25T01:30:00Z')).hour, 1);
});

test('digital time follows HA 12/24-hour preferences, midnight and local digits', () => {
  const context = (language, time_format, zone, show_seconds = true) =>
    createOverviewContext({
      hass: {locale: {language, time_format, time_zone: 'server'}, config: {time_zone: zone}},
      options: {show_seconds},
      mode: 'screensaver',
      overview: clock
    });
  const stamp = Date.parse('2026-10-16T23:05:09Z');
  assert.deepEqual(digitalTime(context('en-US', '12', 'UTC'), stamp), {
    hour: '11',
    minute: '05',
    second: '09',
    period: 'PM',
    text: '11:05:09 PM'
  });
  assert.equal(digitalTime(context('en-US', '24', 'UTC', false), stamp).text, '23:05');
  const midnight = Date.parse('2026-10-17T00:00:01Z');
  assert.equal(digitalTime(context('en-US', '12', 'UTC'), midnight).text, '12:00:01 AM');
  assert.equal(digitalTime(context('en-GB', '24', 'UTC'), midnight).text, '00:00:01');
  assert.equal(digitalTime(context('en-GB', '24', 'Asia/Kathmandu'), stamp).text, '04:50:09');
  const arabic = digitalTime(context('ar-EG', '24', 'UTC'), stamp);
  assert.equal(arabic.hour, new Intl.NumberFormat('ar-EG', {minimumIntegerDigits: 2}).format(23));
});
test('both digital faces resolve through the same screensaver/editor option schema as analogue faces', () => {
  for (const face of ['bold', 'sculpted', 'digital', 'digital_stacked']) {
    const options = resolveOptions(clock, {face});
    assert.doesNotThrow(() => checkOptions(clock, options));
    assert.equal(options.face, face);
    assert.equal(options.show_seconds, true);
    assert.equal(options.background_color, undefined);
  }
  assert.throws(() => checkOptions(clock, resolveOptions(clock, {face: 'unknown'})), /face/i);
});
