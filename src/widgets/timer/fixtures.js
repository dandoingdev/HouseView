// States consumed by the contract and preview harnesses.
const entity = 'timer.test';
const make = (state, attributes = {}, widget = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes}}
});

export const variants = {
  ok: make('idle'),
  active: make('active', {finishes_at: '2026-10-15T09:40:00+00:00', duration: '0:30:00'}),
  // An active timer without finishes_at (some integrations omit it): the countdown falls back to `remaining`.
  activeNoFinish: make('active', {remaining: '0:12:30'}),
  paused: make('paused', {remaining: '00:01:30'}),
  unknown: make('unknown'),
  unavailable: make('unavailable'),
  missing: {widget: {entity}, states: {}},
  named: make(
    'idle',
    {friendly_name: 'Kitchen <b>timer</b>'},
    {name: 'Oven & grill', size: 'wide'}
  ),
  friendly: make('idle', {friendly_name: 'Pasta'})
};
