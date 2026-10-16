// The contexts widgets see. A context is the whole API of a widget: it never receives the card itself.
// (The one exception is a card-level feature such as `dim`, which is core code and gets `ctx.card`.)
//
// Contexts are rebuilt on every call and are cheap: a handful of closures over the hass object.
import {buttonHTML, esc, iconHTML, num} from './html.js';
import {t as translateFor} from './i18n.js';
import {getWidget} from './registry.js';
import {isAvailable, isUsable} from './state.js';

import {temperatureUnit} from './format.js';

/** Stores that survive renders, one per widget object (a new setConfig builds new widget objects). */
const stores = new WeakMap();

function storeOf(widget) {
  let store = stores.get(widget);
  if (!store) stores.set(widget, (store = new Map()));
  return store;
}

/**
 * The part of the context shared by renders, hooks and actions.
 * @param {any} card   a HouseViewCard (or a test double with _hass _config _pending _info)
 */
export function createBaseContext(card) {
  const hass = card._hass;
  const config = card._config;
  const stateOf = (id) => hass?.states?.[id];
  return {
    hass,
    config,
    stateOf,
    attrsOf: (id) => stateOf(id)?.attributes || {},
    availableOf: (id) => isAvailable(stateOf(id), id),
    esc,
    num,
    t: (key, vars) => translateFor(hass, key, vars),
    unit: () => temperatureUnit(hass),
    lang: () => hass?.locale?.language,
    icon: iconHTML,
    isPending: (id) => !!card._pending?.has(id),
    // preview_time pins the clock for screenshots and tests; it is a carousel setting
    /** Epoch milliseconds of a date string or number (NaN when unparsable). For timestamps found in attributes. */
    time: (value) => new Date(value).valueOf(),
    now: () => (config?.preview_time ? new Date(config.preview_time).valueOf() : Date.now()),
    // THE only route to hass.callService
    call: (domain, service, data) => hass.callService(domain, service, data),
    info: (id) => card._info(id)
  };
}

/** Availability of a widget's own entity under its policy (the same rule the original renderer applied). */
function widgetAvailability(def, state, entityId) {
  if (def.entity === 'none' || def.availability === 'always') return true;
  return isUsable(
    state,
    entityId,
    def.availability === 'allow-unknown' ? 'allow-unknown' : 'entity'
  );
}

/**
 * The context `render(ctx)` receives.
 * @param {any} card
 * @param {Object} widget   the normalised widget config
 * @param {number} index    position in config.widgets (written to data-widget)
 */
export function createRenderContext(card, widget, index) {
  const def = getWidget(widget.type);
  if (!def) throw new Error(`Unsupported widget: ${widget.type}`);
  const base = createBaseContext(card);
  const entityId = widget.entity;
  const state = base.stateOf(entityId);
  const attrs = state?.attributes || {};
  const ok = widgetAvailability(def, state, entityId);
  const rawName = widget.name || attrs.friendly_name || def.type.replaceAll('_', ' ');
  const size = widget.size || def.defaultSize;
  const cls = `widget ${def.type} size-${size}`;
  const attr = `data-widget="${index}"`;

  const btn = (action, content, extraClass = '', enabled = ok, opts = {}) => {
    const {entity = entityId, attrs: extraAttrs = ''} = opts;
    return buttonHTML(action, entity, content, extraClass, enabled, {
      pending: base.isPending(entity),
      attrs: extraAttrs
    });
  };

  return Object.assign(base, {
    widget,
    index,
    type: def.type,
    entityId,
    state,
    attrs,
    ok,
    name: esc(rawName),
    rawName,
    size,
    cls,
    attr,
    btn,
    tile: (action, content, extra = '') =>
      btn(action, content, `tile ${cls} ${extra}`, ok, {attrs: `${attr} `}),
    root: (tag, extra, inner) => `<${tag} ${attr} class="tile ${cls} ${extra}">${inner}</${tag}>`,
    feature: (bit) => ok && !!(attrs.supported_features & bit),
    iconName: (fallback) => widget.icon || fallback,
    stateText: (stateObj = state) => {
      // localized_states is the opt-in HA tranche: hass.formatEntityState knows the user's language
      if (
        stateObj &&
        card._config?.localized_states &&
        typeof base.hass?.formatEntityState === 'function'
      ) {
        return base.hass.formatEntityState(stateObj);
      }
      return String(stateObj?.state ?? '').replaceAll('_', ' ');
    }
  });
}

/**
 * The context hooks receive: the render context plus the mounted element and per-instance memory.
 * @param {Element|null} [el]   the mounted tile root, null when the widget is not on the current page
 */
export function createHookContext(card, widget, index, el = null) {
  return Object.assign(createRenderContext(card, widget, index), {
    el,
    requestRender: () => {
      if (typeof card._requestWidgetRender === 'function') return card._requestWidgetRender(index);
      const element = card._renderedCards?.get(index);
      if (typeof element?.update === 'function') return element.update();
      return card._updateWidgets?.();
    },
    store: storeOf(widget)
  });
}

/**
 * What card-level code (a widget extension's action, a core feature) may use besides the base context:
 * its own state, a re-render, and lookups in the card's shadow root.
 * @param {any} card
 * @param {string|undefined} type   widget type that owns the extension
 */
export function createExtensionContext(card, type) {
  const root = card.shadowRoot;
  const q = (selector) => root?.querySelector(selector) ?? null;
  return Object.assign(createBaseContext(card), {
    type,
    ext: type ? card._ext?.[type] : undefined,
    root,
    q,
    render: () => card._render(),
    focus: (selector) => q(selector)?.focus({preventScroll: true})
  });
}

/**
 * The context `guard`, `confirm` and `run` receive.
 * @param {any} card
 * @param {string} action   the data-action string ('timer-start-15')
 * @param {string} id       the entity id
 * @param {{owner?: string, source?: string, param?: string}|null} [hit]   registry.resolveAction result
 */
export function createActionContext(card, action, id, hit = null) {
  const owner = hit?.owner;
  const source = hit?.source;
  const cardLevel = source === 'extension' || source === 'feature';
  const base = cardLevel
    ? createExtensionContext(card, source === 'extension' ? owner : undefined)
    : createBaseContext(card);
  // The widget this action belongs to; undefined for a direct card._act call.
  const ownedByWidget = source === 'widget' || source === 'extension';
  const widget = card._config?.widgets?.find(
    (w) => w.entity === id && (!ownedByWidget || w.type === owner)
  );
  return Object.assign(base, {
    action,
    param: hit?.param ?? '',
    widget,
    ...(source === 'feature' ? {card} : {}),
    fail: (message) => {
      card._message = message;
      card._refreshActionState?.();
    }
  });
}
