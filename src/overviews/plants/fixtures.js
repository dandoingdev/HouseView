// Variants for tests, previews and screenshots. Data only, imports nothing. Fixed clock: 2026-10-15 10:09
// Europe/London. The plants are read from the dashboard's Plants widget, so `config.widgets` carries it.
export const NOW = '2026-10-15T10:09:00+01:00';
const entity = 'sensor.fern_humidity';

const plants = [
  {
    name: 'Fern',
    humidity: entity,
    temperature: 'sensor.fern_temperature',
    battery: 'sensor.fern_battery'
  },
  {
    name: 'Cactus',
    humidity: 'sensor.cactus_humidity',
    temperature: 'sensor.cactus_temperature',
    humidity_low: 10,
    humidity_high: 40
  },
  {
    name: 'Monstera',
    icon: 'mdi:leaf',
    humidity: 'sensor.monstera_humidity',
    temperature: 'sensor.monstera_temperature',
    battery: 'sensor.monstera_battery'
  }
];
const sensor = (state, unit, updated = '2026-10-15T10:04:00+01:00') => ({
  state,
  last_updated: updated,
  attributes: {unit_of_measurement: unit}
});
const happy = {
  'sensor.fern_humidity': sensor('54', '%'),
  'sensor.fern_temperature': sensor('21.4', '°C'),
  'sensor.fern_battery': sensor('88', '%'),
  'sensor.cactus_humidity': sensor('22', '%', '2026-10-15T07:00:00+01:00'),
  'sensor.cactus_temperature': sensor('23', '°C'),
  'sensor.monstera_humidity': sensor('48', '%'),
  'sensor.monstera_temperature': sensor('20.5', '°C'),
  'sensor.monstera_battery': sensor('64', '%')
};

const make = (states, widgetPlants = plants) => ({
  options: {entity},
  states,
  config: {preview_time: NOW, widgets: [{type: 'plants', entity, plants: widgetPlants}]},
  hass: {
    locale: {language: 'en-GB', time_format: '24', time_zone: 'server'},
    config: {time_zone: 'Europe/London', unit_system: {temperature: '°C'}}
  }
});

export const variants = {
  ok: make(happy),
  care: make({
    ...happy,
    'sensor.fern_humidity': sensor('9', '%'),
    'sensor.cactus_humidity': sensor('71', '%'),
    'sensor.monstera_temperature': sensor('9', '°C'),
    'sensor.monstera_battery': sensor('7', '%')
  }),
  unavailable: make({
    'sensor.fern_humidity': sensor('unavailable', '%'),
    'sensor.cactus_humidity': sensor('unknown', '%'),
    'sensor.monstera_humidity': sensor('unavailable', '%')
  }),
  // sensors that report "unknown" (a battery plant that has not woken yet) read like unavailable ones
  unknown: make({
    'sensor.fern_humidity': sensor('unknown', '%'),
    'sensor.cactus_humidity': sensor('unknown', '%'),
    'sensor.monstera_humidity': sensor('unknown', '%')
  }),
  one: make(happy, [plants[0]]),
  // no Plants widget on the dashboard: a calm empty state
  missing: {
    options: {entity},
    states: {},
    config: {preview_time: NOW}
  }
};
