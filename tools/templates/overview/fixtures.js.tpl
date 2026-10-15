const entity = '{{firstDomain}}.test';
export const variants = {
  ok: {options: {entity}, states: {[entity]: {state: 'on', attributes: {friendly_name: 'Test'}}}},
  unavailable: {options: {entity}, states: {[entity]: {state: 'unavailable', attributes: {}}}},
  unknown: {options: {entity}, states: {[entity]: {state: 'unknown', attributes: {}}}},
  missing: {options: {entity}, states: {}}
};
