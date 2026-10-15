// The `performance` setting: how much decoration the card paints.
//
//   full   everything: backdrop blur on the glass tiles, page glide, weather scene animation. The look.
//   lite   no backdrop blur (opaque tinted glass instead), no decorative animation or transition, a calmer weather
//          scene. For wall tablets with a weak GPU. Layout, sizes and behaviour are the same.
//   auto   (default) lite on a device that looks low-end, full everywhere else.
//
// "Looks low-end" is decided from what the browser tells us, because no browser reports GPU strength:
//   - navigator.deviceMemory <= 2 (GB; Chrome rounds it down to a power of two)
//   - navigator.hardwareConcurrency <= 4 logical cores
//   - an Android WebView that reports an old Android (9 or older) or a "Go" edition: the 1 to 2 GB tablets
// Desktop browsers, recent phones and the test machines report more than that, so they keep the full look.
//
// Every function takes the navigator as an argument (default: the real one) so the decision is unit-testable.

export const PERFORMANCE_MODES = ['auto', 'full', 'lite'];
export const LOW_MEMORY_GB = 2;
export const LOW_CORES = 4;
/** Android versions up to this one are treated as low-RAM when they run a WebView. */
export const OLD_ANDROID_MAJOR = 9;

/** The user agent of an Android WebView ("; wv)" token, or the old "Version/4.0 Chrome" form). */
const isAndroidWebView = (ua) =>
  /\bAndroid\b/.test(ua) &&
  (/;\s*wv\)/.test(ua) || (/Version\/\d/.test(ua) && /Chrome\//.test(ua)));

/**
 * Does this user agent describe an Android WebView on a low-RAM device? (Android 9 or older, or a Go edition.)
 * @param {string|undefined} ua
 */
export function isLowRamWebView(ua) {
  if (typeof ua !== 'string' || !isAndroidWebView(ua)) return false;
  if (/\bGo\b|Android Go/i.test(ua)) return true;
  const major = /\bAndroid (\d+)/.exec(ua)?.[1];
  return major !== undefined && Number(major) <= OLD_ANDROID_MAJOR;
}

/**
 * True when the device looks low-end (see the header).
 * @param {{deviceMemory?: number, hardwareConcurrency?: number, userAgent?: string}|undefined} nav
 */
export function isLowEndDevice(nav = globalThis.navigator) {
  if (!nav) return false;
  const memory = Number(nav.deviceMemory);
  if (Number.isFinite(memory) && memory > 0 && memory <= LOW_MEMORY_GB) return true;
  const cores = Number(nav.hardwareConcurrency);
  if (Number.isFinite(cores) && cores > 0 && cores <= LOW_CORES) return true;
  return isLowRamWebView(nav.userAgent);
}

/**
 * The effective mode of a card: `lite` or `full`. An unknown value counts as `auto` (validation rejects it earlier).
 * @param {string|undefined} setting   config.performance
 * @param {object} [nav]               navigator, injectable
 * @returns {'full'|'lite'}
 */
export function resolvePerformance(setting, nav = globalThis.navigator) {
  if (setting === 'lite' || setting === 'full') return setting;
  return isLowEndDevice(nav) ? 'lite' : 'full';
}
