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
  color: make('on', {rgb_color: [255, 140, 60]}),
  off: make('off'),
  onoff: make('on', {supported_color_modes: ['onoff'], brightness: undefined}),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {options: {entity}, states: {}}
};
