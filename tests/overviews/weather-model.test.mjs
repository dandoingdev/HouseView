import test from 'node:test';
import assert from 'node:assert/strict';
import weather from '../../src/overviews/weather/index.js';
import {
  variants,
  CONDITION_VARIANTS,
  NIGHT_VARIANTS
} from '../../src/overviews/weather/fixtures.js';
import {
  CONDITIONS,
  ICON_NAMES,
  nextRain,
  todayRange,
  viewOf
} from '../../src/overviews/weather/model.js';
import {skyFor, GROUP} from '../../src/overviews/weather/sky.js';
import {contextFor} from '../../src/core/define-overview.js';
import {registerStrings} from '../../src/core/i18n.js';
import strings from '../../src/overviews/weather/strings.js';

registerStrings(strings);

/** A context for a fixture. Forecasts are injected as `ctx.data`, exactly what a subscription would have delivered. */
function ctxOf(variant, mode = 'screensaver') {
  const hass = {states: structuredClone(variant.states), ...variant.hass};
  const ctx = contextFor(weather, {hass, config: variant.config, raw: variant.options, mode});
  ctx.data = {daily: variant.forecasts?.daily ?? null, hourly: variant.forecasts?.hourly ?? null};
  return ctx;
}

const html = (variant, mode = 'screensaver') => weather.render(ctxOf(variant, mode), mode);

test('the reference look: Partly Cloudy, H:14° L:9°, 12°, 10:09, four details', () => {
  const view = viewOf(ctxOf(variants.ok));
  assert.equal(view.label, 'Partly Cloudy');
  assert.equal(view.hl, 'H:14° L:9°');
  assert.equal(view.temperature, '12°');
  assert.equal(view.time.main, '10:09');
  assert.deepEqual(
    view.details.map((d) => [d.label, d.value]),
    [
      ['Sunset', '19:32'],
      ['Wind', '7 mph'],
      ['Humidity', '76%'],
      ['Rain', 'In 1d']
    ]
  );
});

test('all 15 HA conditions: icon, a sky group, a rendered scene', () => {
  assert.equal(CONDITIONS.length, 15);
  assert.deepEqual(Object.keys(CONDITION_VARIANTS).sort(), [...CONDITIONS].sort());
  assert.deepEqual(Object.keys(GROUP).sort(), [...CONDITIONS].sort());
  for (const condition of CONDITIONS) {
    const ctx = ctxOf(CONDITION_VARIANTS[condition]);
    const view = viewOf(ctx);
    assert.ok(view.known && view.icon, condition);
    assert.ok(view.label && view.label !== condition, `${condition} has a label`);
    assert.match(
      weather.render(ctx, 'screensaver'),
      new RegExp(`data-group="${GROUP[condition]}"`),
      condition
    );
  }
});

test('all 15 conditions after dark render the night artwork', () => {
  assert.equal(Object.keys(NIGHT_VARIANTS).length, 15);
  for (const [name, variant] of Object.entries(NIGHT_VARIANTS)) {
    const markup = html(variant);
    assert.match(markup, /data-tod="night"/, name);
    assert.match(markup, new RegExp(`data-group="${GROUP[name.split('@')[0]]}"`), name);
  }
});

test('every icon the scene uses is listed for the screenshot doubles', () => {
  for (const name of [...Object.keys(variants), ...Object.keys(NIGHT_VARIANTS)]) {
    const markup = html(variants[name] ?? NIGHT_VARIANTS[name]);
    for (const [, icon] of markup.matchAll(/icon="mdi:([a-z-]+)"/g)) {
      assert.ok(ICON_NAMES.includes(icon), `${name} uses ${icon}`);
    }
  }
});

test('day or night follows the daylight option, the sun entity, the condition, then the clock', () => {
  const tod = (v) => html(v).match(/data-tod="(\w+)"/)[1];
  assert.equal(tod(variants.ok), 'day');
  assert.equal(tod(variants.night), 'night');
  assert.equal(tod(variants['clear-night']), 'night');
  assert.equal(tod(variants.noSun), 'day'); // sunny, no sun entity
  assert.equal(
    tod({...variants.ok, options: {...variants.ok.options, daylight: 'night'}}),
    'night'
  );
  assert.equal(
    tod({...variants.night, options: {...variants.night.options, daylight: 'day'}}),
    'day'
  );
  // no sun entity and a cloudy state: the clock decides (10:09 in London is day)
  assert.equal(tod({...variants.noSun, states: {'weather.test': {state: 'cloudy'}}}), 'day');
});

test('rain wording', () => {
  const rain = (name) => nextRain(ctxOf(variants[name]));
  assert.deepEqual(rain('rainNow'), {kind: 'now', n: 0});
  assert.deepEqual(rain('rainSoon'), {kind: 'hours', n: 3});
  assert.deepEqual(rain('rainTomorrow'), {kind: 'days', n: 1});
  assert.deepEqual(rain('rainNever'), {kind: 'none', n: 0});
  assert.deepEqual(rain('dailyOnly'), {kind: 'days', n: 2});
  assert.deepEqual(rain('hourlyOnly'), {kind: 'none', n: 0});
  assert.deepEqual(rain('noForecast'), {kind: 'unknown', n: 0});
});

test('rain within the hour is counted in minutes', () => {
  const soon = {
    ...variants.rainSoon,
    forecasts: {
      daily: variants.rainSoon.forecasts.daily,
      hourly: [{datetime: '2026-10-15T10:40:00+01:00', precipitation: 0.6, temperature: 12}]
    }
  };
  assert.deepEqual(nextRain(ctxOf(soon)), {kind: 'minutes', n: 31});
  assert.equal(viewOf(ctxOf(soon)).details.find((d) => d.key === 'rain').value, 'In 31m');
});

test('rain detail is left out without forecast data and says None when nothing is wet', () => {
  const keys = (v) => viewOf(ctxOf(v)).details.map((d) => d.key);
  assert.ok(!keys(variants.noForecast).includes('rain'));
  assert.ok(keys(variants.rainNever).includes('rain'));
  const value = viewOf(ctxOf(variants.rainNever)).details.find((d) => d.key === 'rain').value;
  assert.equal(value, 'None');
});

test('today high/low: daily first, hourly extremes when the daily list lacks today', () => {
  assert.deepEqual(todayRange(ctxOf(variants.ok)), {high: 14, low: 9});
  const hourlyOnly = {
    ...variants.ok,
    forecasts: {daily: null, hourly: variants.ok.forecasts.hourly}
  };
  const {high, low} = todayRange(ctxOf(hourlyOnly));
  assert.ok(Number.isFinite(high) && Number.isFinite(low) && high >= low);
  assert.equal(viewOf(ctxOf(variants.noForecast)).hl, '');
});

test('a range with only one figure shows only that figure (never H:- L:-)', () => {
  assert.equal(viewOf(ctxOf(variants.highOnly)).hl, 'H:15°');
});

test('sunrise replaces sunset once the sun is down; 12 hour clock; units; negatives', () => {
  const night = viewOf(ctxOf(variants.night)).details[0];
  assert.deepEqual([night.label, night.value], ['Sunrise', '07:21']);
  const twelve = viewOf(ctxOf(variants.twelveHour)).time;
  assert.equal(twelve.main, '10:09');
  assert.equal(twelve.period.toLowerCase(), 'am');
  assert.equal(viewOf(ctxOf(variants.negative)).temperature.replace('−', '-'), '-3°');
  assert.equal(viewOf(ctxOf(variants.fahrenheit)).temperature, '54°F');
  assert.equal(viewOf(ctxOf(variants.celsiusUnit)).temperature, '12°C');
  assert.equal(viewOf(ctxOf(variants.hundreds)).temperature, '104°');
  assert.equal(
    viewOf(ctxOf(variants.noSun)).details.length,
    3,
    'a detail without data is left out'
  );
});

test('the 12 hour clock renders the period beside the time, 24 hour has none', () => {
  assert.match(
    html(variants.twelveHour),
    /<span class="ov-period" data-ov="time-period">(AM|am)<\/span>/
  );
  assert.ok(!/time-period/.test(html(variants.ok)));
});

test('options: show_time off removes the clock, frosted off gives solid numerals', () => {
  assert.ok(!/ov-time/.test(html(variants.noTime)));
  assert.match(html(variants.solid), /class="ov-temp ov-temp-solid"/);
  assert.match(html(variants.ok), /class="ov-temp"/);
});

test('custom details are shown in the configured order, three columns for five or six', () => {
  const labels = viewOf(ctxOf(variants.customDetails)).details.map((d) => d.label);
  assert.deepEqual(labels, [
    'Pressure',
    'Feels like',
    'Cloud cover',
    'UV index',
    'Visibility',
    'Dew point'
  ]);
  assert.match(html(variants.customDetails), /--ov-cols:3/);
  assert.match(html(variants.ok), /--ov-cols:4/);
});

test('a locale with long words: German text, 24 hour time, nothing hard-coded in English', () => {
  const view = viewOf(ctxOf(variants.longLocale));
  assert.equal(view.label, 'Gewitter mit Regen');
  assert.deepEqual(
    view.details.map((d) => [d.label, d.value]),
    [
      ['Sonnenuntergang', '19:32'],
      ['Wind', '23 Kilometer pro Stunde'],
      ['Luftfeuchtigkeit', '100%'],
      ['Nächster Regen', 'Jetzt']
    ]
  );
});

test("Home Assistant's own translation of the state wins over ours", () => {
  const variant = variants.ok;
  const ctx = ctxOf(variant);
  ctx.hass.formatEntityState = () => 'Teilweise bewölkt (HA)';
  assert.equal(viewOf(ctx).label, 'Teilweise bewölkt (HA)');
});

test('an unknown weather state uses the cloudy artwork and a readable label', () => {
  const view = viewOf(ctxOf(variants.newCondition));
  assert.equal(view.label, 'tornado warning');
  assert.equal(view.icon, 'weather-cloudy');
  assert.match(html(variants.newCondition), /data-group="cloudy"/);
});

test('unavailable, unknown and missing entities render a calm state, never throw', () => {
  for (const name of ['unavailable', 'unknown', 'missing']) {
    const markup = html(variants[name]);
    assert.match(markup, /Weather unavailable/, name);
    assert.match(markup, /data-unavailable="true"/, name);
    assert.match(markup, /data-group="unavailable"/, name);
    assert.match(markup, /data-ov="time-main"/, `${name} still shows the time`);
    assert.ok(!/class="ov-temp[ "]/.test(markup), `${name} shows no temperature`);
    assert.ok(!/data-detail=/.test(markup), `${name} shows no details`);
  }
});

test('every variant: one scene root, escaped names, no service calls, both modes', () => {
  for (const [name, variant] of Object.entries({...variants, ...NIGHT_VARIANTS})) {
    for (const mode of ['screensaver', 'card']) {
      const callService = () => {
        throw new Error('callService');
      };
      const hass = {states: structuredClone(variant.states), ...variant.hass, callService};
      const ctx = contextFor(weather, {hass, config: variant.config, raw: variant.options, mode});
      const markup = weather.render(ctx, mode);
      assert.match(markup, /^<div class="ov-scene ov-weather-scene" /, `${name}/${mode}`);
      assert.ok(!/<img|onerror|<script|<style|<svg|url\(/.test(markup), `${name}/${mode} escapes`);
      assert.equal(markup, weather.render(ctx, mode), `${name}/${mode} is pure`);
    }
  }
});

test('sky table: every group has a day and a night scene within the painting budget', () => {
  for (const condition of [...CONDITIONS, null]) {
    for (const day of [true, false]) {
      const sky = skyFor(condition, day);
      assert.equal(sky.sky.length, 3);
      assert.ok(sky.clouds.length <= 6);
      for (const c of sky.clouds) {
        assert.ok(c.o > 0 && c.o <= 1, 'cloud opacity is a fraction');
        assert.ok(c.drift > 0 && Math.abs(c.dir) === 1);
        assert.match(c.lit, /^\d+,\d+,\d+$/);
        assert.match(c.shade, /^\d+,\d+,\d+$/);
      }
      assert.match(sky.scrim, /^\d+,\d+,\d+$/);
    }
  }
});

test('painted layers per scene: sky, stars, orb, clouds and one effect stay at eight or fewer', () => {
  const layers = (markup) =>
    (markup.match(/<(i|div) class="ov-(sky|stars|orb|cloud|fx)[ "]/g) || []).length;
  for (const [name, variant] of Object.entries({...variants, ...NIGHT_VARIANTS})) {
    assert.ok(layers(html(variant)) <= 8, `${name} paints ${layers(html(variant))} layers`);
  }
});
