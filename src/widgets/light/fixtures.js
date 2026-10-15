// States used by the contract and preview harnesses and by test.js.
const entity = 'light.test';
const make = (state, widget = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes: {}}}
});

export const variants = {
  ok: make('on'),
  off: make('off'),
  actionToggle: make('on', {action: 'toggle'}),
  actionOff: make('on', {action: 'off'}),
  // YAML `action: off` parses as boolean false.
  yamlFalse: make('on', {action: false}),
  customIcon: make('on', {icon: 'mdi:ceiling-light-outline', name: 'Hall'}),
  foreignIcon: make('on', {icon: 'hass:lightbulb'}),
  // Characters that must be escaped in the name and in the state text.
  hostileName: make('on', {name: '<b>"Lamp" & co</b>'}),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {widget: {entity}, states: {}}
};
