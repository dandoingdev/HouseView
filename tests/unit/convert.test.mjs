// Config conversion: toCard, toCards, fromCard, onPage and the registry-derived kinds/labels.
import {beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {defineWidget} from '../../src/core/define-widget.js';
import {_resetRegistry, registerWidget} from '../../src/core/registry.js';
import {fromCard, kinds, labels, onPage, toCard, toCards} from '../../src/config/convert.js';

const LABELS = {
  action: 'Action',
  clock: 'Clock',
  date: 'Date',
  camera: 'Camera',
  climate: 'Thermostat',
  light: 'Light',
  switch: 'Switch',
  fan: 'Fan',
  cover: 'Blinds',
  lock: 'Lock',
  sensor: 'Sensor',
  weather: 'Weather',
  media_player: 'Music',
  calendar: 'Calendar',
  timer: 'Timer',
  alarm_control_panel: 'Alarm panel'
};

function registerAll() {
  Object.keys(LABELS).forEach((type, i) => {
    registerWidget(
      defineWidget({
        type,
        label: LABELS[type],
        order: (i + 1) * 10,
        render: () => '<div></div>',
        ...(type === 'action'
          ? {entity: 'custom', aliases: ['scene', 'script', 'button', 'input_button']}
          : {})
      })
    );
  });
}

beforeEach(() => {
  _resetRegistry();
  registerAll();
});

describe('kinds and labels follow the registry, live', () => {
  it('list every registered kind, in order, with its label', () => {
    assert.deepEqual([...kinds], Object.keys(LABELS));
    assert.deepEqual({...labels}, LABELS);
    assert.deepEqual(Object.keys(labels), [...kinds]);
  });

  it('are the same array and object after later registrations (importers keep working)', () => {
    const [k, l] = [kinds, labels];
    _resetRegistry();
    assert.equal(kinds.length, 0);
    registerWidget(defineWidget({type: 'switch', label: 'Switch', order: 70, render: () => ''}));
    assert.equal(k, kinds);
    assert.equal(l, labels);
    assert.deepEqual([...kinds], ['switch']);
    assert.deepEqual({...labels}, {switch: 'Switch'});
  });
});

describe('toCard / toCards', () => {
  it('toCard folds the aliases into action and keeps every other key', () => {
    assert.deepEqual(toCard({type: 'scene', entity: 'scene.a', name: 'Mood'}), {
      type: 'custom:houseview-widget-card',
      widget_type: 'action',
      entity: 'scene.a',
      name: 'Mood'
    });
    assert.equal(toCard({type: 'cover', entity: 'cover.a'}).widget_type, 'cover');
    assert.equal(toCard({type: 'input_button', entity: 'input_button.a'}).widget_type, 'action');
  });

  it('toCards copies cards one level deep', () => {
    const cards = [{type: 'custom:houseview-clock-card', nested: {a: 1}}];
    const out = toCards({cards});
    assert.deepEqual(out, cards);
    assert.notEqual(out[0], cards[0]);
    assert.equal(out[0].nested, cards[0].nested);
  });

  it('toCards converts a widgets list', () => {
    assert.deepEqual(toCards({widgets: [{type: 'clock'}, {type: 'script', entity: 'script.a'}]}), [
      {type: 'custom:houseview-widget-card', widget_type: 'clock'},
      {type: 'custom:houseview-widget-card', widget_type: 'action', entity: 'script.a'}
    ]);
  });

  it('toCards prefers cards over widgets, and gives nothing for a config with neither', () => {
    const cards = [{type: 'custom:houseview-light-card', entity: 'light.a'}, {type: 'entities'}];
    assert.deepEqual(toCards({cards, widgets: [{type: 'clock'}]}), cards);
    assert.deepEqual(toCards({cards: []}), []);
    assert.deepEqual(toCards({widgets: []}), []);
    assert.deepEqual(toCards({climate: {entity: 'climate.a'}}), []);
  });
});

describe('fromCard', () => {
  it('HouseView cards become widgets, by generic card or by kind tag', () => {
    assert.deepEqual(
      fromCard({type: 'custom:houseview-widget-card', widget_type: 'cover', entity: 'cover.a'}),
      {
        entity: 'cover.a',
        type: 'cover'
      }
    );
    assert.deepEqual(
      fromCard({type: 'custom:houseview-media_player-card', entity: 'media_player.a'}),
      {
        entity: 'media_player.a',
        type: 'media_player'
      }
    );
    assert.equal(
      fromCard({type: 'custom:houseview-widget-card', widget_type: 'scene'}).type,
      'scene'
    );
  });

  it('anything else becomes a native_card that keeps the original', () => {
    const card = {
      type: 'entities',
      entity: 'sun.sun',
      view_layout: {houseview_page: 'P', houseview_size: 'tall'}
    };
    assert.deepEqual(fromCard(card), {
      type: 'native_card',
      _card: card,
      entity: 'sun.sun',
      page: 'P',
      size: 'tall'
    });
    assert.equal(fromCard({type: 'markdown'}).size, 'normal');
    assert.equal(fromCard({}).type, 'native_card');
  });

  it('a kind tag of an unregistered kind is a native card (nothing to render it)', () => {
    assert.equal(fromCard({type: 'custom:houseview-vacuum-card'}).type, 'native_card');
  });

  it('reads the kind from the tag, the widget_type, or the generic card', () => {
    assert.deepEqual(
      fromCard({
        type: 'custom:houseview-widget-card',
        widget_type: 'timer',
        entity: 'timer.a',
        size: 'wide'
      }),
      {type: 'timer', entity: 'timer.a', size: 'wide'}
    );
    assert.equal(
      fromCard({type: 'custom:houseview-alarm_control_panel-card'}).type,
      'alarm_control_panel'
    );
    assert.equal(
      fromCard({type: 'custom:houseview-action-card', entity: 'scene.a'}).type,
      'action'
    );
    assert.equal(fromCard({type: 'custom:houseview-card'}).type, 'native_card');
    assert.deepEqual(fromCard({type: 'vertical-stack', cards: []}).type, 'native_card');
    const other = fromCard({
      type: 'custom:other-card',
      entity: 'x.y',
      view_layout: {houseview_size: 'large'}
    });
    assert.equal(other.size, 'large');
  });

  it('round trips toCard -> fromCard for every kind', () => {
    for (const type of Object.keys(LABELS)) {
      const widget = {type, entity: `${type}.a`, name: 'N'};
      assert.deepEqual(fromCard(toCard(widget)), widget, type);
    }
  });
});

describe('onPage', () => {
  it('sets page on HouseView cards and view_layout.houseview_page on native cards', () => {
    assert.deepEqual(onPage({type: 'custom:houseview-clock-card'}, 'Kitchen'), {
      type: 'custom:houseview-clock-card',
      page: 'Kitchen'
    });
    assert.deepEqual(onPage({type: 'entities', view_layout: {x: 1}}, 'Kitchen'), {
      type: 'entities',
      view_layout: {x: 1, houseview_page: 'Kitchen'}
    });
    assert.deepEqual(onPage({type: 'entities'}, 'K'), {
      type: 'entities',
      view_layout: {houseview_page: 'K'}
    });
  });

  it('does not mutate its input', () => {
    const card = {type: 'entities', view_layout: {houseview_page: 'Old'}};
    const copy = JSON.stringify(card);
    assert.deepEqual(onPage(card, 'New'), {type: 'entities', view_layout: {houseview_page: 'New'}});
    assert.equal(JSON.stringify(card), copy);
    const own = {type: 'custom:houseview-light-card', entity: 'light.a'};
    assert.deepEqual(onPage(own, 'P'), {...own, page: 'P'});
  });
});
