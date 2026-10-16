// States used by the contract and preview harnesses and by test.js.
const entity = 'climate.test';
// supported_features: 1 target temperature, 8 fan mode, 128 turn on, 256 turn off (only bit 1 matters to the tile).
const ALL = 1 | 8 | 128 | 256;
const base = {
  temperature: 21,
  current_temperature: 20.5,
  min_temp: 16,
  max_temp: 30,
  supported_features: ALL,
  hvac_modes: ['off', 'cool', 'heat'],
  fan_modes: ['auto', 'quiet', 'high'],
  fan_mode: 'auto'
};
const make = (state, attributes = {}, widget = {}, hass, config) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes: {...base, ...attributes}}},
  ...(hass ? {hass} : {}),
  ...(config ? {config} : {})
});
// Unavailable entities carry no attributes.
const bare = (state) => ({widget: {entity}, states: {[entity]: {state, attributes: {}}}});
const fahrenheit = {config: {unit_system: {temperature: '°F'}}};

export const variants = {
  ok: make('heat'),
  cooling: make('cool'),
  off: make('off'),
  // heat_cool has a low/high pair instead of one target: show the room temperature, keys act as more-info.
  heatCool: make('heat_cool', {temperature: null, target_temp_low: 19, target_temp_high: 24}),
  noTarget: make('heat', {temperature: null}),
  noRoomTemperature: make('heat', {current_temperature: null}),
  atMin: make('heat', {temperature: 16}),
  atMax: make('cool', {temperature: 30}),
  noLimits: make('heat', {min_temp: null, max_temp: null}),
  noTargetFeature: make('heat', {supported_features: 8 | 128 | 256}),
  customStep: make('heat', {temperature: 20.1, target_temp_step: 0.1}),
  invalidStep: make('heat', {target_temp_step: 0}),
  fahrenheit: make(
    'heat',
    {temperature: 70, current_temperature: 68.5, min_temp: 60, max_temp: 90},
    {},
    fahrenheit
  ),
  // The power and shortcut keys are gone: power bits, hvac_modes and fan_modes no longer change the face.
  withRoom: make('heat', {}, {room: 'Living Room'}),
  withRoomOff: make('off', {}, {room: 'Living Room'}),
  roomNoCurrent: make('heat', {current_temperature: null}, {room: 'Living Room'}),
  noRoomNoCurrent: make('heat', {current_temperature: null}),
  decimalTarget: make('heat', {temperature: 21.5, current_temperature: 20.25}),
  heatCoolRoom: make(
    'heat_cool',
    {temperature: null, target_temp_low: 19, target_temp_high: 24},
    {room: 'Living Room'}
  ),
  fahrenheitRoom: make(
    'heat',
    {temperature: 70, current_temperature: 68.5, min_temp: 60, max_temp: 90},
    {room: 'Hall'},
    fahrenheit
  ),
  hostileRoom: make('heat', {}, {room: '<i>"R"</i> & co'}),
  // the card opts out of the thermostat view: the number opens more-info
  climateViewOff: make('heat', {}, {}, undefined, {climate_view: false}),
  customName: make('heat', {}, {name: 'Lounge AC', size: 'wide'}),
  // Characters that must be escaped in the name and in the aria labels.
  hostileName: make('heat', {}, {name: '<b>"AC" & co</b>'}),
  unavailableRoom: {
    widget: {entity, room: 'Living Room'},
    states: {[entity]: {state: 'unavailable', attributes: {}}}
  },
  unavailable: bare('unavailable'),
  unknown: bare('unknown'),
  missing: {widget: {entity}, states: {}}
};
