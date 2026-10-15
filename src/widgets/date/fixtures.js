// States used by the contract and preview harnesses and by test.js.
// The date widget has no entity, so every variant has an empty state table; variants differ in sizing and in the
// config keys the widget must ignore. The harnesses pin the clock, so the output is deterministic there.
const make = (widget = {}) => ({widget, states: {}});

export const variants = {
  ok: make(),
  wide: make({size: 'wide'}),
  tall: make({size: 'tall'}),
  large: make({size: 'large'}),
  // The tile never shows a name; the config key is accepted and ignored.
  named: make({name: '<b>"Today" & co</b>'}),
  // An entity on a no-entity widget is ignored as well (and never makes the tile unavailable).
  strayEntity: {widget: {entity: 'sensor.test'}, states: {}}
};
