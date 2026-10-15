const entity = 'cover.test';
const make = (state, attributes) => ({widget: {entity}, states: {[entity]: {state, attributes}}});
export const variants = {
  ok: make('open', {current_position: 40, supported_features: 15}),
  closed: make('closed', {current_position: 0, supported_features: 15}),
  noPosition: make('open', {supported_features: 15}),
  unknown: make('unknown', {supported_features: 15}),
  openOnly: make('open', {supported_features: 1}),
  stopOnly: make('open', {supported_features: 8}),
  unavailable: make('unavailable', {}),
  missing: {widget: {entity}, states: {}}
};
