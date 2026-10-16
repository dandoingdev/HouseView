import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {dateTimeFormatter, numberFormatter, relativeTimeFormatter} from '../../src/core/intl.js';

const stamp = Date.parse('2026-10-16T23:30:00Z');

describe('shared Intl formatters', () => {
  it('reuses equivalent options without mutating the caller', () => {
    const options = Object.freeze({hour: 'numeric', timeZone: 'UTC', minute: '2-digit'});
    assert.equal(
      dateTimeFormatter('en-GB', options),
      dateTimeFormatter('en-GB', {
        minute: '2-digit',
        hour: 'numeric',
        timeZone: 'UTC',
        second: undefined
      })
    );
    assert.equal(
      numberFormatter('de-DE', {maximumFractionDigits: 1}),
      numberFormatter('de-DE', {maximumFractionDigits: 1})
    );
  });

  it('keeps locale, time zone, hour preferences and formatter kinds separate', () => {
    for (const language of ['en-GB', 'en-US', 'ar-EG']) {
      for (const timeZone of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
        for (const hour12 of [true, false]) {
          const options = {hour: 'numeric', minute: '2-digit', timeZone, hour12};
          const expected = new Intl.DateTimeFormat(language, options);
          const actual = dateTimeFormatter(language, options);
          assert.equal(actual.format(stamp), expected.format(stamp));
          assert.deepEqual(actual.formatToParts(stamp), expected.formatToParts(stamp));
        }
      }
    }
    numberFormatter('en', {maximumFractionDigits: null});
    assert.throws(() => numberFormatter('en', {maximumFractionDigits: NaN}), RangeError);
    assert.throws(() => numberFormatter('en', {maximumFractionDigits: Infinity}), RangeError);
    assert.notEqual(numberFormatter('en'), dateTimeFormatter('en'));
    assert.equal(
      relativeTimeFormatter('de', {numeric: 'auto'}).format(-1, 'day'),
      new Intl.RelativeTimeFormat('de', {numeric: 'auto'}).format(-1, 'day')
    );
  });

  it('preserves strict errors and makes fallback an explicit per-caller policy', () => {
    assert.throws(() => dateTimeFormatter('bad_locale'), RangeError);
    const recovery = {fallback: true};
    const recovered = dateTimeFormatter(
      'bad_locale',
      {timeZone: 'invalid-zone', hour: 'numeric'},
      recovery
    );
    assert.equal(
      recovered.format(stamp),
      new Intl.DateTimeFormat(undefined, {hour: 'numeric'}).format(stamp)
    );
    assert.equal(
      recovered,
      dateTimeFormatter('bad_locale', {timeZone: 'invalid-zone', hour: 'numeric'}, recovery)
    );
    assert.throws(
      () => dateTimeFormatter('bad_locale', {timeZone: 'invalid-zone', hour: 'numeric'}),
      RangeError
    );
    const fixed = dateTimeFormatter(
      'en-US',
      {timeZone: 'invalid-zone', year: 'numeric'},
      {fallback: true, fallbackLanguage: 'en-US'}
    );
    assert.equal(fixed.resolvedOptions().locale, 'en-US');
    assert.throws(() => numberFormatter('en', {maximumFractionDigits: -1}, recovery), RangeError);
  });

  it('bounds retained formats while keeping frequently used ones', () => {
    const active = dateTimeFormatter('en-US-x-active', {timeZone: 'UTC'});
    const old = dateTimeFormatter('en-US-x-old', {timeZone: 'UTC'});
    for (let n = 0; n < 160; n++) {
      dateTimeFormatter(`en-US-x-cache${n}`, {timeZone: 'UTC'});
      assert.equal(dateTimeFormatter('en-US-x-active', {timeZone: 'UTC'}), active);
    }
    assert.notEqual(dateTimeFormatter('en-US-x-old', {timeZone: 'UTC'}), old);
  });
});
