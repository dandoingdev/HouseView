// States used by the contract and preview harnesses and by test.js.
const entity = 'alarm_control_panel.test';
const make = (state, widget = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes: {}}}
});

export const variants = {
  ok: make('armed_home'),
  disarmed: make('disarmed'),
  armedHome: make('armed_home'),
  armedAway: make('armed_away'),
  armedNight: make('armed_night'),
  arming: make('arming'),
  pending: make('pending'),
  triggered: make('triggered'),
  customName: make('armed_home', {name: 'House alarm', size: 'wide'}),
  // Characters that must be escaped in the name.
  hostileName: make('disarmed', {name: '<b>"Alarm" & co</b>'}),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {widget: {entity}, states: {}}
};
