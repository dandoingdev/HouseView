// States used by the contract and preview harnesses and by test.js.
const entity = 'calendar.test';
const make = (state, attributes = {}, widget = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes}}
});

export const variants = {
  ok: make('on', {
    message: 'Dentist',
    start_time: '2026-10-16 09:30:00',
    all_day: false,
    friendly_name: 'Family'
  }),
  allDay: make('off', {message: 'Bank holiday', start_time: '2026-10-26 00:00:00', all_day: true}),
  noEvent: make('off', {}),
  badStart: make('on', {message: 'Mystery', start_time: 'not a date'}),
  named: make('on', {message: 'Dentist', start_time: '2026-10-16 09:30:00'}, {name: 'Family & co'}),
  hostile: make('on', {message: '<img src=x onerror=alert(1)>', friendly_name: '<b>x</b>'}),
  wide: make('on', {message: 'Dentist', start_time: '2026-10-16 09:30:00'}, {size: 'wide'}),
  unavailable: make('unavailable', {message: 'Hidden', start_time: '2026-10-16 09:30:00'}),
  unknown: make('unknown', {}),
  missing: {widget: {entity}, states: {}}
};
