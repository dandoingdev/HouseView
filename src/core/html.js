// Markup helpers shared by the widget context and the widgets.
// The output of these functions is part of the markup contract: tests pin it byte for byte.

const ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};

/** HTML-escape a value for text and attribute positions. null and undefined become ''. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** True for finite numbers only (not numeric strings, NaN or Infinity). */
export function num(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * `<ha-icon>` for an icon name. A bare name gets the `mdi:` prefix; a name that already carries a prefix
 * (`mdi:lamp`, `hass:lightbulb`, `phu:bulb`) is used as it is.
 */
export function iconHTML(name) {
  const icon = String(name ?? '');
  const id = icon.includes(':') ? icon : `mdi:${icon}`;
  return `<ha-icon icon="${esc(id)}" aria-hidden="true"></ha-icon>`;
}

/**
 * A `<button data-action>`. `attrs` is '' or a string that ends with one space (it is written before `class`).
 * The button is disabled when it is not enabled or when its entity has a service call in flight.
 */
export function buttonHTML(
  action,
  entity,
  content,
  cls = '',
  enabled = true,
  {pending = false, attrs = ''} = {}
) {
  const disabled = !enabled || pending ? 'disabled' : '';
  return `<button ${attrs}class="${cls}" data-action="${action}" data-entity="${esc(entity)}" ${disabled}>${content}</button>`;
}
