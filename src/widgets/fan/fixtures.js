// States used by the contract and preview harnesses and by test.js.
const entity = 'fan.test';
const make = (state, widget = {}, attributes = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes}}
});

export const variants = {
  ok: make('on', {}, {percentage: 66}),
  off: make('off'),
  customIcon: make('on', {icon: 'mdi:ceiling-fan', name: 'Bedroom'}),
  // A non-mdi prefix is passed through.
  foreignIcon: make('on', {icon: 'hass:fan'}),
  // Characters that must be escaped in the name and in the state text.
  hostileName: make('on', {name: '<b>"Fan" & co</b>'}),
  // Underscores in the raw state become spaces in the small text.
  underscoreState: make('on_high'),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {widget: {entity}, states: {}}
};
