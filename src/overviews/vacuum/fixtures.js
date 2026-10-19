// Variants for tests and previews. Data only, no imports.
// VacuumEntityFeature: START 8192, PAUSE 4, STOP 8, RETURN_HOME 16, FAN_SPEED 32, BATTERY 64,
// LOCATE 512, CLEAN_SPOT 1024, TURN_ON 1, TURN_OFF 2.
const entity = 'vacuum.robot';
const START = 8192;
const PAUSE = 4;
const STOP = 8;
const RETURN_HOME = 16;
const FAN_SPEED = 32;
const BATTERY = 64;
const LOCATE = 512;
const CLEAN_SPOT = 1024;
const TURN_ON = 1;
const TURN_OFF = 2;
const FULL = START | PAUSE | STOP | RETURN_HOME | FAN_SPEED | BATTERY | LOCATE | CLEAN_SPOT;
const speeds = ['Quiet', 'Balanced', 'Turbo'];

const base = {
  friendly_name: 'Robot',
  battery_level: 72,
  fan_speed: 'Balanced',
  fan_speed_list: speeds,
  supported_features: FULL
};

const make = (state, attributes = {}) => ({
  options: {entity},
  states: {[entity]: {state, attributes: {...base, ...attributes}}}
});

export const variants = {
  ok: make('cleaning'),
  docked: make('docked', {battery_level: 100, fan_speed: 'Quiet'}),
  paused: make('paused', {battery_level: 64}),
  returning: make('returning', {battery_level: 41}),
  idle: make('idle', {battery_level: null, fan_speed: ''}),
  error: make('error', {status: 'Brush stuck', battery_level: 12}),
  charging: make('charging', {battery_level: 80}),
  lowBattery: make('docked', {battery_level: 15}),
  legacy: make('docked', {
    supported_features: TURN_ON | TURN_OFF | BATTERY,
    fan_speed: '',
    fan_speed_list: [],
    battery_level: 90
  }),
  noFeatures: make('idle', {
    supported_features: 0,
    fan_speed: '',
    fan_speed_list: [],
    battery_level: null
  }),
  manySpeeds: make('docked', {
    fan_speed: 'Seven',
    fan_speed_list: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']
  }),
  hostile: make('docked', {
    friendly_name: '<b>"Bot" & co</b>',
    fan_speed: '<b>Max</b>',
    fan_speed_list: ['<b>Max</b>'],
    supported_features: FAN_SPEED | BATTERY,
    battery_level: 50
  }),
  unavailable: {
    options: {entity},
    states: {[entity]: {state: 'unavailable', attributes: {friendly_name: 'Robot'}}}
  },
  unknown: {
    options: {entity},
    states: {[entity]: {state: 'unknown', attributes: {friendly_name: 'Robot'}}}
  },
  missing: {options: {entity}, states: {}}
};
