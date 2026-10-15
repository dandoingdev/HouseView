// Widget definitions shared by the editor tests. They mirror the option/entity/editor fields the real kinds
// declare (docs/widget-api.md), registered through the real defineWidget/registerWidget once core has them
// and as plain objects against the stand-in registry before that.
import fs from 'node:fs';
import './editor-env.mjs'; // must run before the editor modules are resolved, hence the dynamic imports

const hasCore = fs.existsSync(new URL('../../src/core/define-widget.js', import.meta.url));
const define = hasCore
  ? (await import('../../src/core/define-widget.js')).defineWidget
  : (def) => def;
const {registerWidget} = await import('../../src/core/registry.js');

const render = () => '<div data-widget="0"></div>';

export const defs = [
  define({
    type: 'action',
    label: 'Action',
    order: 10,
    render,
    entity: 'custom',
    domains: ['scene', 'script', 'button', 'input_button'],
    aliases: ['scene', 'script', 'button', 'input_button'],
    options: {icon: {type: 'icon'}, note: {type: 'text'}},
    validate: () => {}
  }),
  define({type: 'clock', label: 'Clock', order: 20, render, entity: 'none'}),
  define({type: 'date', label: 'Date', order: 30, render, entity: 'none', editor: {name: false}}),
  define({type: 'camera', label: 'Camera', order: 40, render}),
  define({
    type: 'climate',
    label: 'Thermostat',
    order: 50,
    render,
    defaultSize: 'large',
    options: {room: {type: 'text'}}
  }),
  define({
    type: 'light',
    label: 'Light',
    order: 60,
    render,
    options: {
      icon: {type: 'icon'},
      action: {type: 'enum', values: ['toggle', 'off'], default: 'toggle', error: 'x'}
    },
    editor: {
      toForm: (widget) => ({action: widget.action === false ? 'off' : widget.action || 'toggle'})
    }
  }),
  define({type: 'lock', label: 'Lock', order: 100, render, options: {icon: {type: 'icon'}}})
];
for (const def of defs) registerWidget(def);

/**
 * A definition with every option type, including the overview types `entity` and `enum_list` and a `when`.
 * It is passed to the schema compiler directly (never registered), so it works before the engine accepts those types.
 */
export const gizmo = {
  type: 'gizmo',
  label: 'Gizmo',
  order: 70,
  entity: 'required',
  domains: ['gizmo'],
  options: {
    level: {type: 'number', min: 1, max: 5, step: 1},
    peer: {type: 'entity', domains: ['sun']},
    picks: {type: 'enum_list', values: ['one', 'two']},
    loud: {type: 'boolean'},
    volume: {type: 'number', min: 0, max: 10, when: (widget) => widget.loud === true}
  }
};
