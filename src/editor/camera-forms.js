// The four camera slots of the carousel editor ("Camera grid"): ha-form data/schema per slot and the pure rule
// that merges one slot's form value into `camera_gallery`. The DOM is built by carousel-editor.js.
import {field, textField} from './form.js';

export const CAMERA_SLOTS = 4;

/** Translation keys of the slot headings (editor/strings.js). */
export const slotHeadingKey = (slot) => `editor.camera_slot.${slot}`;

/** Gallery entries with their slot made explicit: an entry without `slot` takes its list position. */
const withSlots = (gallery = []) =>
  gallery.map((camera, index) => ({...camera, slot: camera.slot ?? index}));

/** The configured camera of `slot`, if any. */
export const cameraAt = (gallery = [], slot = 0) =>
  gallery.find((camera, index) => (camera.slot ?? index) === slot);

/** ha-form data for a slot. */
export function slotData(gallery, slot) {
  const existing = cameraAt(gallery, slot);
  return {...existing, entity: existing?.entity || '', stream: existing?.stream || false};
}

export const slotSchema = () => [
  field('entity', {entity: {domain: ['camera']}}),
  textField('name'),
  field('stream', {boolean: {}})
];

/**
 * Merge a slot's form value into the gallery.
 * @returns {{gallery?:Object[], error?:'select_camera'|'camera_duplicate'}} `gallery` is undefined when the
 *   result is empty (the caller deletes `camera_gallery`); `error` is a strings.js suffix (`editor.<error>`)
 */
export function applySlot(gallery, slot, value) {
  if (value.entity && !value.entity.startsWith('camera.')) return {error: 'select_camera'};
  const others = withSlots(gallery).filter((camera) => camera.slot !== slot);
  if (value.entity && others.some((camera) => camera.entity === value.entity)) {
    return {error: 'camera_duplicate'};
  }
  if (value.entity) {
    others.push({entity: value.entity, name: value.name || '', stream: !!value.stream, slot});
  }
  others.sort((a, b) => a.slot - b.slot);
  return {gallery: others.length ? others : undefined};
}
