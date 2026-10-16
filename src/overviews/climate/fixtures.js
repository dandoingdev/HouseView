// Variants for tests, previews and screenshots. Data only, imports nothing (the browser harness loads this file
// unbundled). Fixed clock: 2026-10-15 10:09 Europe/London, so the header time is the same in every run.
//
//   options  flat overview options (entity first), as in a screensaver block or an overview card
//   states   the hass.states the view reads
//   config   card config keys (preview_time freezes ctx.now)
//   hass     hass.locale / hass.config overrides
export const NOW = '2026-10-15T10:09:00+01:00';
const entity = 'climate.living_room';

// supported_features: 1 target temperature, 8 fan mode, 128 turn on, 256 turn off (only bit 1 matters here).
const ALL = 1 | 8 | 128 | 256;
const base = {
  friendly_name: 'Thermostat',
  temperature: 21,
  current_temperature: 20.5,
  current_humidity: 42,
  min_temp: 16,
  max_temp: 30,
  supported_features: ALL,
  hvac_modes: ['off', 'cool', 'heat', 'heat_cool'],
  hvac_action: 'heating'
};

const make = (state, attributes = {}, {options = {}, hass} = {}) => ({
  options: {entity, ...options},
  states: {[entity]: {state, attributes: {...base, ...attributes}}},
  config: {preview_time: NOW},
  hass: {
    locale: {language: 'en-GB', time_format: '24', time_zone: 'server', ...hass?.locale},
    config: {time_zone: 'Europe/London', unit_system: {temperature: '°C'}, ...hass?.config}
  }
});
// Unavailable entities carry no attributes.
const bare = (state) => ({
  options: {entity},
  states: {[entity]: {state, attributes: {friendly_name: 'Thermostat'}}},
  config: {preview_time: NOW}
});

export const variants = {
  // the reference picture: cooling to 70 °F, the room at 70 °F and 30 % humidity
  ok: make(
    'cool',
    {
      temperature: 70,
      current_temperature: 70,
      current_humidity: 30,
      min_temp: 50,
      max_temp: 90,
      hvac_action: 'cooling'
    },
    {hass: {config: {unit_system: {temperature: '°F'}}}}
  ),
  heating: make('heat'),
  // the mode says cool but the unit is resting: "Set to", slate
  idle: make('cool', {hvac_action: 'idle'}),
  // no hvac_action at all: the mode decides
  coolNoAction: make('cool', {hvac_action: undefined}),
  heatNoAction: make('heat', {hvac_action: undefined}),
  off: make('off', {hvac_action: 'off'}),
  // heat_cool has a low/high pair instead of one target: the room temperature, a range caption, keys disabled
  heatCool: make('heat_cool', {
    temperature: null,
    target_temp_low: 19,
    target_temp_high: 24,
    hvac_action: 'idle'
  }),
  noTarget: make('heat', {temperature: null}),
  noRoomTemperature: make('heat', {current_temperature: null}),
  noHumidity: make('heat', {current_humidity: null}),
  noFigures: make('heat', {current_temperature: null, current_humidity: null}),
  atMin: make('heat', {temperature: 16}),
  atMax: make('cool', {temperature: 30, hvac_action: 'cooling'}),
  noLimits: make('heat', {min_temp: null, max_temp: null}),
  noTargetFeature: make('heat', {supported_features: 8 | 128 | 256}),
  decimalTarget: make('heat', {temperature: 21.5, current_temperature: 20.25}),
  customName: make('heat', {}, {options: {name: 'Lounge AC'}}),
  noTime: make('heat', {}, {options: {show_time: false}}),
  twelveHour: make('heat', {}, {hass: {locale: {time_format: '12'}}}),
  // characters that must be escaped in the name and in the aria label
  hostileName: make('heat', {friendly_name: '<b>"AC" & co</b>'}),
  unavailable: bare('unavailable'),
  unknown: bare('unknown'),
  missing: {options: {entity}, states: {}, config: {preview_time: NOW}}
};
