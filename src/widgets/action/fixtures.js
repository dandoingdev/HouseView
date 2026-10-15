// States used by the contract and preview harnesses and by test.js.
const make = (entity, state, widget = {}, attributes = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes}}
});

export const variants = {
  ok: make('scene.test', 'scening'),
  sceneUnknown: make('scene.test', 'unknown'),
  script: make('script.test', 'off'),
  scriptRunning: make('script.test', 'on'),
  scriptUnknown: make('script.test', 'unknown'),
  button: make('button.test', 'unknown'),
  inputButton: make('input_button.test', '2026-10-15T10:10:00+00:00'),
  buttonUnavailable: make('button.test', 'unavailable'),
  note: make('script.test', 'off', {note: 'Tap & hold <b>"now"</b>'}),
  customIcon: make('scene.test', 'scening', {icon: 'mdi:lamps', name: 'Evening'}),
  entityIcon: make('scene.test', 'scening', {}, {icon: 'mdi:sofa', friendly_name: 'Movie'}),
  foreignIcon: make('scene.test', 'scening', {icon: 'hass:lightbulb'}),
  // Characters that must be escaped in the name.
  hostileName: make('scene.test', 'scening', {name: '<b>"Scene" & co</b>'}),
  unavailable: make('scene.test', 'unavailable'),
  missing: {widget: {entity: 'scene.test'}, states: {}}
};
