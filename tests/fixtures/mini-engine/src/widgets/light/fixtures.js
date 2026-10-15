const entity = 'light.test';
const make = (state, widget = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes: {}}}
});
export const variants = {
  ok: make('on'),
  off: make('off'),
  actionOff: make('on', {action: 'off'}),
  yamlFalse: make('on', {action: false}),
  customIcon: make('on', {icon: 'mdi:ceiling-light-outline', name: 'Hall'}),
  foreignIcon: make('on', {icon: 'hass:lightbulb'}),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {widget: {entity}, states: {}}
};
