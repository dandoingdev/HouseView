// Compiles a widget definition (docs/widget-api.md: entity policy, domains, `options`, `editor`) into the
// ha-form schema, labels, helpers and data of the widget editor. The editor holds no widget kind names.
//
// Field order (the original order, which the browser suite's selectors do not depend on but users do):
//   widget_type, entity, name, size (embedded only), the widget's own options in definition order,
//   appearance, wallpaper, height (standalone only).
import {widgetList} from '../core/registry.js';
import {capitalise, field, select, text, textField, textOrNone} from './form.js';

export const SIZES = ['normal', 'wide', 'tall', 'large'];
const APPEARANCES = ['auto', 'light', 'dark'];
const STANDALONE_WALLPAPERS = ['teal', 'silver', 'champagne'];

/** Fields every widget form has, whatever the kind; everything else comes from `options`. */
const FRAMEWORK_FIELDS = [
  'widget_type',
  'entity',
  'name',
  'size',
  'appearance',
  'wallpaper',
  'height'
];

/** Stand-in for a widget_type nobody registered, so the form still opens (the user can pick a real one). */
function unknownDefinition(kind) {
  return {
    type: kind,
    label: kind,
    entity: 'required',
    domains: [kind],
    defaultSize: 'normal',
    options: {},
    editor: {name: true}
  };
}

export const definitionFor = (kind, definition) => definition || unknownDefinition(kind);

/** Display name of a widget kind: the translated `<type>.label`, else the definition's English label. */
export const kindLabel = (hass, def) => text(hass, `${def.type}.label`, def.label);

/** Entity domains offered by the entity picker. */
export function entityDomains(def) {
  if (def.domains?.length) return [...def.domains];
  return def.entity === 'none' ? [] : [def.type];
}

/** The `widget_type` options, in registry order; `current` is appended when nothing registered matches it. */
export function kindOptions(hass, current) {
  const options = widgetList().map((def) => ({value: def.type, label: kindLabel(hass, def)}));
  if (current && !options.some((option) => option.value === current)) {
    options.push({value: current, label: current});
  }
  return options;
}

/** Selector for one option spec (docs/widget-api.md plus the overview types `entity` and `enum_list`). */
export function optionSelector(hass, def, key, spec) {
  const valueLabel = (value) =>
    text(hass, `${def.type}.option.${key}.value.${value}`, capitalise(value));
  switch (spec.type) {
    case 'boolean':
      return {boolean: {}};
    case 'number':
      return {
        number: Object.fromEntries(
          Object.entries({min: spec.min, max: spec.max, step: spec.step, mode: 'box'}).filter(
            ([, value]) => value !== undefined
          )
        )
      };
    case 'icon':
      return {icon: {}};
    case 'entity':
      return {entity: {domain: [...(spec.domains || [])]}};
    case 'enum':
      return select(hass, spec.values || [], valueLabel);
    case 'enum_list': {
      const {options} = select(hass, spec.values || [], valueLabel).select;
      return {select: {multiple: true, mode: 'list', options}};
    }
    case 'text':
    default:
      return {text: {}};
  }
}

function optionField(hass, def, key, spec) {
  const item = field(key, optionSelector(hass, def, key, spec));
  // The icon picker previews the entity's default icon when told which form field holds the entity.
  if (spec.type === 'icon' && def.entity !== 'none') item.context = {icon_entity: 'entity'};
  return item;
}

/**
 * ha-form schema for one widget.
 * @param {any} hass
 * @param {Object} def        a widget definition (or the stand-in from definitionFor)
 * @param {{embedded:boolean, data:Object}} view  `embedded`: inside the carousel editor (size field, no standalone
 *        fields); `data`: the current form data, for options whose `when(widget)` depends on other values
 */
export function compileWidgetSchema(hass, def, {embedded, data}) {
  const schema = [field('widget_type', kindSelector(hass, def), true)];
  if (def.entity !== 'none')
    schema.push(field('entity', {entity: {domain: entityDomains(def)}}, true));
  if (def.editor?.name !== false) schema.push(textField('name'));
  if (embedded) schema.push(field('size', select(hass, SIZES)));
  for (const [key, spec] of Object.entries(def.options || {})) {
    if (spec.when && !spec.when(data)) continue;
    schema.push(optionField(hass, def, key, spec));
  }
  if (!embedded) {
    schema.push(
      field('appearance', select(hass, APPEARANCES)),
      field('wallpaper', select(hass, STANDALONE_WALLPAPERS)),
      field('height', {number: {min: 220, max: 800, step: 10, mode: 'box'}})
    );
  }
  return schema;
}

function kindSelector(hass, def) {
  return {select: {options: kindOptions(hass, def.type), mode: 'dropdown'}};
}

/** Stored widget config -> ha-form data: defaults the size and lets the definition map stored values. */
export function widgetFormData(def, config) {
  return {
    ...config,
    size: config.size || def.defaultSize || 'normal',
    ...def.editor?.toForm?.(config)
  };
}

/** `computeLabel` for a widget form. */
export function widgetLabeller(hass, def) {
  return ({name}) => {
    // Widget label first (icon/text options fall back to the shared `editor.<name>`), then the field name.
    const own = FRAMEWORK_FIELDS.includes(name)
      ? undefined
      : textOrNone(hass, `${def.type}.option.${name}.label`);
    return own ?? text(hass, `editor.${name}`, name);
  };
}

/** `computeHelper` for a widget form: only options have helper text (`<type>.option.<name>.helper`). */
export function widgetHelper(hass, def) {
  return ({name}) =>
    FRAMEWORK_FIELDS.includes(name)
      ? ''
      : (textOrNone(hass, `${def.type}.option.${name}.helper`) ?? '');
}
