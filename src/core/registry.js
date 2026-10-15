// The widget registry: the one place that knows which widget kinds exist.
//
// Everything that used to be a hand-written list (accepted types, picker labels, element tags, domains,
// default sizes, layout roles, "unknown is fine" domains, action owners) is derived from here, so adding a
// widget folder adds the kind everywhere. Nothing in this file names a kind.
import {coreActions, featureActions} from './core-actions.js';
import {checkActionDef, isWidgetDefinition} from './define-widget.js';
import {registerStrings} from './i18n.js';

/** Reserved pseudo-type for a native Home Assistant card placed on a HouseView page. Not a module. */
export const NATIVE_CARD = 'native_card';

/** @type {Map<string, Object>} type -> definition */
const widgets = new Map();
/** @type {Map<string, Object>} alias -> definition */
const aliases = new Map();
/** @type {Map<string, Object>} element tag -> definition */
const tags = new Map();
/** @type {Map<string, Object>} exact action name -> entry */
const exactActions = new Map();
/** @type {{prefix: string, entry: Object}[]} prefix actions ("timer-start-*"), longest prefix first */
let prefixActions = [];
/** @type {Set<(event: {type: string}) => void>} */
const listeners = new Set();

let listCache = null;

// ---- actions ---------------------------------------------------------------------------------------------------

/**
 * @typedef {Object} ActionEntry
 * @property {string} key       the registered name ("timer-start-*" for a prefix action)
 * @property {string} owner     widget type, or 'core' / 'feature'
 * @property {'widget'|'extension'|'core'|'feature'} source
 * @property {Object} def       the ActionDef
 */

const isPrefix = (key) => key.endsWith('*');

/** Two action keys overlap when they could match the same name ("timer-*" covers "timer-pause"). */
function overlaps(a, b) {
  const [pa, pb] = [a, b].map((key) => (isPrefix(key) ? key.slice(0, -1) : null));
  if (pa === null && pb === null) return a === b;
  if (pa === null) return a.startsWith(pb);
  if (pb === null) return b.startsWith(pa);
  return pa.startsWith(pb) || pb.startsWith(pa);
}

/** The registered key that already claims `key`, or undefined. */
function conflictingKey(key) {
  const registered = [...exactActions.keys(), ...prefixActions.map((p) => p.entry.key)];
  return registered.find((existing) => overlaps(existing, key));
}

function addAction(entry) {
  if (isPrefix(entry.key)) {
    prefixActions.push({prefix: entry.key.slice(0, -1), entry});
    prefixActions.sort((a, b) => b.prefix.length - a.prefix.length);
  } else exactActions.set(entry.key, entry);
}

/** [key, def, source] triples of the actions a widget definition declares. */
function actionsOf(def) {
  return [
    ...Object.entries(def.actions).map(([key, action]) => [key, action, 'widget']),
    ...Object.entries(def.extension?.actions || {}).map(([key, action]) => [
      key,
      action,
      'extension'
    ])
  ];
}

function seedCoreActions() {
  for (const [key, def] of Object.entries(coreActions)) {
    addAction({key, owner: 'core', source: 'core', def});
  }
  for (const [key, def] of Object.entries(featureActions)) {
    addAction({key, owner: 'feature', source: 'feature', def});
  }
}

/**
 * Register a card-level feature: an `immediate` action owned by no widget (dim, page-prev, ...).
 * Its `run(ctx, id)` receives a context that also carries `card`.
 * @param {string} name
 * @param {Object} def   ActionDef
 */
export function registerFeature(name, def) {
  const problems = checkActionDef(name, def, 'feature');
  if (problems.length) throw new Error(`registerFeature(${name}): ${problems.join('; ')}`);
  const clash = conflictingKey(name);
  if (clash) throw new Error(`registerFeature: action "${name}" clashes with "${clash}"`);
  addAction({key: name, owner: 'feature', source: 'feature', def: Object.freeze({...def})});
  notify('feature');
  return def;
}

/**
 * Find the module that owns a data-action name.
 * @param {string} name   e.g. 'cover-open' or 'timer-start-15'
 * @returns {{name:string, key:string, owner:string, source:string, def:Object, param:string}|null}
 *   `param` is the part after a prefix ('15' for 'timer-start-*'), '' for an exact name.
 */
export function resolveAction(name) {
  if (typeof name !== 'string') return null;
  const exact = exactActions.get(name);
  if (exact)
    return {
      name,
      key: exact.key,
      owner: exact.owner,
      source: exact.source,
      def: exact.def,
      param: ''
    };
  for (const {prefix, entry} of prefixActions) {
    if (name.startsWith(prefix)) {
      return {
        name,
        key: entry.key,
        owner: entry.owner,
        source: entry.source,
        def: entry.def,
        param: name.slice(prefix.length)
      };
    }
  }
  return null;
}

// ---- widgets ---------------------------------------------------------------------------------------------------

function assertRegistrable(def) {
  if (!isWidgetDefinition(def)) {
    throw new TypeError('registerWidget: pass the object returned by defineWidget()');
  }
  if (widgets.has(def.type)) throw new Error(`registerWidget: duplicate widget type "${def.type}"`);
  if (aliases.has(def.type)) {
    throw new Error(
      `registerWidget: "${def.type}" is already an alias of "${aliases.get(def.type).type}"`
    );
  }
  for (const alias of def.aliases) {
    if (widgets.has(alias) || aliases.has(alias)) {
      throw new Error(`registerWidget: alias "${alias}" of "${def.type}" is already taken`);
    }
  }
  if (tags.has(def.tag)) {
    throw new Error(`registerWidget: duplicate tag "${def.tag}"`);
  }
  for (const other of widgets.values()) {
    if (other.order === def.order) {
      throw new Error(`registerWidget: "${def.type}" and "${other.type}" share order ${def.order}`);
    }
  }
  const keys = actionsOf(def).map(([key]) => key);
  keys.forEach((key, i) => {
    const clash = conflictingKey(key) ?? keys.slice(0, i).find((earlier) => overlaps(earlier, key));
    if (clash) {
      throw new Error(
        `registerWidget: action "${key}" of "${def.type}" clashes with action "${clash}"`
      );
    }
  });
}

/**
 * Add a widget module. Throws on a duplicate type, alias, order or action name; nothing is added then.
 * @param {Object|null} def   the result of defineWidget (null, from a skipped bad definition, is ignored)
 * @param {Record<string, Record<string, string>>} [strings]   the contents of the widget's strings.js
 */
export function registerWidget(def, strings) {
  if (def === null || def === undefined) return null;
  assertRegistrable(def);
  widgets.set(def.type, def);
  tags.set(def.tag, def);
  for (const alias of def.aliases) aliases.set(alias, def);
  for (const [key, action, source] of actionsOf(def)) {
    addAction({key, owner: def.type, source, def: action});
  }
  if (strings) registerStrings(strings);
  listCache = null;
  notify('widget');
  return def;
}

/** The definition of a type or of an alias ('scene' -> action), or undefined. */
export function getWidget(type) {
  return widgets.get(type) ?? aliases.get(type);
}

/** The widget that owns an element tag, or undefined. */
export function widgetByTag(tag) {
  return tags.get(tag);
}

/** Definitions sorted by `order` (picker and editor order). A new array each call. */
export function widgetList() {
  listCache ||= [...widgets.values()].sort((a, b) => a.order - b.order);
  return [...listCache];
}

/** Canonical widget types in picker order. */
export function widgetKinds() {
  return widgetList().map((def) => def.type);
}

/** {type: label}, in picker order. */
export function widgetLabels() {
  return Object.fromEntries(widgetList().map((def) => [def.type, def.label]));
}

/** Every type setConfig accepts: canonical types, aliases and the native_card pseudo-type. */
export function knownTypes() {
  return [...widgetKinds(), ...aliases.keys(), NATIVE_CARD];
}

/** Domains whose state "unknown" still counts as available (the action widget's scene, button...). */
export function unknownOkDomains() {
  return [...new Set(widgetList().flatMap((def) => def.unknownOkDomains))];
}

/** Layout roles of a widget type ([] for unknown types and native cards). */
export function layoutRolesOf(type) {
  return getWidget(type)?.layoutRoles ?? [];
}

/** Size a widget gets when its config has none ('normal' for unknown types and native cards). */
export function defaultSizeOf(type) {
  return getWidget(type)?.defaultSize ?? 'normal';
}

/** Widgets that declare a card-level extension, in picker order. */
export function extensions() {
  return widgetList()
    .filter((def) => def.extension)
    .map((def) => ({type: def.type, extension: def.extension, def}));
}

// ---- change notification and tests -----------------------------------------------------------------------------

function notify(type) {
  for (const listener of [...listeners]) {
    try {
      listener({type});
    } catch (error) {
      console.error('[HouseView] registry listener failed', error);
    }
  }
}

/**
 * Be told when a widget or feature is registered (used to keep the `kinds` and `labels` exports live).
 * @returns { => void} unsubscribe
 */
export function onRegistryChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Empty the registry and re-seed the core actions. Unit tests only. */
export function _resetRegistry() {
  widgets.clear();
  tags.clear();
  aliases.clear();
  exactActions.clear();
  prefixActions = [];
  listCache = null;
  seedCoreActions();
  notify('reset');
}

seedCoreActions();
