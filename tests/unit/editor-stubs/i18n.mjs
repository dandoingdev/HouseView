// Test stand-in for src/core/i18n.js: hass.locale.language -> base language -> en -> key.
const tables = {};
export function registerStrings(all) {
  for (const [lang, table] of Object.entries(all)) Object.assign((tables[lang] ||= {}), table);
}
export function t(hass, key, vars = {}) {
  const lang = hass?.locale?.language || 'en';
  const raw = tables[lang]?.[key] ?? tables[lang.split('-')[0]]?.[key] ?? tables.en?.[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
}
