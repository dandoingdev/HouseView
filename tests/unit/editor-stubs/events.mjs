// Test stand-in for src/core/events.js (the standard Home Assistant fireEvent).
const {CustomEvent} = globalThis;

export function fireEvent(node, type, detail, options) {
  const event = new CustomEvent(type, {
    bubbles: options?.bubbles ?? true,
    cancelable: options?.cancelable ?? false,
    composed: options?.composed ?? true,
    detail
  });
  node.dispatchEvent(event);
  return event;
}
