// Intl constructors are expensive on wall tablets. Share a bounded cache across widgets, overviews and chrome.
const MAX_FORMATTERS = 128;
const formatters = new Map();

/** Reuse equivalent options regardless of property order; retain only the most recently used formats. */
function formatter(kind, language, options, {fallback = false, fallbackLanguage} = {}) {
  const entries = Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  // JSON would otherwise conflate NaN/Infinity with null, allowing a cached valid option to hide a RangeError.
  for (const entry of entries) {
    if (typeof entry[1] === 'number' && !Number.isFinite(entry[1])) entry[1] = String(entry[1]);
  }
  const key = JSON.stringify([kind, language, entries, fallback, fallbackLanguage]);
  let value = formatters.get(key);
  if (value) {
    formatters.delete(key);
  } else {
    try {
      value = new Intl[kind](language, options);
    } catch (error) {
      if (!fallback) throw error;
      // Overview fallbacks keep the requested format but discard invalid profile locale/zone metadata.
      value = new Intl[kind](fallbackLanguage, {...options, timeZone: undefined});
    }
    if (formatters.size === MAX_FORMATTERS) formatters.delete(formatters.keys().next().value);
  }
  formatters.set(key, value);
  return value;
}

/** Invalid locale/options throw unless the caller explicitly opts into the browser-locale fallback. */
export const dateTimeFormatter = (language, options = {}, recovery) =>
  formatter('DateTimeFormat', language, options, recovery);
export const numberFormatter = (language, options = {}, recovery) =>
  formatter('NumberFormat', language, options, recovery);
export const relativeTimeFormatter = (language, options = {}, recovery) =>
  formatter('RelativeTimeFormat', language, options, recovery);
