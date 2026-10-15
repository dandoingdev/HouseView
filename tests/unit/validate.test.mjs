// setConfig validation: error strings and their precedence (the original order), normalisation, immutability.
import {beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {defineWidget} from '../../src/core/define-widget.js';
import {_resetRegistry, registerWidget} from '../../src/core/registry.js';
import {validateConfig} from '../../src/config/validate.js';

const render = () => '<div></div>';
const def = (type, order, extra = {}) => defineWidget({type, label: type, order, render, ...extra});

// Stand-ins for the kinds whose validation is not generic.
const ACTION_ENTITY = /^(scene|script|button|input_button)\.[a-z0-9_]+$/;
const action = def('action', 10, {
  entity: 'custom',
  aliases: ['scene', 'script', 'button', 'input_button'],
  validate(widget) {
    if (widget.type === 'action') {
      if (!ACTION_ENTITY.test(widget.entity || '')) {
        throw new Error('Action widget needs a scene, script, button or input_button entity.');
      }
    } else if (!widget.entity || !widget.entity.startsWith(`${widget.type}.`)) {
      throw new Error(`${widget.type} widget needs a ${widget.type} entity.`);
    }
  }
});
const light = def('light', 60, {
  options: {
    action: {type: 'enum', values: ['toggle', 'off'], error: 'Light action must be off or toggle.'}
  },
  normalize: (widget) => (widget.action === false ? {...widget, action: 'off'} : widget)
});
const camera = def('camera', 40, {
  extension: {
    configKeys: ['camera_gallery'],
    validateConfig(config) {
      const gallery = config.camera_gallery;
      if (
        gallery &&
        (!Array.isArray(gallery) ||
          !gallery.length ||
          gallery.length > 4 ||
          gallery.some(
            (c) => !c || typeof c.entity !== 'string' || !c.entity.startsWith('camera.')
          ))
      ) {
        throw new Error('Camera view needs one to four camera entities.');
      }
    }
  }
});
const clock = def('clock', 20, {entity: 'none', availability: 'always', layoutRoles: ['clock']});
const date = def('date', 30, {entity: 'none', availability: 'always'});
const cover = def('cover', 90, {availability: 'allow-unknown'});
const sensor = def('sensor', 110);
const mediaPlayer = def('media_player', 130);
const plain = def('switch', 70, {options: {mode: {type: 'enum', values: ['a', 'b', 'c']}}});

beforeEach(() => {
  _resetRegistry();
  for (const widget of [action, clock, date, camera, light, plain, cover, sensor, mediaPlayer]) {
    registerWidget(widget);
  }
});

const messageOf = (config) => {
  try {
    validateConfig(config);
  } catch (error) {
    return error.message;
  }
  return null;
};
const widgets = (...list) => ({widgets: list});

describe('widgets shape', () => {
  it('an empty or non-list widgets key', () => {
    assert.equal(messageOf({widgets: []}), 'Add at least one HouseView widget.');
    assert.equal(messageOf({widgets: {type: 'clock'}}), 'Add at least one HouseView widget.');
  });

  it('widgets: [] is fine when the config came from cards: []', () => {
    const config = validateConfig({cards: []});
    assert.deepEqual(config.widgets, []);
    assert.deepEqual(validateConfig({widgets: [], cards: []}).widgets, []);
  });

  it('pages need unique non-empty names', () => {
    const w = [{type: 'clock'}];
    assert.equal(messageOf({pages: 'Home', widgets: w}), 'Pages need unique names.');
    assert.equal(messageOf({pages: [], widgets: w}), 'Pages need unique names.');
    assert.equal(messageOf({pages: [{surface: 'glass'}], widgets: w}), 'Pages need unique names.');
    assert.equal(messageOf({pages: [null], widgets: w}), 'Pages need unique names.');
    assert.equal(
      messageOf({pages: [{name: 'A'}, {name: 'A'}], widgets: w}),
      'Pages need unique names.'
    );
    assert.equal(messageOf({pages: [{name: 'A'}, {name: 'B'}], widgets: w}), null);
  });

  it('an unsupported type', () => {
    assert.equal(
      messageOf(widgets({type: 'vacuum', entity: 'vacuum.a'})),
      'Unsupported widget: vacuum'
    );
    assert.equal(messageOf(widgets({entity: 'light.a'})), 'Unsupported widget: undefined');
  });

  it('every alias and native_card are accepted types', () => {
    for (const type of ['scene', 'script', 'button', 'input_button']) {
      assert.equal(messageOf(widgets({type, entity: `${type}.test`})), null, type);
    }
    assert.equal(messageOf(widgets({type: 'native_card', _card: {type: 'entities'}})), null);
  });

  it('an option enum is checked for truthy values only', () => {
    assert.equal(
      messageOf(widgets({type: 'light', entity: 'light.a', action: 'dim'})),
      'Light action must be off or toggle.'
    );
    for (const action of ['off', 'toggle', false, undefined, '', 0, null]) {
      assert.equal(
        messageOf(widgets({type: 'light', entity: 'light.a', action})),
        null,
        String(action)
      );
    }
  });

  it('an enum without its own error text gets a generic sentence', () => {
    assert.equal(
      messageOf(widgets({type: 'switch', entity: 'switch.a', mode: 'z'})),
      'switch mode must be a, b or c.'
    );
  });

  it('the action widget has its own entity messages', () => {
    const message = 'Action widget needs a scene, script, button or input_button entity.';
    assert.equal(messageOf(widgets({type: 'action', entity: 'light.a'})), message);
    assert.equal(messageOf(widgets({type: 'action'})), message);
    assert.equal(messageOf(widgets({type: 'action', entity: 'scene.Morning'})), message);
    assert.equal(messageOf(widgets({type: 'action', entity: 'input_button.a'})), null);
  });

  it('an alias is held to its own prefix (scene needs a scene entity)', () => {
    assert.equal(
      messageOf(widgets({type: 'scene', entity: 'script.test'})),
      'scene widget needs a scene entity.'
    );
  });

  it('the entity rule for required kinds', () => {
    assert.equal(messageOf(widgets({type: 'light'})), 'light widget needs a light entity.');
    assert.equal(
      messageOf(widgets({type: 'light', entity: 'sensor.other'})),
      'light widget needs a light entity.'
    );
    assert.equal(
      messageOf(widgets({type: 'media_player', entity: 'sensor.other'})),
      'media_player widget needs a media_player entity.'
    );
    assert.equal(
      messageOf(widgets({type: 'light', entity: 7})),
      'light widget needs a light entity.'
    );
    assert.equal(
      messageOf(widgets({type: 'light', entity: 'lightx.a'})),
      'light widget needs a light entity.'
    );
  });

  it('kinds without an entity (clock, date) and native cards need none', () => {
    assert.equal(messageOf(widgets({type: 'clock'}, {type: 'date'}, {type: 'native_card'})), null);
  });

  it('the size rule applies to every type, including clock and native_card', () => {
    const message = 'Widget size must be normal, wide, tall or large.';
    assert.equal(messageOf(widgets({type: 'light', entity: 'light.a', size: 'huge'})), message);
    assert.equal(messageOf(widgets({type: 'clock', size: 'giant'})), message);
    assert.equal(messageOf(widgets({type: 'native_card', size: 'giant'})), message);
    for (const size of ['normal', 'wide', 'tall', 'large']) {
      assert.equal(messageOf(widgets({type: 'clock', size})), null, size);
    }
  });

  it('precedence inside a widget: type, enum, def.validate, entity, size', () => {
    assert.equal(
      messageOf(widgets({type: 'light', entity: 'sensor.x', action: 'dim', size: 'huge'})),
      'Light action must be off or toggle.'
    );
    assert.equal(
      messageOf(widgets({type: 'light', entity: 'sensor.x', size: 'huge'})),
      'light widget needs a light entity.'
    );
    assert.equal(
      messageOf(widgets({type: 'action', entity: 'light.a', size: 'huge'})),
      'Action widget needs a scene, script, button or input_button entity.'
    );
  });

  it('widgets are checked in order: the first broken one reports', () => {
    assert.equal(
      messageOf(widgets({type: 'light', entity: 'light.a', size: 'huge'}, {type: 'vacuum'})),
      'Widget size must be normal, wide, tall or large.'
    );
  });

  it('pages are checked before widgets', () => {
    assert.equal(messageOf({pages: [], widgets: [{type: 'vacuum'}]}), 'Pages need unique names.');
  });

  it('a non-object widget gets a sentence, not a TypeError', () => {
    assert.equal(messageOf(widgets(null)), 'Widget 1 must be an object with a type.');
    assert.equal(
      messageOf(widgets({type: 'clock'}, 'light.a')),
      'Widget 2 must be an object with a type.'
    );
  });
});

describe('normalisation', () => {
  it('folds aliases to the canonical type and keeps every other key', () => {
    const config = validateConfig(
      widgets(
        {type: 'scene', entity: 'scene.test', name: 'Mood', icon: 'mdi:weather-night'},
        {type: 'script', entity: 'script.test', note: 'Caption'}
      )
    );
    assert.deepEqual(
      config.widgets.map((w) => w.type),
      ['action', 'action']
    );
    assert.equal(config.widgets[0].name, 'Mood');
    assert.equal(config.widgets[0].icon, 'mdi:weather-night');
    assert.equal(config.widgets[1].note, 'Caption');
  });

  it('light action:false (YAML) becomes "off"; other widgets keep their identity', () => {
    const untouched = {type: 'light', entity: 'light.b', action: 'toggle'};
    const config = validateConfig(
      widgets({type: 'light', entity: 'light.a', action: false, name: 'N'}, untouched, {
        type: 'clock'
      })
    );
    assert.deepEqual(config.widgets[0], {
      type: 'light',
      entity: 'light.a',
      action: 'off',
      name: 'N'
    });
    assert.equal(config.widgets[1], untouched);
  });

  it('keeps the other config keys and does not mutate the input', () => {
    const input = {
      pages: [{name: 'A'}],
      bedtime: true,
      widgets: [
        {type: 'scene', entity: 'scene.a'},
        {type: 'light', entity: 'light.a', action: false}
      ]
    };
    const snapshot = JSON.stringify(input);
    const config = validateConfig(input);
    assert.equal(JSON.stringify(input), snapshot);
    assert.equal(config.bedtime, true);
    assert.equal(config.pages, input.pages);
    assert.notEqual(config, input);
    assert.notEqual(config.widgets, input.widgets);
  });

  it('the widget normalize hook runs after alias folding', () => {
    const seen = [];
    _resetRegistry();
    registerWidget(
      def('action', 10, {
        entity: 'custom',
        aliases: ['scene'],
        normalize: (widget) => {
          seen.push(widget.type);
          return widget;
        }
      })
    );
    validateConfig(widgets({type: 'scene', entity: 'scene.a'}));
    assert.deepEqual(seen, ['action']);
  });

  it('a normalize hook that returns nothing keeps the widget', () => {
    _resetRegistry();
    registerWidget(def('sensor', 110, {normalize: () => undefined}));
    const widget = {type: 'sensor', entity: 'sensor.a'};
    assert.equal(validateConfig(widgets(widget)).widgets[0], widget);
  });
});

describe('cards shape', () => {
  it('cards become widgets and keep the cards key', () => {
    const cards = [
      {type: 'custom:houseview-light-card', entity: 'light.a', page: 'P'},
      {type: 'custom:houseview-widget-card', widget_type: 'scene', entity: 'scene.a'},
      {type: 'entities', entities: ['sun.sun'], view_layout: {houseview_size: 'wide'}}
    ];
    const config = validateConfig({cards});
    assert.equal(config.cards, cards);
    assert.deepEqual(
      config.widgets.map((w) => w.type),
      ['light', 'action', 'native_card']
    );
    assert.equal(config.widgets[2].size, 'wide');
    assert.equal(config.widgets[2]._card, cards[2]);
  });

  it('cards must be a list', () => {
    assert.equal(messageOf({cards: {type: 'clock'}}), 'Cards must be a list.');
    assert.equal(messageOf({cards: 'clock'}), 'Cards must be a list.');
  });

  it('a null or non-object card gets a readable sentence', () => {
    assert.equal(messageOf({cards: [null]}), 'Card 1 must be an object with a type.');
    assert.equal(
      messageOf({cards: [{type: 'custom:houseview-clock-card'}, 'clock']}),
      'Card 2 must be an object with a type.'
    );
    assert.equal(messageOf({cards: [[]]}), 'Card 1 must be an object with a type.');
  });

  it('card errors surface the same widget messages', () => {
    assert.equal(
      messageOf({cards: [{type: 'custom:houseview-light-card'}]}),
      'light widget needs a light entity.'
    );
  });

  it('a pages-less cards config with an unknown widget_type', () => {
    assert.equal(
      messageOf({cards: [{type: 'custom:houseview-widget-card', widget_type: 'vacuum'}]}),
      'Unsupported widget: vacuum'
    );
  });
});

describe('card-level extension validation (camera_gallery)', () => {
  const clockWidget = [{type: 'clock'}];

  it('runs for cards and widgets, before the widgets check', () => {
    const message = 'Camera view needs one to four camera entities.';
    assert.equal(messageOf({camera_gallery: [], widgets: clockWidget}), message);
    assert.equal(messageOf({camera_gallery: 'camera.a', widgets: clockWidget}), message);
    assert.equal(messageOf({camera_gallery: [{entity: 'light.a'}], widgets: clockWidget}), message);
    assert.equal(messageOf({camera_gallery: [null], widgets: clockWidget}), message);
    assert.equal(
      messageOf({
        camera_gallery: ['a', 'b', 'c', 'd', 'e'].map((x) => ({entity: `camera.${x}`})),
        widgets: clockWidget
      }),
      message
    );
    assert.equal(messageOf({camera_gallery: [], widgets: []}), message);
    assert.equal(messageOf({camera_gallery: [], pages: [{name: 'A'}]}), message);
    assert.equal(
      messageOf({
        camera_gallery: [{entity: 'camera.a'}, {entity: 'camera.b'}],
        widgets: clockWidget
      }),
      null
    );
  });

  it('runs after cards are folded', () => {
    assert.equal(
      messageOf({cards: [null], camera_gallery: []}),
      'Card 1 must be an object with a type.'
    );
  });
});

describe('a config without a list of cards', () => {
  const message = 'HouseView needs a list of cards.';

  it('is rejected, whatever else it holds', () => {
    assert.equal(messageOf({}), message);
    assert.equal(messageOf({climate: {entity: 'climate.a'}}), message);
    assert.equal(messageOf({pages: [{name: 'A'}]}), message);
    assert.equal(messageOf({cards: 0, widgets: ''}), message);
  });

  it('accepts widgets: as an alias of cards:', () => {
    assert.equal(messageOf({widgets: [{type: 'clock'}]}), null);
    assert.equal(messageOf({cards: [{type: 'custom:houseview-clock-card'}]}), null);
  });
});

describe('input that is not a config', () => {
  it('gets a readable error', () => {
    assert.equal(messageOf(undefined), 'HouseView needs a configuration.');
    assert.equal(messageOf(null), 'HouseView needs a configuration.');
    assert.equal(messageOf('clock'), 'HouseView needs a configuration.');
  });
});

describe('optional settings (checked only when present)', () => {
  it('confirm_mode and state_compare', () => {
    const w = [{type: 'clock'}];
    assert.equal(messageOf({widgets: w, confirm_mode: 'inline'}), null);
    assert.equal(messageOf({widgets: w, confirm_mode: 'native'}), null);
    assert.equal(
      messageOf({widgets: w, confirm_mode: 'sheet'}),
      'confirm_mode must be native or inline.'
    );
    assert.equal(messageOf({widgets: w, state_compare: 'auto'}), null);
    assert.equal(
      messageOf({widgets: w, state_compare: 'fast'}),
      'state_compare must be deep, reference or auto.'
    );
  });

  it('performance (auto, full or lite)', () => {
    const w = [{type: 'clock'}];
    for (const value of ['auto', 'full', 'lite']) {
      assert.equal(messageOf({widgets: w, performance: value}), null, value);
    }
    assert.equal(messageOf({widgets: w}), null, 'absent is fine');
    for (const value of ['fast', 'LITE', true, 0, null, '']) {
      assert.equal(
        messageOf({widgets: w, performance: value}),
        'performance must be auto, full or lite.',
        String(value)
      );
    }
    // the cards shape checks it too, and a bad value wins over a missing widget list
    assert.equal(
      messageOf({cards: [{type: 'custom:houseview-clock-card'}], performance: 'x'}),
      'performance must be auto, full or lite.'
    );
    assert.equal(
      messageOf({pages: [{name: 'A'}], performance: 'x'}),
      'performance must be auto, full or lite.'
    );
  });

  it('tap_action, hold_action and double_tap_action', () => {
    const w = (extra) => widgets({type: 'light', entity: 'light.a', ...extra});
    assert.equal(messageOf(w({tap_action: {action: 'toggle'}})), null);
    assert.equal(
      messageOf(w({hold_action: {action: 'more-info'}, double_tap_action: {action: 'none'}})),
      null
    );
    assert.equal(
      messageOf(w({tap_action: 'toggle'})),
      'Tap action must be an object with an action.'
    );
    assert.match(
      messageOf(w({hold_action: {action: 'assist'}})),
      /^Hold action must be one of more-info/
    );
    assert.equal(
      messageOf(w({tap_action: {action: 'perform-action'}})),
      'Tap action needs perform_action in the form domain.service.'
    );
    assert.equal(
      messageOf(w({tap_action: {action: 'navigate'}})),
      'Tap action needs a navigation_path.'
    );
    assert.match(
      messageOf(w({tap_action: {action: 'url', url_path: 'javascript:alert(1)'}})),
      /needs a url_path/
    );
  });

  it('the size and entity messages still win over the action check', () => {
    assert.equal(
      messageOf(widgets({type: 'light', entity: 'light.a', size: 'huge', tap_action: 'x'})),
      'Widget size must be normal, wide, tall or large.'
    );
  });
});
