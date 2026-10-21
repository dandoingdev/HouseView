import test from 'node:test';
import assert from 'node:assert/strict';
import {registerOverview} from '../../src/core/overview-registry.js';
import {registerStrings} from '../../src/core/i18n.js';
import screensaverStrings from '../../src/core/screensaver-strings.js';
import {
  screensaverData,
  screensaverSchema,
  screensaverLabels,
  applyScreensaver,
  extraEntries
} from '../../src/editor/screensaver-form.js';
import {demo} from './_demo-overview.mjs';

try {
  registerOverview(demo);
} catch {
  /* already registered by another test file in the same process */
}
registerStrings(screensaverStrings);
registerStrings({
  en: {
    'demo_overview.option.level.label': 'Level',
    'demo_overview.option.level.helper': 'How much.',
    'demo_overview.option.mode.value.a': 'Alpha',
    'demo_overview.option.mode.value.b': 'Beta'
  }
});
const hass = {locale: {language: 'en'}};
const names = (schema) => schema.map((field) => field.name);

test('schema: type and the return timeout until one is chosen, then framework fields, options, advanced fields', () => {
  assert.deepEqual(names(screensaverSchema(hass, {})), ['type', 'return_timeout']);
  const schema = screensaverSchema(hass, {type: 'demo'});
  assert.deepEqual(names(schema), [
    'type',
    'return_timeout',
    'enabled',
    'entity',
    'idle_timeout',
    'flag',
    'level',
    'mode',
    'kind',
    'picks',
    'peer',
    'note',
    'start_in_edit_mode'
  ]);
  const entity = schema.find((f) => f.name === 'entity');
  assert.deepEqual(entity.selector.entity.domain, ['sensor', 'weather']);
  assert.equal(entity.required, true);
  assert.equal(schema.find((f) => f.name === 'peer').selector.entity.domain[0], 'sun');
  assert.equal(schema.find((f) => f.name === 'picks').selector.select.multiple, true);
  assert.deepEqual(
    screensaverSchema(hass, {})
      .at(0)
      .selector.select.options.map((o) => o.value),
    ['', 'demo']
  );
});

test('selectors follow the option types', () => {
  const schema = screensaverSchema(hass, {type: 'demo'});
  const selector = (name) => schema.find((f) => f.name === name).selector;
  assert.deepEqual(selector('flag'), {boolean: {}});
  assert.deepEqual(selector('level'), {number: {min: 1, max: 5, step: undefined, mode: 'box'}});
  assert.deepEqual(selector('note'), {text: {}});
  assert.deepEqual(selector('mode').select.options, [
    {value: 'a', label: 'Alpha'},
    {value: 'b', label: 'Beta'}
  ]);
  assert.equal(selector('mode').select.mode, 'dropdown');
  assert.equal(selector('idle_timeout').number.max, 86400);
  assert.equal(
    schema.find((f) => f.name === 'type').selector.select.options[0].label,
    'No screensaver'
  );
});

test('labels: framework keys from screensaver.*, options from <type>_overview.option.*', () => {
  const {computeLabel, computeHelper} = screensaverLabels(hass, 'demo');
  assert.equal(computeLabel({name: 'idle_timeout'}), 'Start after (seconds without a touch)');
  assert.equal(computeLabel({name: 'return_timeout'}), 'Return to the first page (seconds)');
  assert.match(computeHelper({name: 'return_timeout'}), /first page/);
  assert.equal(computeLabel({name: 'level'}), 'Level');
  assert.equal(computeHelper({name: 'level'}), 'How much.');
  assert.equal(computeLabel({name: 'flag'}), 'flag'); // no string yet: falls back to the key, never throws
  assert.equal(computeHelper({name: 'flag'}), '');
  assert.equal(screensaverLabels(hass, undefined).computeLabel({name: 'x'}), 'x'); // no type chosen yet
});

test('round trip keeps YAML minimal and preserves other entries', () => {
  const config = {pages: [], screensaver: {type: 'demo', entity: 'sensor.x'}};
  assert.deepEqual(screensaverData(config), {
    enabled: true,
    type: 'demo',
    entity: 'sensor.x',
    return_timeout: 120
  });
  assert.deepEqual(screensaverData({}), {return_timeout: 120});
  assert.equal(screensaverData({return_timeout: 45}).return_timeout, 45);
  assert.deepEqual(
    applyScreensaver(config, {enabled: true, type: 'demo', entity: 'sensor.x', idle_timeout: 60}),
    {pages: [], screensaver: {type: 'demo', entity: 'sensor.x', idle_timeout: 60}}
  );
  assert.equal(
    applyScreensaver(config, {enabled: false, type: 'demo', entity: 'sensor.x'}).screensaver
      .enabled,
    false
  );
  assert.deepEqual(applyScreensaver(config, {type: ''}), {pages: []});
  assert.deepEqual(
    applyScreensaver(config, {type: 'demo', entity: 'sensor.x', return_timeout: 45}),
    {pages: [], screensaver: {type: 'demo', entity: 'sensor.x'}, return_timeout: 45}
  );
  assert.deepEqual(
    applyScreensaver(
      {pages: [], return_timeout: 45, screensaver: {type: 'demo', entity: 'sensor.x'}},
      {type: '', return_timeout: 120}
    ),
    {pages: []}
  );
  assert.deepEqual(applyScreensaver({pages: []}, {type: '', return_timeout: 0}), {
    pages: [],
    return_timeout: 0
  });
  assert.deepEqual(applyScreensaver({}, {type: 'demo', entity: '', note: undefined}), {
    screensaver: {type: 'demo'}
  });
  const list = {
    screensaver: [
      {type: 'demo', entity: 'sensor.a'},
      {type: 'demo', entity: 'sensor.b'},
      {type: 'demo', entity: 'sensor.c'}
    ]
  };
  assert.equal(extraEntries(list), 2);
  assert.equal(extraEntries(config), 0);
  assert.equal(extraEntries({}), 0);
  assert.equal(applyScreensaver(list, {type: 'demo', entity: 'sensor.z'}).screensaver.length, 3);
  assert.equal(applyScreensaver(list, {type: ''}).screensaver.length, 2);
  assert.equal(
    applyScreensaver({screensaver: [list.screensaver[0], list.screensaver[1]]}, {type: ''})
      .screensaver.entity,
    'sensor.b'
  );
});

test('a form round trip does not mutate its input', () => {
  const config = Object.freeze({screensaver: Object.freeze({type: 'demo', entity: 'sensor.x'})});
  assert.doesNotThrow(() => applyScreensaver(config, {type: 'demo', entity: 'sensor.y'}));
  assert.equal(config.screensaver.entity, 'sensor.x');
});

test('automatic displays are not offered in the screensaver list, but one written in YAML stays visible', async () => {
  // load the real overviews into the registry (this file may run in a process that only registered the demo)
  await import('../../src/overviews/index.js');
  const values = (data) =>
    screensaverSchema({}, data)[0].selector.select.options.map((option) => option.value);
  const offered = values({});
  assert.deepEqual(
    offered.filter((type) => type && type !== 'demo').sort(), // '' is Off; demo is this file's own
    ['clock', 'home', 'photo_frame', 'weather'],
    'the editor offers Clock, Photo frame, Weather and Home summary only'
  );
  assert.ok(
    values({type: 'calendar_month'}).includes('calendar_month'),
    'a configured month calendar is still shown'
  );
  assert.ok(
    values({type: 'timer'}).includes('timer'),
    'a configured automatic display is still shown'
  );
});

// Clock uses the same native selector in both the screensaver and standalone widget editor.
test('clock native colour selectors preserve old hex overrides and round-trip RGB without losing inheritance', async () => {
  const {default: clock} = await import('../../src/overviews/clock/index.js');
  const {compileWidgetSchema, widgetFormData} = await import('../../src/editor/fields.js');
  // Importing the widget editor registers the built-in overviews.
  const config = {screensaver: {type: 'clock', background_color: '#abc'}};
  const data = screensaverData(config);
  assert.deepEqual(data.background_color, [170, 187, 204]);
  assert.deepEqual(data.second_color, [185, 237, 199]);
  assert.equal(data.use_dashboard_background, false);
  assert.equal(screensaverData({screensaver: {type: 'clock'}}).use_dashboard_background, true);
  const schema = screensaverSchema(hass, data);
  assert.deepEqual(schema.find((f) => f.name === 'background_color').selector, {color_rgb: {}});
  const updated = applyScreensaver(config, {...data, use_dashboard_background: true});
  assert.equal(
    screensaverSchema(hass, screensaverData(updated)).some((f) => f.name === 'background_color'),
    false
  );
  assert.deepEqual(updated.screensaver.background_color, [170, 187, 204]);
  const form = widgetFormData(clock.widget, {background_color: '#abc'});
  assert.equal(form.use_dashboard_background, false);
  assert.deepEqual(form.background_color, [170, 187, 204]);
  assert.deepEqual(
    compileWidgetSchema(hass, clock.widget, {embedded: true, data: form}).find(
      (f) => f.name === 'background_color'
    ).selector,
    {color_rgb: {}}
  );
});
