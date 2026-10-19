// States consumed by the contract and preview harnesses.
// VacuumEntityFeature: START 8192, PAUSE 4, STOP 8, RETURN_HOME 16, FAN_SPEED 32, BATTERY 64,
// LOCATE 512, CLEAN_SPOT 1024, TURN_ON 1, TURN_OFF 2.
const entity = 'vacuum.test';
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

const base = {
  friendly_name: 'Robot',
  battery_level: 72,
  fan_speed: 'Balanced',
  fan_speed_list: ['Quiet', 'Balanced', 'Turbo'],
  supported_features: FULL
};

const make = (state, attributes = {}, widget = {}, config) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes: {...base, ...attributes}}},
  ...(config ? {config} : {})
});

export const variants = {
  ok: make('cleaning'),
  docked: make('docked', {battery_level: 100, fan_speed: 'Quiet'}),
  paused: make('paused', {battery_level: 64}),
  returning: make('returning', {battery_level: 41}),
  idle: make('idle', {battery_level: null}),
  error: make('error', {status: 'Brush stuck', battery_level: 12}),
  charging: make('charging', {battery_level: 80}),
  legacy: make('docked', {
    supported_features: TURN_ON | TURN_OFF | BATTERY,
    fan_speed: undefined,
    fan_speed_list: undefined,
    battery_level: 90
  }),
  turnOffOnly: make('cleaning', {supported_features: TURN_OFF}),
  noFeatures: make('docked', {supported_features: BATTERY, fan_speed_list: undefined}),
  customIcon: make('cleaning', {}, {icon: 'mdi:broom'}),
  hostileName: make('cleaning', {status: '<b>bad</b> & co'}, {name: '<b>"Bot" & co</b>'}),
  vacuumViewOff: make('cleaning', {}, {}, {vacuum_view: false}),
  unavailable: {
    widget: {entity},
    states: {[entity]: {state: 'unavailable', attributes: {friendly_name: 'Robot'}}}
  },
  unknown: {
    widget: {entity},
    states: {[entity]: {state: 'unknown', attributes: {friendly_name: 'Robot'}}}
  },
  missing: {widget: {entity}, states: {}}
};
