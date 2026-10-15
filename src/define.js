// Safe registration of custom elements and Lovelace picker entries.
//
// The resource may be loaded twice (HACS plus a manual `resources:` entry, or two bundles of different
// versions). A bare `customElements.define` throws on the second load and takes the whole dashboard with it
//; `window.customCards.push` would list every card twice in the picker.

/** Where the picker's "documentation" link goes. The build injects `package.json#homepage`; empty when absent. */
export const DOCUMENTATION_URL = String(globalThis.__HV_HOMEPAGE__ ?? '');

/**
 * `customElements.define` that ignores a tag which is already defined.
 * @param {string} tag
 * @param {CustomElementConstructor} constructor
 * @returns {boolean} true when this call defined the element, false when a definition already existed
 */
export function defineOnce(tag, constructor) {
  if (customElements.get(tag)) return false;
  customElements.define(tag, constructor);
  return true;
}

/**
 * Add an entry to `window.customCards` (the list Home Assistant's card picker reads) unless one with the
 * same `type` is already there. Empty optional fields are left out so the picker never shows `undefined`.
 * @param {{type: string, name: string, description?: string, preview?: boolean, documentationURL?: string}} entry
 * @returns {boolean} true when the entry was added
 */
export function registerCustomCard(entry) {
  const win = globalThis.window;
  if (!win) return false;
  const cards = (win.customCards ||= []);
  if (cards.some((card) => card?.type === entry.type)) return false;
  const clean = Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined && value !== '')
  );
  cards.push(clean);
  return true;
}
