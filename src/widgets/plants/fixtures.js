// States consumed by the contract and preview harnesses. Synthetic plants only.
const plants = [
  {
    name: 'Fern',
    humidity: 'sensor.fern_humidity',
    temperature: 'sensor.fern_temperature',
    battery: 'sensor.fern_battery'
  },
  {name: 'Cactus', humidity: 'sensor.cactus_humidity', temperature: 'sensor.cactus_temperature'},
  {name: 'Monstera', humidity: 'sensor.monstera_humidity', humidity_low: 40}
];
const widget = {plants};
const sensor = (state, unit, attributes = {}) => ({
  state,
  attributes: {unit_of_measurement: unit, ...attributes}
});
const happy = {
  'sensor.fern_humidity': sensor('54', '%'),
  'sensor.fern_temperature': sensor('21.4', '°C'),
  'sensor.fern_battery': sensor('88', '%'),
  'sensor.cactus_humidity': sensor('35', '%'),
  'sensor.cactus_temperature': sensor('23', '°C'),
  'sensor.monstera_humidity': sensor('52', '%')
};

export const variants = {
  ok: {widget, states: happy},
  // fern too dry, cactus too wet, monstera under its own 40 % floor
  care: {
    widget,
    states: {
      ...happy,
      'sensor.fern_humidity': sensor('12', '%'),
      'sensor.cactus_humidity': sensor('88', '%'),
      'sensor.monstera_humidity': sensor('38', '%'),
      'sensor.fern_battery': sensor('9', '%')
    }
  },
  temperature: {
    widget,
    states: {
      ...happy,
      'sensor.fern_temperature': sensor('8', '°C'),
      'sensor.cactus_temperature': sensor('90', '°F')
    }
  },
  unavailable: {
    widget,
    states: {
      'sensor.fern_humidity': sensor('unavailable', '%'),
      'sensor.fern_temperature': sensor('unavailable', '°C'),
      'sensor.cactus_humidity': sensor('unknown', '%'),
      'sensor.monstera_humidity': sensor('unavailable', '%')
    }
  },
  missing: {widget, states: {}},
  one: {widget: {plants: [plants[0]]}, states: happy}
};
