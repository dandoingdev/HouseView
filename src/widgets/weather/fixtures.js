// States used by the contract and preview harnesses and by test.js.
const entity = 'weather.test';
const make = (state, attributes = {}, widget = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes}}
});

export const variants = {
  ok: make('sunny', {temperature: 21.5, temperature_unit: '°C'}),
  clear: make('clear', {temperature: 9, temperature_unit: '°C'}),
  partlycloudy: make('partlycloudy', {temperature: 15, temperature_unit: '°C'}),
  cloudy: make('cloudy', {temperature: 12, temperature_unit: '°C'}),
  rainy: make('rainy', {temperature: 11, temperature_unit: '°C'}),
  pouring: make('pouring', {temperature: 10, temperature_unit: '°C'}),
  snowy: make('snowy', {temperature: -2, temperature_unit: '°C'}),
  fog: make('fog', {temperature: 5, temperature_unit: '°C'}),
  windy: make('windy', {temperature: 8, temperature_unit: '°C'}),
  // Hyphenated condition: shown with a space, icon falls back to partly cloudy.
  lightningRainy: make('lightning-rainy', {temperature: 14, temperature_unit: '°C'}),
  // Unknown condition names use the fallback icon.
  exceptional: make('exceptional', {temperature: 30, temperature_unit: '°C'}),
  fahrenheit: make('cloudy', {temperature: 68, temperature_unit: '°F'}),
  // No temperature_unit: the hass unit system supplies it.
  noUnit: make('sunny', {temperature: 18}),
  noTemperature: make('sunny', {}),
  stringTemperature: make('sunny', {temperature: '17', temperature_unit: '°C'}),
  customName: make('sunny', {temperature: 20, temperature_unit: '°C'}, {name: 'Garden'}),
  hostileName: make(
    'sunny',
    {temperature: 20, temperature_unit: '°C'},
    {name: '<b>"Sky" & co</b>'}
  ),
  wide: make('rainy', {temperature: 11, temperature_unit: '°C'}, {size: 'wide'}),
  unavailable: make('unavailable'),
  unknown: make('unknown', {temperature: 12, temperature_unit: '°C'}),
  missing: {widget: {entity}, states: {}}
};
