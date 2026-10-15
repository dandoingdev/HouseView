// DOM events the card fires towards Home Assistant.

/**
 * Dispatch a CustomEvent on `node`. Home Assistant events must bubble and cross shadow roots.
 * @param {EventTarget} node
 * @param {string} type
 * @param {any} [detail]
 * @param {{bubbles?: boolean, composed?: boolean, cancelable?: boolean}} [options]
 */
export function fireEvent(node, type, detail, options = {}) {
  const {bubbles = true, composed = true, cancelable = false} = options;
  const event = new CustomEvent(type, {detail, bubbles, composed, cancelable});
  node.dispatchEvent(event);
  return event;
}

/** Ask the Home Assistant frontend to open the more-info dialog of an entity. */
export function moreInfo(node, entityId) {
  return fireEvent(node, 'hass-more-info', {entityId});
}
