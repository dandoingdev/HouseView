// States consumed by the contract and preview harnesses.
const entity = 'cover.test';
const make = (state, attributes, widget = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes}}
});

export const variants = {
  ok: make('open', {current_position: 40, supported_features: 15}),
  closed: make('closed', {current_position: 0, supported_features: 15}),
  opening: make('opening', {supported_features: 15}),
  noPosition: make('open', {supported_features: 15}),
  fractional: make('open', {current_position: 33.6, supported_features: 15}),
  unknown: make('unknown', {supported_features: 15}),
  unknownPosition: make('unknown', {current_position: 70, supported_features: 15}),
  openOnly: make('open', {supported_features: 1}),
  closeOnly: make('closed', {supported_features: 2}),
  stopOnly: make('open', {supported_features: 8}),
  noFeatures: make('open', {}),
  named: make(
    'open',
    {current_position: 100, supported_features: 15},
    {name: 'Kitchen & <b>Bay</b>'}
  ),
  unavailable: make('unavailable', {}),
  missing: {widget: {entity}, states: {}}
};
