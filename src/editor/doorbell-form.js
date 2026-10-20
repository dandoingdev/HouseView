// The "Doorbell camera" section of the carousel editor: the doorbell entity, the camera to show when it rings and for how
// long (docs/overviews/doorbell.md). Pure functions, no DOM: carousel-editor.js renders the <ha-form> and calls these.
import {getOverview} from '../core/overview-registry.js';
import {field} from './form.js';

export const DEFAULT_DURATION = 30;
const DOORBELL_DOMAINS = ['binary_sensor', 'event', 'button', 'input_button', 'input_boolean'];

/** The section means something when the doorbell overview is in the bundle, or the config already has the key. */
export const showDoorbell = (config) => !!getOverview('doorbell') || config.doorbell !== undefined;

export const doorbellData = (config) => ({
  doorbell_entity: config.doorbell?.entity ?? '',
  doorbell_camera: config.doorbell?.camera ?? '',
  doorbell_duration: config.doorbell?.duration ?? DEFAULT_DURATION
});

export const doorbellSchema = () => [
  field('doorbell_entity', {entity: {domain: DOORBELL_DOMAINS}}),
  field('doorbell_camera', {entity: {domain: 'camera'}}),
  field('doorbell_duration', {
    number: {min: 5, max: 600, step: 5, mode: 'box', unit_of_measurement: 's'}
  })
];

/**
 * Form value -> new card config. With no doorbell entity the whole key goes. The duration is only written when it is not
 * the default, and any other key a hand-written `doorbell` object carries (such as `name`) stays.
 */
export function applyDoorbell(config, value) {
  const next = {...config};
  const entity = value.doorbell_entity || '';
  if (!entity) {
    delete next.doorbell;
    return next;
  }
  const doorbell = {...config.doorbell, entity};
  if (value.doorbell_camera) doorbell.camera = value.doorbell_camera;
  else delete doorbell.camera;
  const duration = value.doorbell_duration;
  if (duration && duration !== DEFAULT_DURATION) doorbell.duration = duration;
  else delete doorbell.duration;
  next.doorbell = doorbell;
  return next;
}
