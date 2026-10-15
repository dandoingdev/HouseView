// The layout pass (src/controller/screen-model.js `_layout`): it reads before it writes, and a pass whose inputs equal
// the previous pass's writes nothing. The resize observer fires after our own height change, a stylesheet arriving
// and window resizes all call it, and every write wakes the browser's style and layout machinery on a weak tablet.
import {afterEach, beforeEach, describe, it, mock} from 'node:test';
import assert from 'node:assert/strict';
import {FakeNode, fakeHass, installBrowserGlobals, registerStandIns} from './controller-env.mjs';
import {_resetRegistry} from '../../src/core/registry.js';
import {_resetStrings} from '../../src/core/i18n.js';

installBrowserGlobals();
const {HouseViewCard} = await import('../../src/controller/houseview-card.js');

beforeEach(() => {
  _resetRegistry();
  _resetStrings();
  registerStandIns();
});
afterEach(() => mock.restoreAll());

/** A card with a rendered-looking shell: face with one tile, shell, nav. Every style write is counted. */
function laidOutCard() {
  const card = new HouseViewCard();
  card._hass = fakeHass({'light.a': {state: 'on', attributes: {friendly_name: 'A'}}});
  card._config = {widgets: [{type: 'light', entity: 'light.a'}], pages: [{name: 'Home'}]};
  const writes = {face: [], shell: [], tile: [], nav: 0, dials: 0, surfaceClass: 0};
  const track = (node, key) => {
    const set = node.style.setProperty;
    node.style.setProperty = (name, value) => {
      writes[key].push(`${name}=${value}`);
      set(name, value);
    };
    let height = '';
    Object.defineProperty(node.style, 'height', {
      get: () => height,
      set: (value) => {
        height = value;
        writes[key].push(`height=${value}`);
      }
    });
  };
  const face = new FakeNode('div');
  const shell = new FakeNode('ha-card');
  const tile = new FakeNode('button');
  const nav = new FakeNode('nav');
  for (const [node, key] of [
    [face, 'face'],
    [shell, 'shell']
  ]) {
    track(node, key);
  }
  let gridColumn = '';
  Object.defineProperty(tile.style, 'gridColumn', {
    get: () => gridColumn,
    set: (value) => {
      gridColumn = value;
      writes.tile.push(`gridColumn=${value}`);
    }
  });
  Object.defineProperty(nav, 'innerHTML', {
    get: () => '',
    set: () => {
      writes.nav++;
    }
  });
  face.querySelector = () => tile;
  face.querySelectorAll = () => [];
  const classes = shell.classList;
  shell.classList = {
    ...classes,
    add: (name) => {
      writes.surfaceClass++;
      classes.add(name);
    },
    remove: (name) => {
      writes.surfaceClass++;
      classes.remove(name);
    }
  };
  const root = card.shadowRoot;
  root.selectors.set('.face', face);
  root.selectors.set('.shell', shell);
  root.selectors.set('.page-nav', nav);
  card._renderedIndices = '0';
  return {card, writes, face, shell};
}

const total = (writes) =>
  writes.face.length + writes.shell.length + writes.tile.length + writes.nav;

describe('the layout pass', () => {
  it('writes the grid, the heights, the tile placement and the page navigation once', () => {
    const {card, writes} = laidOutCard();
    card._layout();
    assert.ok(writes.face.some((w) => w.startsWith('--columns=')));
    assert.ok(writes.face.some((w) => w.startsWith('--rows=')));
    assert.ok(writes.face.some((w) => w.startsWith('height=')));
    assert.ok(writes.shell.some((w) => w.startsWith('height=')));
    assert.equal(writes.tile.length, 1, 'the tile is placed');
    assert.equal(writes.nav, 1);
  });

  it('writes nothing when its inputs have not changed (the resize observer after our own write)', () => {
    const {card, writes} = laidOutCard();
    card._layout();
    const first = total(writes);
    assert.ok(first > 0);
    for (let i = 0; i < 5; i++) card._layout();
    assert.equal(total(writes), first, 'five more passes, not one more write');
    assert.equal(writes.surfaceClass, 1, 'not even the class bookkeeping');
  });

  it('writes again when the width, the height or the page markup changes', () => {
    const {card, writes} = laidOutCard();
    card._layout();
    let settled = total(writes);
    card.getBoundingClientRect = () => ({width: 700, height: 800});
    card._layout();
    assert.ok(total(writes) > settled, 'a new width');
    settled = total(writes);
    card._layout();
    assert.equal(total(writes), settled, 'and quiet again');
    card._navHtml = 'something else'; // the page buttons changed
    card._layout();
    assert.equal(writes.nav, 2, 'only the navigation is rewritten for a markup change');
    assert.equal(total(writes) - settled, 1, 'and nothing else');
  });

  it('a rebuilt face or an arrived stylesheet forces a full pass', () => {
    const {card, writes} = laidOutCard();
    card._layout();
    const settled = total(writes);
    card._layoutKey = null; // what _renderWidgets and the stylesheet's load event do
    card._layout();
    // the grid, both heights and the tile are written again; the page buttons only when their markup differs
    assert.equal(total(writes), settled * 2 - 1);
    assert.equal(writes.nav, 1);
  });

  it('renders again instead when the model wants other widgets on the page', () => {
    const {card} = laidOutCard();
    let rendered = 0;
    card._renderWidgets = () => rendered++;
    card._renderedIndices = '0,1';
    card._layout();
    assert.equal(rendered, 1);
  });

  it('uses the model it is given and does not measure again', () => {
    const {card} = laidOutCard();
    const model = card._screenModel();
    let measured = 0;
    card._screenModel = () => measured++;
    card._layout(model);
    assert.equal(measured, 0);
  });

  it('does nothing without a face', () => {
    const {card, writes} = laidOutCard();
    card._config = {climate: {entity: 'climate.a'}};
    card._layout();
    assert.equal(total(writes), 0);
    const bare = new HouseViewCard();
    bare._config = {widgets: []};
    assert.doesNotThrow(() => bare._layout());
  });
});
