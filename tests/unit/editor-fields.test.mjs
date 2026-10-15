import test from 'node:test';
import assert from 'node:assert/strict';
import {defs, gizmo} from './editor-widgets.mjs';

const {registerStrings} = await import('../../src/core/i18n.js');
const {
  compileWidgetSchema,
  definitionFor,
  kindOptions,
  widgetFormData,
  widgetHelper,
  widgetLabeller
} = await import('../../src/editor/fields.js');

registerStrings({
  en: {
    'light.option.action.label': 'Light tap action',
    'light.option.action.helper': 'Toggle flips the light.',
    'gizmo.option.picks.value.one': 'Number one'
  },
  de: {'light.label': 'Licht'}
});

const hass = {locale: {language: 'en'}};
const byKind = (kind) => (kind === 'gizmo' ? gizmo : defs.find((def) => def.type === kind));
const names = (schema) => schema.map((item) => item.name);
const compile = (kind, embedded = false, data = {}) =>
  compileWidgetSchema(hass, byKind(kind), {embedded, data});

test('standalone action card: fields in their usual order, native entity domains', () => {
  const schema = compile('action');
  assert.deepEqual(names(schema), [
    'widget_type',
    'entity',
    'name',
    'icon',
    'note',
    'appearance',
    'wallpaper',
    'height'
  ]);
  assert.deepEqual(schema[1].selector.entity.domain, ['scene', 'script', 'button', 'input_button']);
  assert.equal(schema[1].required, true);
  const icon = schema.find((item) => item.name === 'icon');
  assert.deepEqual(icon.selector, {icon: {}});
  assert.deepEqual(icon.context, {icon_entity: 'entity'});
  assert.deepEqual(schema.find((item) => item.name === 'height').selector.number, {
    min: 220,
    max: 800,
    step: 10,
    mode: 'box'
  });
});

test('widget_type options come from the registry in registry order with their labels', () => {
  const options = compile('light')[0].selector.select.options;
  assert.deepEqual(
    options.map((o) => o.value),
    defs.map((d) => d.type)
  );
  assert.equal(options.find((o) => o.value === 'climate').label, 'Thermostat');
  assert.equal(compile('light')[0].required, true);
  // translated label wins
  assert.equal(
    kindOptions({locale: {language: 'de'}}).find((o) => o.value === 'light').label,
    'Licht'
  );
  // an unregistered current kind is kept so the form can show it
  assert.equal(kindOptions(hass, 'mystery').at(-1).value, 'mystery');
});

test('embedded form: size instead of the standalone fields; clock has no entity, date no label', () => {
  assert.deepEqual(names(compile('light', true)), [
    'widget_type',
    'entity',
    'name',
    'size',
    'icon',
    'action'
  ]);
  assert.deepEqual(names(compile('clock', true)), ['widget_type', 'name', 'size']);
  assert.deepEqual(names(compile('date', true)), ['widget_type', 'size']);
  const sizes = compile('climate', true).find((item) => item.name === 'size').selector.select
    .options;
  assert.deepEqual(
    sizes.map((o) => o.value),
    ['normal', 'wide', 'tall', 'large']
  );
  // an icon option without an entity has nothing to preview
  const noEntity = {...byKind('clock'), options: {icon: {type: 'icon'}}};
  assert.equal(
    compileWidgetSchema(hass, noEntity, {embedded: true, data: {}}).find((i) => i.name === 'icon')
      .context,
    undefined
  );
});

test('option selectors for every OptionSpec type', () => {
  const schema = compile('gizmo', true, {});
  const get = (name) => schema.find((item) => item.name === name).selector;
  assert.deepEqual(get('level'), {number: {min: 1, max: 5, step: 1, mode: 'box'}});
  assert.deepEqual(get('peer'), {entity: {domain: ['sun']}});
  assert.deepEqual(get('picks').select.multiple, true);
  assert.equal(get('picks').select.options[0].label, 'Number one');
  assert.equal(get('picks').select.options[1].label, 'Two');
  assert.deepEqual(get('loud'), {boolean: {}});
  const light = compile('light', true).find((item) => item.name === 'action').selector.select;
  assert.deepEqual(light.options, [
    {value: 'toggle', label: 'Toggle'},
    {value: 'off', label: 'Off'}
  ]);
  assert.equal(light.mode, 'dropdown');
});

test('options with when() follow the form data', () => {
  assert.equal(names(compile('gizmo', true, {loud: false})).includes('volume'), false);
  assert.equal(names(compile('gizmo', true, {loud: true})).includes('volume'), true);
});

test('form data: size defaults per definition, toForm maps YAML quirks', () => {
  assert.equal(widgetFormData(byKind('climate'), {entity: 'climate.x'}).size, 'large');
  assert.equal(widgetFormData(byKind('light'), {entity: 'light.x'}).size, 'normal');
  assert.equal(widgetFormData(byKind('light'), {action: false}).action, 'off');
  assert.equal(widgetFormData(byKind('light'), {}).action, 'toggle');
  assert.equal(widgetFormData(byKind('light'), {action: 'off', size: 'wide'}).size, 'wide');
  // everything stored stays in the data
  assert.equal(widgetFormData(byKind('action'), {note: 'n', entity: 'script.x'}).note, 'n');
});

test('labels and helpers: widget strings, then editor.* fallbacks, never a blank', () => {
  const label = widgetLabeller(hass, byKind('light'));
  assert.equal(label({name: 'action'}), 'Light tap action');
  assert.equal(label({name: 'icon'}), 'Icon');
  assert.equal(label({name: 'widget_type'}), 'Widget type');
  assert.equal(label({name: 'name'}), 'Label');
  assert.equal(label({name: 'size'}), 'Size');
  assert.equal(label({name: 'height'}), 'Standalone height (pixels)');
  assert.equal(label({name: 'appearance'}), 'Appearance');
  assert.equal(label({name: 'nonsense'}), 'nonsense');
  assert.equal(widgetLabeller(hass, byKind('action'))({name: 'note'}), 'Caption');
  assert.equal(
    widgetLabeller(hass, byKind('climate'))({name: 'room'}),
    'Room / thermostat caption'
  );
  const helper = widgetHelper(hass, byKind('light'));
  assert.equal(helper({name: 'action'}), 'Toggle flips the light.');
  assert.equal(helper({name: 'icon'}), '');
  assert.equal(helper({name: 'entity'}), '');
  // no hass yet (the editor can be created before Home Assistant sets it)
  assert.equal(widgetLabeller(undefined, byKind('light'))({name: 'action'}), 'Light tap action');
});

test('unknown widget_type still produces a usable form', () => {
  const def = definitionFor('mystery', undefined);
  const schema = compileWidgetSchema(hass, def, {embedded: false, data: {}});
  assert.deepEqual(schema[1].selector.entity.domain, ['mystery']);
  assert.equal(names(schema)[0], 'widget_type');
});
