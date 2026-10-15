// States used by the contract and preview harnesses and by test.js.
const entity = 'lock.test';
const make = (state, widget = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes: {}}}
});

export const variants = {
  ok: make('locked'),
  unlocked: make('unlocked'),
  // Transitional or faulty states: a tap opens more-info instead of sending a command.
  locking: make('locking'),
  unlocking: make('unlocking'),
  jammed: make('jammed'),
  customIcon: make('locked', {
    icon: 'mdi:door-closed-lock',
    name: 'Back door'
  }),
  foreignIcon: make('unlocked', {icon: 'hass:lock'}),
  // Characters that must be escaped in the name.
  hostileName: make('locked', {name: '<b>"Door" & co</b>'}),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {widget: {entity}, states: {}}
};
