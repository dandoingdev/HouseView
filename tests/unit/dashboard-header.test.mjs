import test from 'node:test';
import assert from 'node:assert/strict';
import {headerLabels} from '../../src/core/dashboard-header.js';

const hass = (language = 'en-GB', time_format = '24', time_zone = 'UTC') => ({
  locale: {language, time_format, time_zone: 'server'},
  config: {time_zone}
});

test('header uses the chosen 12/24-hour format and language', () => {
  const now = Date.parse('2026-10-16T13:05:00Z');
  assert.equal(headerLabels(hass('en-US', '24'), now).time, '13:05');
  assert.match(headerLabels(hass('en-US', '12'), now).time, /^1:05\s*PM$/);
  assert.match(headerLabels(hass('de-DE'), now).date, /Okt/);
});

test('header date and time cross midnight together in the selected server time zone', () => {
  const before = headerLabels(hass(), Date.parse('2026-10-16T23:59:00Z'));
  const after = headerLabels(hass(), Date.parse('2026-10-17T00:00:00Z'));
  assert.equal(before.time, '23:59');
  assert.match(before.date, /16/);
  assert.equal(after.time, '00:00');
  assert.match(after.date, /17/);
  const tokyo = headerLabels(hass('en-GB', '24', 'Asia/Tokyo'), Date.parse('2026-10-16T23:30:00Z'));
  assert.equal(tokyo.time, '08:30');
  assert.match(tokyo.date, /17/);
});
