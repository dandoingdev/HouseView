// States used by the contract and preview harnesses and by test.js.
const entity = 'switch.test';
const make = (state, widget = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes: {}}}
});

export const variants = {
  ok: make('on'),
  off: make('off'),
  customIcon: make('on', {icon: 'mdi:coffee-maker', name: 'Coffee'}),
  // A bare icon name (no mdi: prefix) is accepted.
  bareIcon: make('on', {icon: 'toaster'}),
  // A non-mdi prefix is passed through.
  foreignIcon: make('on', {icon: 'hass:power-plug'}),
  // Characters that must be escaped in the name and in the state text.
  hostileName: make('on', {name: '<b>"Plug" & co</b>'}),
  // Underscores in the state text are shown as spaces.
  underscoreState: make('some_odd_state'),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {widget: {entity}, states: {}}
};
