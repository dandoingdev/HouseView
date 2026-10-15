// States consumed by the contract and preview harnesses and the widget tests.
const entity = 'camera.test';
const picture = '/api/camera_proxy/camera.test?token=abc123';

const make = (state, attributes = {}, widget = {}, config) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes}},
  ...(config ? {config} : {})
});

const gallery = (...entities) => ({
  camera_gallery: entities.map((id, slot) => ({entity: id, slot}))
});

/** A gallery of four cameras, each with a picture; `camera.test` is the first. */
const fourCameras = {
  states: Object.fromEntries(
    ['test', 'porch', 'garden', 'garage'].map((name) => [
      `camera.${name}`,
      {
        state: 'idle',
        attributes: {
          friendly_name: `${name[0].toUpperCase()}${name.slice(1)} camera`,
          entity_picture: `/api/camera_proxy/camera.${name}?token=t-${name}`
        }
      }
    ])
  ),
  config: gallery('camera.test', 'camera.porch', 'camera.garden', 'camera.garage')
};

export const variants = {
  ok: make('idle', {friendly_name: 'Front door', entity_picture: picture}),
  streaming: make('streaming', {friendly_name: 'Front door', entity_picture: picture}),
  noPicture: make('idle', {friendly_name: 'Front door'}),
  foreignPicture: make('idle', {
    entity_picture: 'https://example.com/camera_proxy/camera.test?token=x'
  }),
  notProxyPicture: make('idle', {entity_picture: '/local/snapshot.jpg'}),
  named: make('idle', {entity_picture: picture}, {name: 'Drive & <b>Gate</b>'}),
  unnamed: make('idle', {}),
  unavailable: make('unavailable'),
  unknown: make('unknown', {entity_picture: picture}),
  missing: {widget: {entity}, states: {}},
  withGallery: {
    widget: {entity},
    states: fourCameras.states,
    config: fourCameras.config
  },
  galleryOffline: {
    widget: {entity},
    states: {...fourCameras.states, [entity]: {state: 'unavailable', attributes: {}}},
    config: fourCameras.config
  },
  galleryMixed: {
    widget: {entity},
    states: {...fourCameras.states, 'camera.garage': {state: 'unavailable', attributes: {}}},
    config: {
      camera_gallery: [
        {entity: 'camera.test', name: 'Door <b>1</b>', slot: 0},
        {entity: 'camera.porch', stream: true, slot: 3},
        {entity: 'camera.garage', slot: 1}
      ]
    }
  },
  gallerySingle: {
    widget: {entity},
    states: fourCameras.states,
    config: gallery('camera.test')
  },
  // /camera_proxy/preview.svg is served by tools/serve.mjs, so the picture really loads in the browser tests.
  loads: make('idle', {entity_picture: '/camera_proxy/preview.svg?token=t'}),
  galleryMissing: {
    widget: {entity},
    states: {},
    config: gallery('camera.test')
  }
};
