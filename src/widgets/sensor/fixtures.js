// States used by the contract and preview harnesses and by test.js.
const entity = 'sensor.test';
const make = (state, attributes = {}, widget = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes}}
});

export const variants = {
  ok: make('21.5', {unit_of_measurement: '°C', friendly_name: 'Living room'}),
  noUnit: make('on', {friendly_name: 'Door'}),
  textState: make('not_home', {}),
  zero: make('0', {unit_of_measurement: 'W'}),
  customIcon: make('48', {unit_of_measurement: '%'}, {icon: 'mdi:water-percent', name: 'Humidity'}),
  bareIcon: make('48', {unit_of_measurement: '%'}, {icon: 'water-percent'}),
  // A non-mdi prefix is passed through.
  foreignIcon: make('48', {unit_of_measurement: '%'}, {icon: 'hass:thermometer'}),
  wide: make('1013', {unit_of_measurement: 'hPa'}, {size: 'wide'}),
  // Characters that must be escaped in the name, the state and the unit.
  hostile: make('<i>1</i>', {
    unit_of_measurement: '"&<',
    friendly_name: '<img src=x onerror=alert(1)>'
  }),
  unavailable: make('unavailable', {unit_of_measurement: '°C'}),
  unknown: make('unknown', {unit_of_measurement: '°C'}),
  missing: {widget: {entity}, states: {}}
};
