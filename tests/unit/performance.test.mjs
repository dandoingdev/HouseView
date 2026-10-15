// The `performance` setting (src/core/performance.js): the auto decision with injectable navigator values, the
// explicit modes, and the config validation of the key.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOW_CORES,
  LOW_MEMORY_GB,
  PERFORMANCE_MODES,
  isLowEndDevice,
  isLowRamWebView,
  resolvePerformance
} from '../../src/core/performance.js';
import {installBrowserGlobals} from './controller-env.mjs';

const CHROME_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const TABLET_WEBVIEW_ANDROID_9 =
  'Mozilla/5.0 (Linux; Android 9; Generic Tablet Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Safari/537.36';
const PHONE_WEBVIEW_ANDROID_14 =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36';
const BROWSER_ANDROID_8 =
  'Mozilla/5.0 (Linux; Android 8.0.0; SM-T580) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const WEBVIEW_ANDROID_GO =
  'Mozilla/5.0 (Linux; Android 11; Go edition tablet; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.0.0 Safari/537.36';

const capable = {deviceMemory: 8, hardwareConcurrency: 8, userAgent: CHROME_DESKTOP};

test('the modes are auto, full and lite', () => {
  assert.deepEqual(PERFORMANCE_MODES, ['auto', 'full', 'lite']);
});

test('explicit modes ignore the device', () => {
  const weak = {deviceMemory: 1, hardwareConcurrency: 2, userAgent: TABLET_WEBVIEW_ANDROID_9};
  assert.equal(resolvePerformance('full', weak), 'full');
  assert.equal(resolvePerformance('lite', capable), 'lite');
});

test('auto: a capable device keeps the full look', () => {
  assert.equal(resolvePerformance('auto', capable), 'full');
  assert.equal(resolvePerformance(undefined, capable), 'full');
});

test('auto: 2 GB of memory or less is lite, more is not', () => {
  assert.equal(LOW_MEMORY_GB, 2);
  for (const deviceMemory of [0.25, 0.5, 1, 2]) {
    assert.equal(
      resolvePerformance('auto', {...capable, deviceMemory}),
      'lite',
      `${deviceMemory} GB`
    );
  }
  for (const deviceMemory of [4, 8]) {
    assert.equal(
      resolvePerformance('auto', {...capable, deviceMemory}),
      'full',
      `${deviceMemory} GB`
    );
  }
});

test('auto: 4 logical cores or fewer is lite, more is not', () => {
  assert.equal(LOW_CORES, 4);
  for (const hardwareConcurrency of [1, 2, 4]) {
    assert.equal(
      resolvePerformance('auto', {...capable, hardwareConcurrency}),
      'lite',
      `${hardwareConcurrency} cores`
    );
  }
  for (const hardwareConcurrency of [6, 8, 16]) {
    assert.equal(
      resolvePerformance('auto', {...capable, hardwareConcurrency}),
      'full',
      `${hardwareConcurrency} cores`
    );
  }
});

test('auto: either signal is enough, a missing one counts for nothing', () => {
  assert.equal(resolvePerformance('auto', {deviceMemory: 2}), 'lite');
  assert.equal(resolvePerformance('auto', {hardwareConcurrency: 4}), 'lite');
  assert.equal(resolvePerformance('auto', {deviceMemory: 8}), 'full');
  assert.equal(resolvePerformance('auto', {}), 'full');
  // null, not undefined: undefined would fall back to the real navigator of whatever machine runs the test
  assert.equal(resolvePerformance('auto', null), 'full', 'no navigator at all');
});

test('auto: nonsense values do not make a device low-end', () => {
  for (const value of [0, -1, NaN, 'lots', null, undefined, Infinity]) {
    assert.equal(
      resolvePerformance('auto', {deviceMemory: value, hardwareConcurrency: value}),
      'full',
      String(value)
    );
  }
});

test('auto: an old Android WebView is lite even when it reports nothing else', () => {
  assert.equal(resolvePerformance('auto', {userAgent: TABLET_WEBVIEW_ANDROID_9}), 'lite');
  assert.equal(resolvePerformance('auto', {userAgent: WEBVIEW_ANDROID_GO}), 'lite');
});

test('auto: a recent Android WebView, a desktop browser and a plain Android browser are not', () => {
  assert.equal(resolvePerformance('auto', {userAgent: PHONE_WEBVIEW_ANDROID_14}), 'full');
  assert.equal(resolvePerformance('auto', {userAgent: CHROME_DESKTOP}), 'full');
  // an old Android in a normal browser tab: the WebView rule does not apply, only memory and cores decide
  assert.equal(resolvePerformance('auto', {userAgent: BROWSER_ANDROID_8}), 'full');
});

test('the user agent rule on its own', () => {
  assert.equal(isLowRamWebView(TABLET_WEBVIEW_ANDROID_9), true);
  assert.equal(isLowRamWebView(WEBVIEW_ANDROID_GO), true);
  assert.equal(isLowRamWebView(PHONE_WEBVIEW_ANDROID_14), false);
  assert.equal(isLowRamWebView(BROWSER_ANDROID_8), false);
  assert.equal(isLowRamWebView(''), false);
  assert.equal(isLowRamWebView(undefined), false);
  assert.equal(isLowRamWebView(42), false);
});

test('an unknown setting behaves like auto (validation rejects it before it gets here)', () => {
  assert.equal(resolvePerformance('turbo', capable), 'full');
  assert.equal(resolvePerformance('turbo', {...capable, deviceMemory: 1}), 'lite');
});

test('isLowEndDevice reads the real navigator when none is given', () => {
  assert.equal(typeof isLowEndDevice(), 'boolean');
  assert.match(resolvePerformance('auto'), /^(full|lite)$/);
});

// ---- the card resolves the setting once per config ----

const browser = installBrowserGlobals();
const {HouseViewCard} = await import('../../src/controller/houseview-card.js');

/** Run `fn` with a stand-in navigator. */
function withNavigator(nav, fn) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {value: nav, configurable: true});
  try {
    return fn();
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved);
    else delete globalThis.navigator;
  }
}

const cards = (extra = {}) => ({cards: [{type: 'custom:houseview-clock-card'}], ...extra});

test('setConfig: an explicit mode wins, auto looks at the navigator, a new config decides again', () => {
  const card = new HouseViewCard();
  assert.equal(card._perf, 'full', 'full until a config says otherwise');
  withNavigator(capable, () => {
    card.setConfig(cards());
    assert.equal(card._perf, 'full');
    card.setConfig(cards({performance: 'lite'}));
    assert.equal(card._perf, 'lite');
    card.setConfig(cards({performance: 'auto'}));
    assert.equal(card._perf, 'full');
  });
  withNavigator({...capable, deviceMemory: 1}, () => {
    card.setConfig(cards());
    assert.equal(card._perf, 'lite');
    card.setConfig(cards({performance: 'full'}));
    assert.equal(card._perf, 'full');
  });
  withNavigator({userAgent: TABLET_WEBVIEW_ANDROID_9}, () => {
    card.setConfig(cards({performance: 'auto'}));
    assert.equal(card._perf, 'lite', 'the owner’s tablet');
  });
});

test('setConfig: a rejected config keeps the previous mode', () => {
  const card = new HouseViewCard();
  withNavigator(capable, () => {
    card.setConfig(cards({performance: 'lite'}));
    assert.throws(
      () => card.setConfig(cards({performance: 'turbo'})),
      /performance must be auto, full or lite\./
    );
    assert.equal(card._perf, 'lite');
  });
});

test.after(() => browser.restore());
