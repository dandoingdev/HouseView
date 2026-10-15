// Layout: span, pack, expand, presets (by layout role) and buildScreens.
import {beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {defineWidget} from '../../src/core/define-widget.js';
import {_resetRegistry, registerWidget} from '../../src/core/registry.js';
import {buildScreens, expand, pack, span} from '../../src/layout/index.js';
import {controlPages, kitchen, modular} from '../../src/layout/presets.js';

// type -> [order, extra definition fields]. Only what layout looks at: roles and default size.
const KINDS = {
  action: [10, {entity: 'custom'}],
  clock: [20, {entity: 'none', layoutRoles: ['clock']}],
  date: [30, {entity: 'none', layoutRoles: ['date']}],
  camera: [40, {layoutRoles: ['camera']}],
  climate: [50, {defaultSize: 'large', layoutRoles: ['climate']}],
  light: [60, {}],
  switch: [70, {}],
  fan: [80, {}],
  cover: [90, {}],
  lock: [100, {}],
  sensor: [110, {}],
  weather: [120, {}],
  media_player: [130, {}],
  calendar: [140, {layoutRoles: ['date']}],
  timer: [150, {layoutRoles: ['timer']}],
  alarm_control_panel: [160, {}]
};

beforeEach(() => {
  _resetRegistry();
  for (const [type, [order, extra]] of Object.entries(KINDS)) {
    registerWidget(defineWidget({type, label: type, order, render: () => '', ...extra}));
  }
});

const entry = (type, index, extra = {}) => ({widget: {type, ...extra}, index});

describe('span', () => {
  it('maps sizes to cells and clamps to the page', () => {
    assert.deepEqual(span({type: 'light'}, 3, 3), {w: 1, h: 1});
    assert.deepEqual(span({type: 'light', size: 'wide'}, 3, 3), {w: 2, h: 1});
    assert.deepEqual(span({type: 'light', size: 'tall'}, 3, 3), {w: 1, h: 2});
    assert.deepEqual(span({type: 'light', size: 'large'}, 3, 3), {w: 2, h: 2});
    assert.deepEqual(span({type: 'light', size: 'large'}, 1, 1), {w: 1, h: 1});
  });

  it('a climate is large unless it says otherwise; unknown types and native cards are normal', () => {
    assert.deepEqual(span({type: 'climate'}, 5, 5), {w: 2, h: 2});
    assert.deepEqual(span({type: 'climate', size: 'normal'}, 5, 5), {w: 1, h: 1});
    assert.deepEqual(span({type: 'native_card'}, 5, 5), {w: 1, h: 1});
    assert.deepEqual(span({type: 'vacuum'}, 5, 5), {w: 1, h: 1});
  });
});

describe('pack and expand', () => {
  it('first fit in reading order, a full page starts the next', () => {
    const entries = [0, 1, 2, 3, 4].map((i) => entry('light', i));
    const pages = pack(entries, 2, 2);
    assert.deepEqual(
      pages.map((page) => page.map((p) => [p.index, p.x, p.y])),
      [
        [
          [0, 0, 0],
          [1, 1, 0],
          [2, 0, 1],
          [3, 1, 1]
        ],
        [[4, 0, 0]]
      ]
    );
  });

  it('a wide tile skips cells it does not fit and later tiles fill the hole', () => {
    const entries = [entry('light', 0), entry('light', 1, {size: 'wide'}), entry('light', 2)];
    const [page] = pack(entries, 3, 2);
    assert.deepEqual(
      page.map((p) => [p.index, p.x, p.y, p.w, p.h]),
      [
        [0, 0, 0, 1, 1],
        [1, 1, 0, 2, 1],
        [2, 0, 1, 1, 1]
      ]
    );
  });

  it('expand grows tiles into free neighbours (right first, then down) and counts rows', () => {
    const [page] = pack([entry('light', 0), entry('light', 1)], 3, 2);
    const out = expand(page, 3);
    assert.equal(out.rows, 1);
    assert.deepEqual(
      out.placements.map((p) => [p.x, p.y, p.w, p.h]),
      [
        [0, 0, 1, 1],
        [1, 0, 2, 1]
      ]
    );
    const tall = expand(
      [
        {widget: {}, index: 0, x: 0, y: 0, w: 1, h: 1},
        {widget: {}, index: 1, x: 1, y: 0, w: 1, h: 2}
      ],
      2
    );
    assert.equal(tall.rows, 2);
    assert.deepEqual(tall.placements[0].h, 2, 'the first tile grows down into the free cell');
  });

  it('nothing to pack gives no page', () => {
    assert.deepEqual(pack([], 3, 3), []);
  });
});

describe('presets use layout roles, not type names', () => {
  const kitchenEntries = (types) => types.map((type, i) => entry(type, i));

  it('kitchen takes calendar for the date role', () => {
    const result = kitchen(kitchenEntries(['clock', 'calendar', 'camera', 'timer', 'light']), 3, 3);
    assert.deepEqual(
      result.placements.map((p) => [p.widget.type, p.x, p.y, p.w, p.h]),
      [
        ['clock', 0, 0, 1, 1],
        ['calendar', 1, 0, 2, 1],
        ['camera', 0, 1, 3, 1],
        ['timer', 0, 2, 3, 1]
      ]
    );
    assert.deepEqual(
      result.remaining.map((e) => e.widget.type),
      ['light']
    );
    assert.equal(result.rows, 3);
  });

  it('kitchen needs all four roles, 3 or 5 columns and 3 rows', () => {
    assert.equal(kitchen(kitchenEntries(['clock', 'date', 'camera']), 3, 3), null);
    assert.equal(kitchen(kitchenEntries(['clock', 'date', 'camera', 'timer']), 4, 3), null);
    assert.equal(kitchen(kitchenEntries(['clock', 'date', 'camera', 'timer']), 3, 2), null);
    assert.ok(kitchen(kitchenEntries(['clock', 'date', 'camera', 'timer']), 5, 3));
  });

  it('kitchen picks the first widget with a role, whatever its type', () => {
    const result = kitchen(kitchenEntries(['calendar', 'date', 'clock', 'camera', 'timer']), 3, 3);
    assert.equal(result.placements[1].widget.type, 'calendar');
    assert.deepEqual(
      result.remaining.map((e) => e.widget.type),
      ['date']
    );
  });

  it('modular: climate, clock, camera and three controls', () => {
    const entries = kitchenEntries([
      'light',
      'climate',
      'clock',
      'camera',
      'switch',
      'fan',
      'lock'
    ]);
    const result = modular(entries, 3, 3);
    assert.deepEqual(
      result.placements.map((p) => p.widget.type),
      ['climate', 'clock', 'camera', 'light', 'switch', 'fan']
    );
    assert.deepEqual(result.placements[0], {...entries[1], x: 0, y: 0, w: 2, h: 2});
    assert.deepEqual(
      result.remaining.map((e) => e.widget.type),
      ['lock']
    );
    assert.equal(result.rows, 3);
    assert.equal(modular(entries, 5, 2).rows, 2);
  });

  it('modular is refused for wrong sizes, too few controls, missing roles or columns', () => {
    const base = ['climate', 'clock', 'camera', 'light', 'switch', 'fan'];
    const sized = (override) =>
      base.map((type, i) => entry(type, i, override[type] ? {size: override[type]} : {}));
    assert.ok(modular(sized({}), 3, 3));
    assert.equal(modular(sized({climate: 'wide'}), 3, 3), null);
    assert.equal(modular(sized({clock: 'wide'}), 3, 3), null);
    assert.equal(modular(sized({fan: 'tall'}), 3, 3), null);
    assert.equal(modular(kitchenEntries(base.slice(0, 5)), 3, 3), null);
    assert.equal(modular(kitchenEntries(base.filter((t) => t !== 'camera')), 3, 3), null);
    assert.equal(modular(sized({}), 4, 3), null);
    assert.equal(modular(sized({}), 3, 2), null);
    assert.ok(modular(sized({}), 5, 2));
  });

  it('controlPages stretches the last row', () => {
    const entries = [0, 1, 2, 3, 4].map((i) => entry('light', i));
    const [page] = controlPages(entries, 3, 2);
    assert.equal(page.rows, 2);
    assert.deepEqual(
      page.placements.map((p) => [p.x, p.y, p.w]),
      [
        [0, 0, 1],
        [1, 0, 1],
        [2, 0, 1],
        [0, 1, 2],
        [2, 1, 1]
      ]
    );
  });
});

describe('buildScreens', () => {
  it('names screens "Page", "Page · 2" and builds keys', () => {
    const widgets = Array.from({length: 5}, () => ({type: 'light'}));
    const screens = buildScreens(widgets, [{name: 'Home', surface: 'teal', layout: 'grid'}], 2, 2);
    assert.deepEqual(
      screens.map((s) => [s.key, s.label]),
      [
        ['Home:0', 'Home'],
        ['Home:1', 'Home · 2']
      ]
    );
    assert.equal(screens[0].surface, 'teal');
    assert.equal(screens[0].layout, 'grid');
  });

  it('defaults to one page called Home, and adds pages that widgets name', () => {
    const screens = buildScreens(
      [{type: 'clock'}, {type: 'clock', page: 'Ghost'}],
      undefined,
      3,
      3
    );
    assert.deepEqual(
      screens.map((s) => s.label),
      ['Home', 'Ghost']
    );
    assert.deepEqual(
      screens.map((s) => s.surface),
      ['glass', 'glass']
    );
  });

  it('skips pages without widgets and returns nothing for no widgets', () => {
    assert.deepEqual(buildScreens([], undefined, 3, 3), []);
    assert.deepEqual(
      buildScreens([{type: 'clock', page: 'B'}], [{name: 'A'}, {name: 'B'}], 3, 3).map(
        (s) => s.label
      ),
      ['B']
    );
  });

  it('widgets without a page go to the first page', () => {
    const screens = buildScreens([{type: 'clock'}], [{name: 'First'}, {name: 'Second'}], 3, 3);
    assert.equal(screens[0].label, 'First');
  });
});
