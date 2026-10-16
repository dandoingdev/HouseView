// In-place DOM patcher for widget markup (a small morphing patcher).
// Updating a tile by patching instead of replacing keeps keyboard focus, loaded images and running
// animations alive across state updates.

export const patchMixin = {
  /**
   * Make `current` look like `next` with as few DOM writes as possible.
   * @param {Node} current  the node on the page
   * @param {Node} next     the freshly parsed target
   * @param {boolean} [root]  the tile root: its inline style (grid placement) belongs to the layout, not the markup
   */
  _patchNode(current, next, root = false) {
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
      current.replaceWith(next.cloneNode(true));
      return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.textContent !== next.textContent) current.textContent = next.textContent;
      return;
    }
    if (current.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of [...current.attributes]) {
      if (!(root && attr.name === 'style') && !next.hasAttribute(attr.name)) {
        current.removeAttribute(attr.name);
      }
    }
    for (const attr of next.attributes) {
      if (current.getAttribute(attr.name) !== attr.value)
        current.setAttribute(attr.name, attr.value);
    }
    // Walk siblings directly: state updates visit whole subtrees, so avoid two temporary arrays per element.
    // Capture the sibling before patching because a tag/type change can replace the current child.
    let child = current.firstChild;
    for (let desired = next.firstChild; desired; desired = desired.nextSibling) {
      if (child) {
        const sibling = child.nextSibling;
        this._patchNode(child, desired);
        child = sibling;
      } else current.append(desired.cloneNode(true));
    }
    while (child) {
      const sibling = child.nextSibling;
      child.remove();
      child = sibling;
    }
  }
};
