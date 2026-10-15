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

test('schema: type only until one is chosen, then framework fields, options, advanced fields', () => {
  assert.deepEqual(names(screensaverSchema(hass, {})), ['type']);
  const schema = screensaverSchema(hass, {type: 'demo'});
  assert.deepEqual(names(schema), [
    'type',
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
    'preview',
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
  assert.equal(computeLabel({name: 'level'}), 'Level');
  assert.equal(computeHelper({name: 'level'}), 'How much.');
  assert.equal(computeLabel({name: 'flag'}), 'flag'); // no string yet: falls back to the key, never throws
  assert.equal(computeHelper({name: 'flag'}), '');
  assert.equal(computeHelper({name: 'preview'}).includes('5 seconds'), true);
  assert.equal(screensaverLabels(hass, undefined).computeLabel({name: 'x'}), 'x'); // no type chosen yet
});

test('round trip keeps YAML minimal and preserves other entries', () => {
  const config = {pages: [], screensaver: {type: 'demo', entity: 'sensor.x'}};
  assert.deepEqual(screensaverData(config), {enabled: true, type: 'demo', entity: 'sensor.x'});
  assert.deepEqual(screensaverData({}), {});
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
