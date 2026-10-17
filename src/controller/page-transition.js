// The page glide: the old page slides out while the new one slides in (Web Animations API).
// Button navigation uses a short glide; direct manipulation uses full-width neighbouring pages.

const INCOMING = {duration: 320, easing: 'cubic-bezier(.22,1,.36,1)'};
const OUTGOING = {duration: 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards'};

export const pageTransitionMixin = {
  /** Cancel running animations and drop the temporary outgoing layer. Idempotent. */
  _clearPageTransition() {
    for (const animation of this._pageAnimations || []) animation.cancel();
    this._pageAnimations = [];
    this._outgoingPage?.remove();
    this._outgoingPage = null;
    this._swipePreview?.element.remove();
    this._swipePreview = null;
    this._dragFace?.style.removeProperty('transform');
    this._dragFace?.style.removeProperty('will-change');
    this._dragFace = null;
    this._gesture = null;
  },

  /**
   * Move the old widgets into a temporary, inert copy of the face. The widgets are moved, not cloned, so
   * cameras and interactive controls are never duplicated.
   * @param {Element} face
   * @returns {Element} the outgoing layer (not yet in the document)
   */
  _prepareOutgoingPage(face) {
    const outgoing = face.cloneNode(false);
    outgoing.classList.add('page-outgoing');
    outgoing.inert = true;
    outgoing.setAttribute('aria-hidden', 'true');
    outgoing.removeAttribute('aria-label');
    this._positionPageLayer(outgoing, face);
    outgoing.append(...face.childNodes);
    return outgoing;
  },

  /** Match the content rectangle, including the header offset, instead of the shell's top edge. */
  _positionPageLayer(layer, face) {
    layer.style.removeProperty('transform');
    for (const [property, value] of [
      ['top', face.offsetTop || 0],
      ['left', face.offsetLeft || 0],
      ['width', face.offsetWidth || face.getBoundingClientRect().width],
      ['height', face.offsetHeight || face.getBoundingClientRect().height]
    ])
      layer.style.setProperty(property, `${value}px`, 'important');
    layer.style.setProperty('margin', '0', 'important');
    layer.style.setProperty('right', 'auto', 'important');
  },

  /** Render only the neighbour being revealed. It is inert and has no live widget hooks until committed. */
  _dragPage(start, dx) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const face = start.face || this.shadowRoot.querySelector('.face');
    if (!face) return;
    start.face = face;
    this._dragFace = face;
    start.width ||= face.offsetWidth;
    const direction = dx < 0 ? 1 : -1;
    const next = this._pageIndex + direction;
    const screen = this._screens[next];
    if (start.direction !== direction) {
      this._swipePreview?.element.remove();
      this._swipePreview = null;
      start.direction = direction;
      if (screen) {
        const element = face.cloneNode(false);
        element.classList.add('page-outgoing');
        element.inert = true;
        const cards = new Map();
        this._fillFace(element, screen, cards);
        element.setAttribute('aria-hidden', 'true');
        this._positionPageLayer(element, face);
        element.style.setProperty('--columns', screen.columns);
        element.style.setProperty('--rows', screen.rows);
        face.parentElement.append(element);
        this._positionPageWidgets(element, screen);
        this._swipePreview = {element, cards};
      }
    }
    // Resist pulling past the ends; otherwise the page tracks the finger one-for-one.
    start.dx = screen ? Math.max(-start.width, Math.min(start.width, dx)) : dx * 0.25;
    face.style.willChange = 'transform';
    face.style.transform = `translateX(${start.dx}px)`;
    if (this._swipePreview)
      this._swipePreview.element.style.transform = `translateX(${start.dx + direction * start.width}px)`;
  },

  /** Complete a drag without jumping back to its starting position. Short/cancelled drags spring back. */
  _settlePageDrag(start, step) {
    if (!start.face) return;
    const {face, width, dx, direction} = start;
    const preview = this._swipePreview;
    const commit = step === direction && !!preview && !this._navigationBlocked();
    if (commit) {
      // Keep both sets of real elements. Moving the preview into place avoids a second paint of its widgets.
      this._swipePreview = null;
      const outgoing = this._prepareOutgoingPage(face);
      this._pageIndex += direction;
      this._screenKey = this._screens[this._pageIndex].key;
      this._renderWidgets(preview);
      preview.element.remove();
      face.parentElement.append(outgoing);
      this._outgoingPage = outgoing;
      this._animatePageDrag([
        [face, dx + direction * width, 0],
        [outgoing, dx, -direction * width]
      ]);
    } else {
      const layers = [[face, dx, 0]];
      if (preview) layers.push([preview.element, dx + direction * width, direction * width]);
      this._animatePageDrag(layers);
    }
  },

  _animatePageDrag(layers) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !layers[0][0].animate) {
      this._clearPageTransition();
      return;
    }
    const animations = layers.map(([element, from, to]) =>
      element.animate([{transform: `translateX(${from}px)`}, {transform: `translateX(${to}px)`}], {
        duration: 220,
        easing: 'cubic-bezier(.22,1,.36,1)',
        fill: 'both'
      })
    );
    this._pageAnimations = animations;
    animations[0].finished.then(
      () => {
        if (this._pageAnimations === animations) this._clearPageTransition();
      },
      () => {}
    );
  },

  /**
   * Start the glide. `face` already shows the new page; `outgoing` holds the old one.
   * @param {1|-1} direction  1 = towards a later page
   */
  _glidePage(face, outgoing, direction) {
    face.parentElement.append(outgoing);
    this._outgoingPage = outgoing;
    const incoming = face.animate(
      [
        {transform: `translateX(${direction * 48}px)`, opacity: 0},
        {transform: 'translateX(0)', opacity: 1}
      ],
      INCOMING
    );
    const leaving = outgoing.animate(
      [
        {transform: 'translateX(0)', opacity: 1},
        {transform: `translateX(${-direction * 36}px)`, opacity: 0}
      ],
      OUTGOING
    );
    this._pageAnimations = [incoming, leaving];
    incoming.finished.then(
      () => {
        if (this._outgoingPage === outgoing) this._clearPageTransition();
      },
      () => {}
    );
  }
};
