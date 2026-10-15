// States consumed by the contract and preview harnesses.
// Provide at least ok, unavailable, missing and (when meaningful) unknown, plus one variant per state
// or feature branch that render or the actions read.
const entity = '{{firstDomain}}.test';
const make = (state, widget = {}, attributes = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes}}
});

export const variants = {
  ok: make('on'),
  off: make('off'),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {widget: {entity}, states: {}}
};
