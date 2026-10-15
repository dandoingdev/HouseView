// Shared building blocks of the two editors: translation with fallback, ha-form field helpers, the ha-form
// element wrapper and the stylesheet. Nothing here knows about widgets or pages.
import {t} from '../core/i18n.js';
import strings from './strings.js';

export const STYLES =
  '<style>:host{display:block}ha-form{display:block;margin:12px 0}ha-expansion-panel{display:block;margin:16px 0}' +
  'section{padding:12px}ha-button{margin:8px 4px 8px 0}p{color:var(--secondary-text-color);line-height:1.5}' +
  '.status:empty{display:none}</style>';

/**
 * Translate `key`. core/i18n.js returns the key itself for an unknown string; in that case use the English
 * table in strings.js, then `fallback` (default: the key), so a label is never blank.
 */
export function text(hass, key, fallback, vars) {
  const value = t(hass || {}, key, vars);
  if (value !== key) return value;
  return strings.en[key] ?? fallback ?? key;
}

/** Translation that yields `undefined` instead of the key when there is no string (for optional helpers). */
export function textOrNone(hass, key) {
  const value = t(hass || {}, key);
  return value === key ? undefined : value;
}

export const capitalise = (value) => String(value).charAt(0).toUpperCase() + String(value).slice(1);

/** ha-form field descriptor. */
export const field = (name, selector, required = false) => ({name, selector, required});
export const textField = (name) => field(name, {text: {}});

/**
 * `select` selector. `labelFor(value)` returns the label; the default translates `editor.value.<value>` and
 * falls back to the capitalised value ("glass" -> "Glass").
 */
export function select(hass, values, labelFor) {
  const label = labelFor || ((value) => text(hass, `editor.value.${value}`, capitalise(value)));
  return {
    select: {options: values.map((value) => ({value, label: label(value)})), mode: 'dropdown'}
  };
}

/**
 * Create an <ha-form> inside `parent`.
 *
 * `value-changed` is stopped here (it is the form's own event, not the editor's) and the form's data is replaced
 * by the new value, so consecutive changes build on each other even before HA echoes the config back.
 * `computeLabel` / `computeHelper` are plain functions of a schema item; ha-form evaluates them when it renders.
 */
export function createForm(parent, {hass, data, schema, computeLabel, computeHelper, changed}) {
  const el = document.createElement('ha-form');
  el.hass = hass;
  el.data = data;
  el.schema = schema;
  el.computeLabel = computeLabel;
  if (computeHelper) el.computeHelper = computeHelper;
  el.addEventListener('value-changed', (event) => {
    event.stopPropagation();
    el.data = event.detail.value;
    changed(event.detail.value);
  });
  parent.append(el);
  return el;
}

/** Same field names in the same order (used to avoid reassigning a schema that did not change). */
export const sameFields = (a, b) =>
  a.length === b.length && a.every((item, index) => item.name === b[index].name);
