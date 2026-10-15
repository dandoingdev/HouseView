// Integration with Home Assistant's own editors. This is the only module that depends on HA frontend internals
// (docs/architecture.md): `window.loadCardHelpers`, the lazily defined `hui-entities-card` /
// `hui-vertical-stack-card` classes and the `hui-stack-card-editor` element.
//
// Nothing in here may break the card. Every failure degrades to "the native editor is missing":
//   - without `ha-form` the carousel editor shows a short notice (YAML editing is always available);
//   - without `hui-stack-card-editor` the forms still work and each page's cards are edited in YAML.
// Re-check after each major HA frontend release.

const STACK_CARDS = ['hui-entities-card', 'hui-vertical-stack-card'];

let loading;

/**
 * Make HA define `hui-stack-card-editor` (and the editors it needs). HA loads its built-in cards lazily; creating
 * one card of each kind makes it fetch the chunk, after which the real constructors are awaited instead of
 * inspecting a loading placeholder. Resolves `true` when the native editors can be used, `false` otherwise;
 * never rejects, and a failed attempt may be retried by calling again.
 */
export function ensureNativeEditors() {
  if (!window.loadCardHelpers) return Promise.resolve(false);
  loading ||= load().catch((error) => {
    loading = undefined;
    console.warn('HouseView: could not load Home Assistant’s card editors', error);
    return false;
  });
  return loading;
}

async function load() {
  const helpers = await window.loadCardHelpers();
  helpers.createCardElement({type: 'entities', entities: []});
  helpers.createCardElement({type: 'vertical-stack', cards: []});
  await Promise.all(STACK_CARDS.map((tag) => customElements.whenDefined(tag)));
  await Promise.all(STACK_CARDS.map((tag) => customElements.get(tag).getConfigElement()));
  return true;
}

/** Is the form element available? */
export const hasForm = () => !!customElements.get('ha-form');

/** Is the card-stack editor available? */
export const hasStackEditor = () => !!customElements.get('hui-stack-card-editor');

/** Everything the carousel editor needs is defined. */
export const nativeReady = () => hasForm() && hasStackEditor();

/**
 * Ask HA to load its editors, then report whether `ha-form` and `hui-stack-card-editor` are both defined.
 * Used by the degraded editor to upgrade itself instead of staying degraded until the next reopen.
 */
export async function whenNativeReady() {
  await ensureNativeEditors();
  return nativeReady();
}

/**
 * A `hui-stack-card-editor` showing `cards` (a vertical stack titled `title`). The caller listens for its
 * `config-changed` event; `config.cards` is the page's card list, `config.title` the (renamed) page name.
 */
export function createStackEditor({hass, lovelace, title, cards}) {
  const stack = document.createElement('hui-stack-card-editor');
  stack.hass = hass;
  stack.lovelace = lovelace;
  stack.setConfig({type: 'vertical-stack', title, cards});
  return stack;
}
