import test from 'node:test';
import assert from 'node:assert/strict';
import './editor-env.mjs';

import './editor-widgets.mjs';
const {registerOverview} = await import('../../src/core/overview-registry.js');
const {registerStrings} = await import('../../src/core/i18n.js');
const {
  editorConfig,
  cardsOfPage,
  appearanceData,
  appearanceSchema,
  appearanceHelper,
  pageData,
  pageSchema
} = await import('../../src/editor/carousel-editor.js');
const {kindFromType} = await import('../../src/editor/widget-editor.js');
const {default: strings} = await import('../../src/editor/strings.js');
const screensaver = await import('../../src/editor/screensaver-form.js');

test('editorConfig: widgets become cards, a default page appears, input is not mutated', () => {
  const input = {
    type: 'custom:houseview-card',
    widgets: [{type: 'clock'}, {type: 'scene', entity: 'scene.a'}]
  };
  const frozen = JSON.stringify(input);
  const config = editorConfig(input);
  assert.equal(JSON.stringify(input), frozen);
  assert.equal(config.widgets, undefined);
  assert.deepEqual(
    config.cards.map((c) => c.widget_type),
    ['clock', 'action']
  );
  assert.deepEqual(config.pages, [{name: 'Home', surface: 'glass'}]);
});

test('editorConfig: pages named by cards are added; existing pages keep their settings', () => {
  const config = editorConfig({
    pages: [{name: 'Main', surface: 'teal', columns: 4}],
    cards: [
      {type: 'custom:houseview-clock-card', page: 'Main'},
      {type: 'custom:houseview-light-card', entity: 'light.a', page: 'Upstairs'},
      {type: 'entities', entities: [], view_layout: {houseview_page: 'Garden'}}
    ]
  });
  assert.deepEqual(
    config.pages.map((p) => p.name),
    ['Main', 'Upstairs', 'Garden']
  );
  assert.deepEqual(config.pages[0], {name: 'Main', surface: 'teal', columns: 4});
  assert.deepEqual(config.pages[1], {name: 'Upstairs', surface: 'glass'});
});

test('editorConfig: a config without cards or widgets gets an empty list of cards', () => {
  const config = editorConfig({wallpaper: 'teal'});
  assert.equal(config.wallpaper, 'teal');
  assert.deepEqual(config.cards, []);
});

test('editorConfig is stable: normalising its own output changes nothing (HA echoes the config back)', () => {
  const once = editorConfig({widgets: [{type: 'clock'}]});
  assert.equal(JSON.stringify(editorConfig(once)), JSON.stringify(once));
});

test('cards belong to the page they name, cards without a page to the first page', () => {
  const config = editorConfig({
    pages: [{name: 'A'}, {name: 'B'}],
    cards: [
      {type: 'custom:houseview-clock-card'},
      {type: 'custom:houseview-light-card', page: 'B'},
      {type: 'custom:houseview-lock-card', page: 'A'}
    ]
  });
  assert.deepEqual(
    cardsOfPage(config, config.pages[0]).map((c) => c.type),
    ['custom:houseview-clock-card', 'custom:houseview-lock-card']
  );
  assert.equal(cardsOfPage(config, config.pages[1]).length, 1);
});

test('form data defaults', () => {
  assert.deepEqual(appearanceData({}), {
    appearance: 'auto',
    wallpaper: 'page',
    palette: 'stone',
    bedtime: undefined,
    high_contrast: undefined,
    performance: 'auto',
    editor_preview: 'landscape'
  });
  assert.equal(appearanceData({performance: 'lite'}).performance, 'lite');
  assert.equal(appearanceData({wallpaper: 'silver', bedtime: false}).wallpaper, 'silver');
  assert.equal(appearanceData({bedtime: false}).bedtime, false);
  assert.deepEqual(pageData({name: 'x'}), {surface: 'glass', columns: undefined});
});

test('the page form has a surface and landscape columns, and no layout', () => {
  const schema = pageSchema({localize: () => ''});
  assert.deepEqual(
    schema.map((item) => item.name),
    ['surface', 'columns']
  );
  assert.deepEqual(schema[1].selector, {number: {min: 2, max: 5, step: 1, mode: 'box'}});
  assert.equal(
    strings.en['editor.helper.columns'],
    'Maximum columns on a wide landscape screen, 2 to 5. Phones and portrait tablets always use 2.'
  );
  assert.equal(strings.en['editor.layout'], undefined);
  assert.deepEqual(Object.keys(pageData({name: 'x', layout: 'kitchen', surface: 'teal'})), [
    'surface',
    'columns'
  ]);
});

test('widget kind from the card type: registered tag, per-kind tag, generic card', () => {
  assert.equal(kindFromType('custom:houseview-light-card'), 'light');
  assert.equal(kindFromType('custom:houseview-widget-card'), null);
  assert.equal(kindFromType('custom:houseview-unregistered-card'), 'unregistered');
  assert.equal(kindFromType(undefined), null);
});

test('screensaver section: shown for a registered overview, round trips through the form helpers', () => {
  registerStrings(strings);
  registerOverview({
    type: 'demo',
    label: 'Demo',
    order: 990,
    entity: 'required',
    domains: ['weather'],
    options: {flag: {type: 'boolean'}}
  });
  const config = {screensaver: {type: 'demo', entity: 'weather.home'}};
  const data = screensaver.screensaverData(config);
  assert.equal(data.type, 'demo');
  const applied = screensaver.applyScreensaver(config, {...data, flag: true});
  assert.deepEqual(applied.screensaver, {type: 'demo', entity: 'weather.home', flag: true});
});

test('kindFromType finds a kind by its element tag when the engine supports `tag`', async (t) => {
  const {defineWidget} = await import('../../src/core/define-widget.js').catch(() => ({}));
  const {registerWidget} = await import('../../src/core/registry.js');
  let def;
  try {
    def = defineWidget?.({
      type: 'tagged_overview',
      label: 'Tagged',
      order: 215,
      tag: 'houseview-tagged-overview-card',
      render: () => '<div data-widget="0"></div>'
    });
  } catch {
    /* the engine does not know the `tag` field yet */
  }
  if (!def?.tag) return t.skip('define-widget.js does not accept `tag` yet');
  registerWidget(def);
  assert.equal(kindFromType('custom:houseview-tagged-overview-card'), 'tagged_overview');
});

test('the appearance form has a performance select with helper text', () => {
  const hass = {};
  const field = appearanceSchema(hass).find((item) => item.name === 'performance');
  assert.ok(field, 'a performance field');
  assert.deepEqual(
    field.selector.select.options.map((option) => option.value),
    ['auto', 'full', 'lite']
  );
  assert.equal(field.selector.select.mode, 'dropdown', 'a native ha-form select');
  assert.deepEqual(
    field.selector.select.options.map((option) => option.label),
    ['Automatic', 'Full', 'Lite (no blur, no animation)']
  );
  const helper = appearanceHelper(hass);
  assert.match(helper({name: 'performance'}), /2 GB|memory/);
  assert.match(helper({name: 'performance'}), /Lite/);
  assert.equal(helper({name: 'palette'}), undefined, 'no helper for the other fields');
  assert.equal(strings.en['editor.performance'], 'Performance');
});
