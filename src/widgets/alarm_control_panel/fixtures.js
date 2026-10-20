// States used by the contract and preview harnesses and by test.js.
const entity = 'alarm_control_panel.test';
const FULL = 1 | 2 | 4 | 32; // ARM_HOME, ARM_AWAY, ARM_NIGHT, ARM_VACATION

const make = (state, widget = {}, attributes = {}, config) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes: {supported_features: FULL, ...attributes}}},
  ...(config ? {config} : {})
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
  noFeatures: make('disarmed', {}, {supported_features: 0}),
  codeArmed: make('armed_home', {}, {code_format: 'number'}),
  codeRequired: make('disarmed', {}, {code_format: 'number'}),
  alarmViewOff: make('armed_home', {}, {}, {alarm_view: false}),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {widget: {entity}, states: {}}
};
