// Tiny DOM helpers for overview hooks (tick/afterRender). They are safe to call when the element is gone.

/** Set textContent only when it changed (no style or layout work on identical text). */
export function setText(root, selector, text) {
  const node = root?.querySelector(selector);
  if (node && node.textContent !== text) node.textContent = text;
}
