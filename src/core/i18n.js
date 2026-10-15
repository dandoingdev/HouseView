// Translation. Every user-visible string is a key; English is the source text and the last fallback.
//
//   registerStrings({en: {'cover.open': 'Open'}, de: {'cover.open': 'Auf'}})
//   t(hass, 'cover.percent_open', {n: 40})   ->  '40% open'
//
// Lookup order for the language "de-AT": de-AT, de, then en, then the key itself.
import en from '../i18n/en.js';

/** language code (lower case) -> {key: text} */
const tables = new Map();

const normalise = (language) => String(language).toLowerCase().replace('_', '-');

/**
 * Merge strings into the tables. A later registration wins for the same key, so an application can
 * override a text.
 * @param {Record<string, Record<string, string>>} strings   {language: {key: text}}
 */
export function registerStrings(strings) {
  if (!strings || typeof strings !== 'object') return;
  for (const [language, table] of Object.entries(strings)) {
    if (!table || typeof table !== 'object') continue;
    const code = normalise(language);
    tables.set(code, {...tables.get(code), ...table});
  }
}

/** Languages to try for a locale, most specific first: ['de-at', 'de', 'en']. */
export function languageChain(language) {
  const chain = [];
  if (typeof language === 'string' && language) {
    const code = normalise(language);
    chain.push(code);
    const base = code.split('-')[0];
    if (base !== code) chain.push(base);
  }
  if (!chain.includes('en')) chain.push('en');
  return chain;
}

/** `{name}` placeholders are replaced from `vars`; a placeholder without a value is left visible. */
export function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined || vars[name] === null ? match : String(vars[name])
  );
}

/**
 * Translate by language code.
 * @param {string|undefined} language   e.g. hass.locale.language
 * @param {string} key
 * @param {Record<string, any>} [vars]
 */
export function translate(language, key, vars) {
  for (const code of languageChain(language)) {
    const text = tables.get(code)?.[key];
    if (typeof text === 'string') return interpolate(text, vars);
  }
  return key;
}

/** The language a hass object asks for (undefined when it has no locale). */
export function languageOf(hass) {
  return hass?.locale?.language;
}

/**
 * Translate for a hass object. This is what `ctx.t` calls.
 * @param {any} hass
 * @param {string} key
 * @param {Record<string, any>} [vars]
 */
export function t(hass, key, vars) {
  return translate(languageOf(hass), key, vars);
}

/** True when some language has a text for the key (used by tests and the contract linter). */
export function hasString(key) {
  for (const table of tables.values()) if (typeof table[key] === 'string') return true;
  return false;
}

/** Registered language codes. */
export function languages() {
  return [...tables.keys()];
}

/** Forget every registered string and reload the core English table. Tests only. */
export function _resetStrings() {
  tables.clear();
  registerStrings({en});
}

registerStrings({en});
