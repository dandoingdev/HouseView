// Variants for tests, previews and screenshots. Data only, imports nothing.
// The overview reads the carousel's widget list (`config.widgets`), so every variant carries one. The home widget is first.
const HOME = {type: 'home_overview', page: 'Home', size: 'large'};
const NOW = '2026-10-15T10:09:00+01:00';
const TWO_MINUTES_AGO = '2026-10-15T10:07:00+01:00';

const widgets = {
  climate: {type: 'climate', entity: 'climate.living_room'},
  climate2: {type: 'climate', entity: 'climate.bedroom'},
  light: {type: 'light', entity: 'light.kitchen'},
  light2: {type: 'light', entity: 'light.hall'},
  light3: {type: 'light', entity: 'light.porch'},
  lock: {type: 'lock', entity: 'lock.front_door'},
  media: {type: 'media_player', entity: 'media_player.kitchen_speaker'},
  camera: {type: 'camera', entity: 'camera.front_door', name: 'Front door'},
  scene: {type: 'action', entity: 'scene.evening', name: 'Evening'},
  scene2: {type: 'action', entity: 'scene.movie', icon: 'mdi:movie'},
  script: {type: 'action', entity: 'script.good_night'}
};

const states = {
  'climate.living_room': {
    state: 'heat',
    attributes: {friendly_name: 'Living room', current_temperature: 20.4, temperature: 21}
  },
  'climate.bedroom': {
    state: 'heat',
    attributes: {friendly_name: 'Bedroom', current_temperature: 22.2, temperature: 21}
  },
  'light.kitchen': {state: 'on', attributes: {friendly_name: 'Kitchen'}},
  'light.hall': {state: 'on', attributes: {friendly_name: 'Hall'}},
  'light.porch': {state: 'off', attributes: {friendly_name: 'Porch'}},
  'lock.front_door': {state: 'locked', attributes: {friendly_name: 'Front door lock'}},
  'media_player.kitchen_speaker': {
    state: 'playing',
    attributes: {friendly_name: 'Kitchen speaker'}
  },
  'camera.front_door': {
    state: 'idle',
    last_updated: TWO_MINUTES_AGO,
    attributes: {
      friendly_name: 'Front door',
      entity_picture: '/api/camera_proxy/camera.front_door?token=t'
    }
  },
  'scene.evening': {state: 'unknown', attributes: {friendly_name: 'Evening'}},
  'scene.movie': {state: 'unknown', attributes: {friendly_name: 'Movie'}},
  'script.good_night': {state: 'off', attributes: {friendly_name: 'Good night'}}
};

const make = (list, extra = {}) => ({
  options: {},
  states: structuredClone(states),
  config: {preview_time: NOW, widgets: [HOME, ...list], ...extra}
});

const everything = [
  widgets.climate,
  widgets.climate2,
  widgets.light,
  widgets.light2,
  widgets.light3,
  widgets.lock,
  widgets.media,
  widgets.camera,
  widgets.scene,
  widgets.scene2,
  widgets.script
];

export const variants = {
  ok: make(everything),
  // no widget at all: a calm line
  empty: make([]),
  // only some kinds: the others have no chip and no section
  lightsOnly: make([widgets.light, widgets.light2, widgets.light3]),
  camerasAndGallery: make([widgets.camera], {camera_gallery: [{entity: 'camera.front_door'}]}),
  scenesOnly: make([widgets.scene, widgets.scene2, widgets.script]),
  noTime: {...make(everything), options: {show_time: false, title: 'My Home'}},
  // a lock is open: the amber chip
  unlocked: (() => {
    const v = make([widgets.lock]);
    v.states['lock.front_door'].state = 'unlocked';
    return v;
  })(),
  // nothing is known
  unavailable: (() => {
    const v = make(everything);
    for (const state of Object.values(v.states)) state.state = 'unavailable';
    return v;
  })()
};
