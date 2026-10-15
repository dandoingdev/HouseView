// Layout: span, pack, expand, controlPages and buildScreens (the one page layout).
import {beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {defineWidget} from '../../src/core/define-widget.js';
import {_resetRegistry, registerWidget} from '../../src/core/registry.js';
import {
  buildScreens,
  controlPages,
  expand,
  pack,
  pageColumns,
  span
} from '../../src/layout/index.js';

// type -> [order, extra definition fields]. Only what layout looks at: the default size.
const KINDS = {
  action: [10, {entity: 'custom'}],
  clock: [20, {entity: 'none'}],
  date: [30, {entity: 'none'}],
  camera: [40, {}],
  climate: [50, {defaultSize: 'large'}],
  light: [60, {}],
  switch: [70, {}],
  fan: [80, {}],
  cover: [90, {}],
  lock: [100, {}],
  sensor: [110, {}],
  weather: [120, {}],
  media_player: [130, {}],
  calendar: [140, {}],
  timer: [150, {}],
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

describe('controlPages', () => {
  it('stretches the last row', () => {
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

  it('shares the last row evenly, whatever its length', () => {
    const lights = (n) => Array.from({length: n}, (_, i) => entry('light', i));
    const lastRow = (n, columns) =>
      controlPages(lights(n), columns, 3)[0]
        .placements.filter((p) => p.y === Math.ceil(n / columns) - 1)
        .map((p) => [p.x, p.w]);
    assert.deepEqual(lastRow(7, 3), [[0, 3]]);
    assert.deepEqual(lastRow(8, 4), [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1]
    ]);
    assert.deepEqual(lastRow(6, 5), [[0, 5]]);
    assert.deepEqual(lastRow(5, 4), [[0, 4]]);
    assert.deepEqual(lastRow(2, 5), [
      [0, 3],
      [3, 2]
    ]);
  });

  it('starts a new page after columns x rows tiles', () => {
    const entries = Array.from({length: 13}, (_, i) => entry('light', i));
    const pages = controlPages(entries, 3, 4);
    assert.deepEqual(
      pages.map((page) => [page.placements.length, page.rows, page.columns]),
      [
        [12, 4, 3],
        [1, 1, 3]
      ]
    );
  });
});

describe('buildScreens', () => {
  it('names screens "Page", "Page · 2" and builds keys', () => {
    const widgets = Array.from({length: 5}, () => ({type: 'light'}));
    const screens = buildScreens(widgets, [{name: 'Home', surface: 'teal'}], 2, 2);
    assert.deepEqual(
      screens.map((s) => [s.key, s.label]),
      [
        ['Home:0', 'Home'],
        ['Home:1', 'Home · 2']
      ]
    );
    assert.equal(screens[0].surface, 'teal');
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

  it('ignores a leftover `layout` key on a page', () => {
    const widgets = Array.from({length: 7}, () => ({type: 'light'}));
    const plain = buildScreens(widgets, [{name: 'Home'}], 5, 4);
    for (const layout of ['auto', 'grid', 'controls', 'modular', 'kitchen', 'nonsense']) {
      const screens = buildScreens(widgets, [{name: 'Home', layout}], 5, 4);
      assert.deepEqual(screens, plain);
      assert.equal('layout' in screens[0], false);
    }
  });

  it('all-normal pages are balanced into rows with the last row stretched', () => {
    const widgets = Array.from({length: 5}, () => ({type: 'light'}));
    const [screen] = buildScreens(widgets, [{name: 'Home'}], 5, 4);
    assert.equal(screen.columns, 3);
    assert.equal(screen.rows, 2);
    assert.deepEqual(
      screen.placements.map((p) => [p.x, p.y, p.w, p.h]),
      [
        [0, 0, 1, 1],
        [1, 0, 1, 1],
        [2, 0, 1, 1],
        [0, 1, 2, 1],
        [2, 1, 1, 1]
      ]
    );
  });

  it('an unsized climate is one cell while nothing on the page has a size', () => {
    const [screen] = buildScreens([{type: 'climate'}, {type: 'light'}], [{name: 'Home'}], 5, 4);
    assert.deepEqual(
      screen.placements.map((p) => [p.w, p.h]),
      [
        [2, 1],
        [1, 1]
      ]
    );
  });

  it('a page with a size is packed first-fit, then grown into free cells', () => {
    const widgets = [
      {type: 'camera', size: 'large'},
      {type: 'clock'},
      {type: 'date', size: 'tall'},
      {type: 'timer', size: 'wide'}
    ];
    const [screen] = buildScreens(widgets, [{name: 'Kitchen', columns: 4}], 5, 4);
    assert.equal(screen.columns, 4);
    assert.equal(screen.rows, 3);
    assert.deepEqual(
      screen.placements.map((p) => [p.widget.type, p.x, p.y, p.w, p.h]),
      [
        ['camera', 0, 0, 2, 2],
        ['clock', 2, 0, 1, 3],
        ['date', 3, 0, 1, 3],
        ['timer', 0, 2, 2, 1]
      ]
    );
  });

  it('an unsized climate is large once another widget on the page has a size', () => {
    const [screen] = buildScreens(
      [{type: 'climate'}, {type: 'light'}, {type: 'light', size: 'wide'}],
      [{name: 'Home'}],
      5,
      4
    );
    assert.deepEqual([screen.placements[0].w, screen.placements[0].h], [2, 2]);
  });

  it('overflow continues on numbered pages, for both paths', () => {
    const normal = Array.from({length: 7}, () => ({type: 'light'}));
    assert.deepEqual(
      buildScreens(normal, [{name: 'Home'}], 2, 2).map((s) => [s.label, s.placements.length]),
      [
        ['Home', 4],
        ['Home · 2', 3]
      ]
    );
    const sized = [{type: 'light', size: 'large'}, {type: 'light', size: 'large'}, {type: 'light'}];
    assert.deepEqual(
      buildScreens(sized, [{name: 'Home'}], 2, 2).map((s) => s.label),
      ['Home', 'Home · 2', 'Home · 3']
    );
  });
});

describe('pageColumns', () => {
  it('phones and portrait tablets get 2 columns, whatever the page asks', () => {
    assert.equal(pageColumns({columns: 5}, 2), 2);
    assert.equal(pageColumns({columns: 5}, 3), 2);
    assert.equal(pageColumns({}, 3), 2);
  });

  it('a wide landscape screen gets 3, or the page columns from 2 to 5', () => {
    assert.equal(pageColumns({}, 5), 3);
    for (const columns of [2, 3, 4, 5]) assert.equal(pageColumns({columns}, 5), columns);
    for (const columns of [1, 6, 2.5, '4', null]) assert.equal(pageColumns({columns}, 5), 3);
  });

  it('buildScreens uses it for every page', () => {
    const widgets = Array.from({length: 4}, () => ({type: 'light'}));
    const at = (width, definition) => buildScreens(widgets, [definition], width, 4)[0].columns;
    assert.equal(at(5, {name: 'A'}), 3);
    assert.equal(at(5, {name: 'A', columns: 4}), 4);
    assert.equal(at(3, {name: 'A', columns: 4}), 2);
    assert.equal(at(2, {name: 'A'}), 2);
  });
});

describe('every screen fits its grid', () => {
  // A small deterministic generator: the same widgets every run.
  const random = (() => {
    let state = 12345;
    return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  })();
  const SIZES = [undefined, 'normal', 'wide', 'tall', 'large'];
  const TYPES = ['light', 'climate', 'clock', 'camera', 'timer', 'media_player'];

  it('stays inside the columns, never overlaps and keeps every widget exactly once', () => {
    for (let round = 0; round < 300; round++) {
      const count = 1 + Math.floor(random() * 14);
      const allNormal = random() < 0.3;
      const widgets = Array.from({length: count}, () => ({
        type: TYPES[Math.floor(random() * TYPES.length)],
        ...(allNormal ? {} : {size: SIZES[Math.floor(random() * SIZES.length)]})
      }));
      const columns = [2, 3, 5][Math.floor(random() * 3)];
      const maxRows = 2 + Math.floor(random() * 4);
      const definition = {name: 'P', columns: 2 + Math.floor(random() * 5)};
      const screens = buildScreens(widgets, [definition], columns, maxRows);
      const seen = [];
      for (const screen of screens) {
        assert.ok(screen.columns >= 1 && screen.columns <= columns, 'columns within the offer');
        assert.ok(screen.rows >= 1 && screen.rows <= maxRows, 'rows within the offer');
        const taken = new Set();
        for (const p of screen.placements) {
          assert.ok(p.x >= 0 && p.y >= 0 && p.w >= 1 && p.h >= 1);
          assert.ok(p.x + p.w <= screen.columns, 'inside the columns');
          assert.ok(p.y + p.h <= screen.rows, 'inside the rows');
          for (let y = p.y; y < p.y + p.h; y++) {
            for (let x = p.x; x < p.x + p.w; x++) {
              assert.ok(!taken.has(`${x},${y}`), 'no overlap');
              taken.add(`${x},${y}`);
            }
          }
          seen.push(p.index);
        }
        assert.equal(taken.size, screen.columns * screen.rows, 'no holes: every cell is used');
      }
      assert.deepEqual(
        seen.sort((a, b) => a - b),
        widgets.map((_, i) => i)
      );
    }
  });
});
