// defineWidget: defaults, shape validation, freezing, strict and lenient behaviour.
import {afterEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  defineWidget,
  isWidgetDefinition,
  setStrictDefinitions
} from '../../src/core/define-widget.js';

const minimal = (extra = {}) => ({
  type: 'light',
  label: 'Light',
  order: 60,
  render: () => '<button data-widget="0"></button>',
  ...extra
});

const problems = (extra) => {
  try {
    defineWidget(minimal(extra));
  } catch (error) {
    return error.message;
  }
  return '';
};

afterEach(() => setStrictDefinitions(undefined));

describe('defaults', () => {
  it('fills every default of docs/widget-api.md', () => {
    const def = defineWidget(minimal());
    assert.equal(def.entity, 'required');
    assert.deepEqual(def.domains, ['light']);
    assert.deepEqual(def.aliases, []);
    assert.equal(def.defaultSize, 'normal');
    assert.equal(def.availability, 'entity');
    assert.deepEqual(def.unknownOkDomains, []);
    assert.deepEqual(def.layoutRoles, []);
    assert.equal(def.family, null);
    assert.equal(def.standalone, true);
    assert.equal(def.preview, true);
    assert.equal(def.cardRows, 3);
    assert.equal(def.standaloneHeight, 240);
    assert.deepEqual(def.gridOptions, {});
    assert.deepEqual(def.options, {});
    assert.deepEqual(def.actions, {});
    assert.deepEqual(def.editor, {name: true});
  });

  it('entity "none" has no domains', () => {
    const def = defineWidget(minimal({type: 'clock', entity: 'none'}));
    assert.deepEqual(def.domains, []);
  });

  it('keeps what the widget gives', () => {
    const def = defineWidget(
      minimal({
        defaultSize: 'large',
        cardRows: 6,
        standaloneHeight: 380,
        domains: ['light', 'switch']
      })
    );
    assert.equal(def.defaultSize, 'large');
    assert.equal(def.cardRows, 6);
    assert.equal(def.standaloneHeight, 380);
    assert.deepEqual(def.domains, ['light', 'switch']);
  });

  it('merges the editor object over {name: true}', () => {
    const toForm = () => ({});
    assert.deepEqual({...defineWidget(minimal({editor: {toForm}})).editor}, {name: true, toForm});
    assert.equal(defineWidget(minimal({editor: {name: false}})).editor.name, false);
  });

  it('treats an explicit undefined as "use the default"', () => {
    const def = defineWidget(minimal({entity: undefined, family: undefined, options: undefined}));
    assert.equal(def.entity, 'required');
    assert.equal(def.family, null);
    assert.deepEqual(def.options, {});
  });
});

describe('freezing', () => {
  it('returns a deeply frozen module that the registry recognises', () => {
    const def = defineWidget(
      minimal({
        options: {action: {type: 'enum', values: ['toggle', 'off']}},
        actions: {light: {run() {}}},
        aliases: ['lamp']
      })
    );
    assert.ok(Object.isFrozen(def));
    assert.ok(Object.isFrozen(def.options));
    assert.ok(Object.isFrozen(def.options.action));
    assert.ok(Object.isFrozen(def.options.action.values));
    assert.ok(Object.isFrozen(def.actions));
    assert.ok(Object.isFrozen(def.actions.light));
    assert.ok(Object.isFrozen(def.aliases));
    assert.ok(isWidgetDefinition(def));
    assert.equal(isWidgetDefinition({...def}), false);
  });

  it('does not freeze or change the objects it was given', () => {
    const options = {icon: {type: 'icon'}};
    const input = minimal({options});
    defineWidget(input);
    assert.ok(!Object.isFrozen(input));
    assert.ok(!Object.isFrozen(options));
    options.icon.type = 'text'; // still writable
  });
});

describe('shape errors (strict mode throws one sentence listing every problem)', () => {
  it('requires the identity fields', () => {
    assert.throws(() => defineWidget({}), /type must be snake_case.*label.*order.*render/s);
    assert.match(problems({type: 'Light'}), /type must be snake_case/);
    assert.match(problems({label: ''}), /label must be a non-empty string/);
    assert.match(problems({order: 6.5}), /order must be a positive integer/);
    assert.match(problems({order: 0}), /order must be a positive integer/);
    assert.match(problems({render: 'x'}), /render must be a function/);
  });

  it('names the widget in the message', () => {
    assert.match(problems({order: 'x'}), /^defineWidget\(light\):/);
  });

  it('rejects a definition that is not an object', () => {
    assert.throws(() => defineWidget(null), /must be an object/);
    assert.throws(() => defineWidget([]), /must be an object/);
  });

  it('rejects unknown fields (typos)', () => {
    assert.match(problems({defaultsize: 'large'}), /unknown field "defaultsize"/);
  });

  it('checks the enumerated fields', () => {
    assert.match(problems({entity: 'maybe'}), /entity must be one of required, none, custom/);
    assert.match(problems({defaultSize: 'huge'}), /defaultSize must be one of/);
    assert.match(problems({availability: 'sometimes'}), /availability must be one of/);
    assert.match(problems({family: 'big-tile'}), /family must be/);
  });

  it('checks lists and numbers', () => {
    assert.match(problems({domains: 'light'}), /domains must be a list/);
    assert.match(problems({aliases: ['Scene']}), /aliases must be a list of snake_case/);
    assert.match(problems({layoutRoles: [1]}), /layoutRoles/);
    assert.match(problems({unknownOkDomains: 'scene'}), /unknownOkDomains/);
    assert.match(problems({cardRows: 'six'}), /cardRows must be a number/);
    assert.match(problems({gridOptions: []}), /gridOptions must be an object/);
    assert.match(problems({entity: 'none', domains: ['light']}), /entity "none" has no domains/);
  });

  it('checks hook fields are functions', () => {
    for (const hook of [
      'afterRender',
      'onHass',
      'patch',
      'normalize',
      'validate',
      'watch',
      'stub'
    ]) {
      assert.match(problems({[hook]: 5}), new RegExp(`${hook} must be a function`), hook);
    }
  });

  it('checks tick', () => {
    assert.match(problems({tick: {every: 0, run() {}}}), /tick needs/);
    assert.match(problems({tick: {every: 1000}}), /tick needs/);
    assert.doesNotThrow(() => defineWidget(minimal({tick: {every: 1000, run() {}}})));
  });

  it('checks option specs', () => {
    assert.match(problems({options: {a: {type: 'color'}}}), /options.a.type must be one of/);
    assert.match(problems({options: {a: {type: 'enum'}}}), /needs a non-empty values list/);
    assert.match(
      problems({options: {a: {type: 'enum', values: ['x'], default: 'y'}}}),
      /default is not one of its values/
    );
    assert.match(problems({options: {a: {type: 'text', colour: 1}}}), /unknown key "colour"/);
    assert.doesNotThrow(() =>
      defineWidget(
        minimal({options: {a: {type: 'enum', values: ['x', 'y'], default: 'y', error: 'No.'}}})
      )
    );
  });

  it('checks action definitions', () => {
    assert.match(problems({actions: {Bad: {run() {}}}}), /not a valid action name/);
    assert.match(problems({actions: {'light-on': {}}}), /run must be a function/);
    assert.match(
      problems({actions: {'light-on': {run() {}, guard: 1}}}),
      /guard must be a function/
    );
    assert.match(
      problems({actions: {'light-on': {run() {}, availability: 'always'}}}),
      /availability must be one of entity, allow-unknown/
    );
    assert.match(problems({actions: {'light-on': {run() {}, danger: 1}}}), /unknown key "danger"/);
    assert.match(
      problems({actions: {'light-on': {run() {}, immediate: 'yes'}}}),
      /immediate must be a boolean/
    );
    assert.doesNotThrow(() =>
      defineWidget(minimal({actions: {'light-*': {run() {}}, light: {run() {}, immediate: true}}}))
    );
  });

  it('checks the extension', () => {
    assert.match(problems({extension: 'gallery'}), /extension must be an object/);
    assert.match(problems({extension: {sparkle() {}}}), /unknown key "sparkle"/);
    assert.match(
      problems({extension: {configKeys: 'camera_gallery'}}),
      /configKeys must be a list/
    );
    assert.match(problems({extension: {overlay: 'html'}}), /extension.overlay must be a function/);
    assert.match(problems({extension: {compat: {_x: {}}}}), /compat._x needs a get function/);
    assert.match(
      problems({extension: {actions: {Bad: {run() {}}}}}),
      /extension.actions\["Bad"\]: not a valid action name/
    );
    assert.doesNotThrow(() =>
      defineWidget(
        minimal({
          extension: {
            configKeys: ['camera_gallery'],
            state: () => ({}),
            compat: {_galleryOpen: {get: () => true, set() {}}},
            tick: {every: 5000, run() {}},
            actions: {'light-back': {immediate: true, run() {}}}
          }
        })
      )
    );
  });
});

describe('lenient mode (browsers): a bad definition is skipped, not fatal', () => {
  it('logs and returns null', () => {
    setStrictDefinitions(false);
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args.join(' '));
    try {
      assert.equal(defineWidget(minimal({order: 'x'})), null);
    } finally {
      console.error = original;
    }
    assert.equal(logged.length, 1);
    assert.match(logged[0], /defineWidget\(light\).*order.*skipped/);
  });

  it('strict mode is the default in Node', () => {
    assert.throws(() => defineWidget(minimal({order: 'x'})));
  });
});
