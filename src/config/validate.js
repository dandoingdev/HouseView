// The setConfig pipeline: turn whatever the user wrote into the config the card keeps, or throw.
//
//   cards -> widgets (fromCard)
//   -> card-level extension checks (camera_gallery)
//   -> list not empty -> pages -> per widget: type known -> option enums -> def.validate
//                      -> entity-domain rule -> size rule -> (tap/hold actions) -> normalise
//
// The ORDER decides which message a broken config gets. A null or non-object entry in `cards:` gets a readable
// sentence instead of a TypeError.
import {SIZES} from '../core/define-widget.js';
import {validateActionConfigs} from '../core/action-config.js';
import {CONFIRM_MODES} from '../core/confirm.js';
import {COMPARE_MODES} from '../core/hass-signature.js';
import {PERFORMANCE_MODES} from '../core/performance.js';
import {extensions, getWidget, knownTypes} from '../core/registry.js';
import {fromCard} from './convert.js';
import {validateScreensaver} from '../core/overview-registry.js';

const EDITOR_PREVIEWS = ['landscape', 'portrait', 'auto'];

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

/** "off or toggle", "a, b or c" */
function sentenceList(values) {
  if (values.length < 2) return values.join('');
  return `${values.slice(0, -1).join(', ')} or ${values.at(-1)}`;
}

// ---- cards -> widgets --------------------------------------------------------------------------------------------

function widgetsFromCards(config) {
  if (!Array.isArray(config.cards)) throw new Error('Cards must be a list.');
  const widgets = config.cards.map((card, i) => {
    if (!isObject(card)) throw new Error(`Card ${i + 1} must be an object with a type.`);
    return fromCard(card);
  });
  return {...config, widgets};
}

// ---- optional settings (nothing to break: absent keys are not checked) ------------------------------

function validateOptionalSettings(config) {
  if (config.confirm_mode !== undefined && !CONFIRM_MODES.includes(config.confirm_mode)) {
    throw new Error(`confirm_mode must be ${sentenceList(CONFIRM_MODES)}.`);
  }
  if (config.state_compare !== undefined && !COMPARE_MODES.includes(config.state_compare)) {
    throw new Error(`state_compare must be ${sentenceList(COMPARE_MODES)}.`);
  }
  if (config.performance !== undefined && !PERFORMANCE_MODES.includes(config.performance)) {
    throw new Error(`performance must be ${sentenceList(PERFORMANCE_MODES)}.`);
  }
  if (config.home_overview !== undefined && typeof config.home_overview !== 'boolean') {
    throw new Error('home_overview must be true or false.');
  }
  if (config.home_title !== undefined && typeof config.home_title !== 'string') {
    throw new Error('home_title must be text.');
  }
  if (config.editor_preview !== undefined && !EDITOR_PREVIEWS.includes(config.editor_preview)) {
    throw new Error(`editor_preview must be ${sentenceList(EDITOR_PREVIEWS)}.`);
  }
}

// ---- one widget -------------------------------------------------------------------------------------------------

/** Enum options are checked for truthy values only: YAML `action: false` is normalised, not rejected. */
function validateOptionEnums(def, widget) {
  // A widget derived from an overview validates its own options (with the docs/overview-api.md wording) in `validate`.
  if (def.overview) return;
  for (const [name, spec] of Object.entries(def.options)) {
    if (spec.type !== 'enum' || !widget[name] || spec.values.includes(widget[name])) continue;
    throw new Error(spec.error ?? `${def.type} ${name} must be ${sentenceList(spec.values)}.`);
  }
}

function validateEntity(def, widget) {
  if (def.entity !== 'required') return;
  const entity = widget.entity;
  if (typeof entity !== 'string' || !entity || !entity.startsWith(`${def.type}.`)) {
    throw new Error(`${def.type} widget needs a ${def.type} entity.`);
  }
}

function validateWidget(widget, index, config) {
  if (!isObject(widget)) throw new Error(`Widget ${index + 1} must be an object with a type.`);
  if (!knownTypes().includes(widget.type)) throw new Error(`Unsupported widget: ${widget.type}`);
  // native_card is a pseudo-type: only the size rule applies to it
  const def = getWidget(widget.type);
  if (def) {
    validateOptionEnums(def, widget);
    def.validate?.(widget, config);
    validateEntity(def, widget);
  }
  if (widget.size && !SIZES.includes(widget.size)) {
    throw new Error('Widget size must be normal, wide, tall or large.');
  }
  validateActionConfigs(widget);
}

/** Fold an alias into its widget type, then let the widget normalise its own keys. */
function normalizeWidget(widget, config) {
  const def = getWidget(widget.type);
  if (!def) return widget;
  const folded = def.type === widget.type ? widget : {...widget, type: def.type};
  return def.normalize ? (def.normalize(folded, config) ?? folded) : folded;
}

function validatePages(pages) {
  const names = Array.isArray(pages) ? pages.map((page) => page?.name) : [];
  if (
    !Array.isArray(pages) ||
    !pages.length ||
    names.some((name) => !name) ||
    new Set(names).size !== names.length
  ) {
    throw new Error('Pages need unique names.');
  }
  // `layout` was a page option once; older configs may still carry it and it is ignored
  for (const page of pages) {
    const {columns} = page;
    if (columns != null && !(Number.isInteger(columns) && columns >= 2 && columns <= 5)) {
      throw new Error('Page columns must be a whole number from 2 to 5.');
    }
  }
}

/** The widgets shape (also what `cards:` becomes). Returns the config the card keeps. */
function validateWidgetsConfig(config) {
  const {widgets} = config;
  if (!Array.isArray(widgets) || (!widgets.length && !config.cards)) {
    throw new Error('Add at least one HouseView widget.');
  }
  if (config.pages) validatePages(config.pages);
  widgets.forEach((widget, index) => validateWidget(widget, index, config));
  return {...config, widgets: widgets.map((widget) => normalizeWidget(widget, config))};
}

// ---- entry point ------------------------------------------------------------------------------------------------

/**
 * Validate and normalise a card config. Throws `Error(<message>)` for a broken config.
 * The input is never mutated and is not deep-cloned (a widget that needs no change keeps its identity).
 * @param {Object} input   what setConfig received
 * @returns {Object} the config to keep as `card._config`: `{...config, widgets}`
 */
/**
 * `home_overview: true` puts the home overview (a scrollable home screen built from the dashboard's widgets) on a page
 * of its own at the start of the carousel. Widgets that named no page belonged to the first page: they keep belonging to
 * it, so adding the overview moves nothing. The card never writes this page into the saved configuration (the editor
 * edits the raw config); it exists only in the running card.
 */
function addHomeOverview(config) {
  if (config.home_overview !== true || config.single_widget || !getWidget('home_overview')) {
    return config;
  }
  const pages = config.pages?.length ? config.pages : [{name: 'Home', surface: 'glass'}];
  let name = 'Home overview';
  while (pages.some((page) => page.name === name)) name += ' ';
  const widgets = config.widgets.map((widget) =>
    widget.page ? widget : {...widget, page: pages[0].name}
  );
  const overview = {
    type: 'home_overview',
    page: name,
    ...(config.home_title ? {title: config.home_title} : {})
  };
  return {
    ...config,
    pages: [{name, surface: pages[0].surface || 'glass'}, ...pages],
    widgets: [overview, ...widgets]
  };
}

export function validateConfig(input) {
  if (!isObject(input)) throw new Error('HouseView needs a configuration.');
  const config = input.cards ? widgetsFromCards(input) : input;
  for (const {extension} of extensions()) extension.validateConfig?.(config);
  validateOptionalSettings(config);
  if (!config.widgets) throw new Error('HouseView needs a list of cards.');
  const validated = addHomeOverview(validateWidgetsConfig(config));
  validateScreensaver(validated);
  return validated;
}
