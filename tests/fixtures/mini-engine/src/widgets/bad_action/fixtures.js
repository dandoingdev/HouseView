export const variants = {
  ok: {
    widget: {entity: 'light.t'},
    states: {'light.t': {state: 'on', attributes: {friendly_name: 'T'}}}
  },
  unavailable: {widget: {entity: 'light.t'}, states: {'light.t': {state: 'unavailable'}}},
  missing: {widget: {entity: 'light.t'}, states: {}}
};
