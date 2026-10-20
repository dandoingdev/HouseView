// Variants for tests, previews and screenshots. Data only, imports nothing.
// Fixed clock: 2026-10-15 10:09:00 Europe/London; the doorbell rang `ago` seconds before it.
export const NOW = '2026-10-15T10:09:00+01:00';
const entity = 'binary_sensor.front_doorbell';
const camera = 'camera.front_door';
const at = (seconds) => new Date(Date.parse(NOW) + seconds * 1000).toISOString();

const states = (doorbell) => ({
  [entity]: {
    state: 'on',
    last_changed: at(-5),
    attributes: {friendly_name: 'Doorbell'},
    ...doorbell
  },
  [camera]: {
    state: 'idle',
    attributes: {
      friendly_name: 'Front door',
      entity_picture: '/api/camera_proxy/camera.front_door?token=abc'
    }
  }
});

const make = (doorbell = {}, options = {}) => ({
  options: {entity, camera, ...options},
  states: states(doorbell),
  config: {preview_time: NOW}
});

export const variants = {
  ok: make(),
  noCamera: {options: {entity}, states: states({}), config: {preview_time: NOW}},
  longAgo: make({last_changed: at(-120)}),
  off: make({state: 'off'}),
  short: make({last_changed: at(-8)}, {duration: 5}),
  eventEntity: {
    options: {entity: 'event.doorbell', camera},
    states: {
      ...states({}),
      'event.doorbell': {state: at(-3), attributes: {friendly_name: 'Doorbell'}}
    },
    config: {preview_time: NOW}
  },
  unavailable: make({state: 'unavailable'}),
  unknown: make({state: 'unknown'}),
  missing: {options: {entity, camera}, states: {}, config: {preview_time: NOW}}
};
