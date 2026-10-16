const entity = 'light.test';
const make = (state = 'on', attributes = {}, options = {}) => ({
  options: {entity, ...options},
  states: {
    [entity]: {
      state,
      attributes: {
        friendly_name: 'Living room',
        brightness: 82,
        supported_color_modes: ['brightness'],
        ...attributes
      }
    }
  }
});
export const variants = {
  ok: make(),
  color: make('on', {
    rgb_color: [255, 140, 60],
    hs_color: [25, 76],
    supported_color_modes: ['xy', 'color_temp'],
    min_color_temp_kelvin: 2200,
    max_color_temp_kelvin: 6500
  }),
  off: make('off'),
  onoff: make('on', {supported_color_modes: ['onoff'], brightness: undefined}),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {options: {entity}, states: {}}
};
