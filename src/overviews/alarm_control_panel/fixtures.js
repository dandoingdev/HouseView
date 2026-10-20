// Variants for tests and previews. Data only, no imports.
// AlarmControlPanelEntityFeature: ARM_HOME 1, ARM_AWAY 2, ARM_NIGHT 4, TRIGGER 8, ARM_CUSTOM_BYPASS 16,
// ARM_VACATION 32.
const entity = 'alarm_control_panel.home';
const HOME = 1;
const AWAY = 2;
const NIGHT = 4;
const TRIGGER = 8;
const VACATION = 32;
const FULL = HOME | AWAY | NIGHT | VACATION;

const base = {friendly_name: 'House alarm', supported_features: FULL, code_format: null};

const make = (state, attributes = {}) => ({
  options: {entity},
  states: {[entity]: {state, attributes: {...base, ...attributes}}}
});

export const variants = {
  ok: make('disarmed'),
  armedHome: make('armed_home'),
  armedAway: make('armed_away'),
  armedNight: make('armed_night'),
  armedVacation: make('armed_vacation'),
  armedBypass: make('armed_custom_bypass'),
  arming: make('arming'),
  pending: make('pending'),
  triggered: make('triggered'),
  homeOnly: make('disarmed', {supported_features: HOME | TRIGGER}),
  noFeatures: make('disarmed', {supported_features: 0}),
  codeNumber: make('disarmed', {code_format: 'number', code_arm_required: true}),
  codeToDisarmOnly: make('disarmed', {code_format: 'number', code_arm_required: false}),
  codeArmed: make('armed_away', {code_format: 'number'}),
  hostile: make('disarmed', {friendly_name: '<b>"Alarm" & co</b>'}),
  unavailable: {
    options: {entity},
    states: {[entity]: {state: 'unavailable', attributes: {friendly_name: 'House alarm'}}}
  },
  unknown: {
    options: {entity},
    states: {[entity]: {state: 'unknown', attributes: {friendly_name: 'House alarm'}}}
  },
  missing: {options: {entity}, states: {}}
};
