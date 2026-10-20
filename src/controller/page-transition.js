// The page glide: the old page slides out while the new one slides in (Web Animations API).
// Button navigation uses a short glide; direct manipulation uses full-width neighbouring pages.
// Neighbour pages are built after layout settles so a finger drag only translates.

const INCOMING = {duration: 320, easing: 'cubic-bezier(.22,1,.36,1)'};
const OUTGOING = {duration: 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards'};

export const pageTransitionMixin = {
  /** Cancel running animations and drop the temporary outgoing layer. Idempotent. */
  _clearPageTransition() {
    const rebuild =
      !!(this._swipePreview || this._swipeSpare || this._outgoingPage) &&
      this.isConnected &&
      !this._screensaverCovered?.();
    for (const animation of this._pageAnimations || []) animation.cancel();
    this._pageAnimations = [];
    this._outgoingPage?.remove();
    this._outgoingPage = null;
    this._swipePreview?.element.remove();
    this._swipePreview = null;
    this._swipeSpare?.element.remove();
    this._swipeSpare = null;
    if (this._gesture?.raf) cancelAnimationFrame(this._gesture.raf);
    this._dragFace?.style.removeProperty('transform');
    this._dragFace?.style.removeProperty('will-change');
    this._dragFace = null;
    this._gesture = null;
    // A cancelled drag may have consumed a prefetched neighbour: rebuild once the frame is idle.
    if (rebuild) this._schedulePrefetch();
  },

  /** Drop prepared neighbours (config, resize, cover, disconnect). */
  _dropPagePrefetch() {
    if (this._prefetchFrame) {
      cancelAnimationFrame(this._prefetchFrame);
      this._prefetchFrame = 0;
    }
    for (const entry of this._pagePrefetch?.values() || []) entry.element.remove();
    this._pagePrefetch = null;
  },

  /** One neighbour build on the next frame; coalesces rapid layout and transition clears. */
  _schedulePrefetch() {
    if (this._prefetchFrame) return;
    this._prefetchFrame = requestAnimationFrame(() => {
      this._prefetchFrame = 0;
      this._prefetchNeighbours();
    });
  },

  /**
   * Build the previous and next pages into inert faces while the carousel is idle. A drag then only
   * translates; commit still promotes the face and refreshes state received during the gesture.
   */
  _prefetchNeighbours() {
    if (this._screensaverCovered?.()) {
      this._dropPagePrefetch();
      return;
    }
    if (
      this._dragFace ||
      this._outgoingPage ||
      this._gesture ||
      this._swipePreview ||
      this._swipeSpare
    )
      return;
    const face = this.shadowRoot.querySelector('.face');
    const shell = face?.parentElement;
    if (!face || !shell || !this._screens?.length) return;

    const next = this._pagePrefetch || (this._pagePrefetch = new Map());
    for (const direction of [-1, 1]) {
      const index = this._pageIndex + direction;
      const screen = this._screens[index];
      const existing = next.get(direction);
      if (!screen) {
        existing?.element.remove();
        next.delete(direction);
        continue;
      }
      if (existing?.key === screen.key) continue;
      existing?.element.remove();
      const built = this._buildNeighbourPage(face, screen);
      // Measure grid and dials while attached, then detach so the idle carousel paints one page.
      shell.append(built.element);
      this._positionPageWidgets(built.element, screen);
      built.element.remove();
      next.set(direction, built);
    }
  },

  /** Inert neighbour face with widgets rendered; not yet in the document. */
  _buildNeighbourPage(face, screen) {
    const element = face.cloneNode(false);
    element.classList.add('page-outgoing');
    element.inert = true;
    element.setAttribute('aria-hidden', 'true');
    const cards = new Map();
    this._fillFace(element, screen, cards);
    this._positionPageLayer(element, face);
    element.style.setProperty('--columns', screen.columns);
    element.style.setProperty('--rows', screen.rows);
    return {element, cards, key: screen.key};
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

  /** Take a neighbour for the drag: the idle prefetch when present, otherwise build it now. */
  _takeNeighbour(face, direction) {
    const screen = this._screens[this._pageIndex + direction];
    if (!screen) return null;
    const prefetched = this._pagePrefetch?.get(direction);
    let entry;
    if (prefetched) {
      this._pagePrefetch.delete(direction);
      // Face geometry may have changed since the idle build (header, soft keyboard).
      this._positionPageLayer(prefetched.element, face);
      entry = prefetched;
    } else {
      entry = this._buildNeighbourPage(face, screen);
      this._positionPageWidgets(entry.element, screen);
    }
    entry.element.style.willChange = 'transform';
    entry.element.style.transform = `translate3d(${direction * 100000}px,0,0)`;
    face.parentElement.append(entry.element);
    return entry;
  },

  /**
   * Reveal the neighbour under the finger. Both neighbours stay mounted (off screen) for the whole
   * gesture, so reversing direction only changes which one moves: nothing is rebuilt mid-drag.
   */
  _dragPage(start, dx) {
    // Direct manipulation follows the finger even with reduced motion. Only the
    // automatic settling animation below depends on that accessibility preference.
    const face = start.face || this.shadowRoot.querySelector('.face');
    if (!face) return;
    if (!start.face) {
      start.face = face;
      start.width = face.offsetWidth;
      face.style.willChange = 'transform';
      start.previews = {1: this._takeNeighbour(face, 1), '-1': this._takeNeighbour(face, -1)};
    }
    this._dragFace = face;
    const direction = dx < 0 ? 1 : -1;
    start.direction = direction;
    const active = start.previews[direction];
    const spare = start.previews[-direction];
    this._swipePreview = active;
    this._swipeSpare = spare;
    const width = start.width;
    // Resist pulling past the ends; otherwise the page tracks the finger one-for-one.
    start.dx = active ? Math.max(-width, Math.min(width, dx)) : dx * 0.25;
    face.style.transform = `translate3d(${start.dx}px,0,0)`;
    if (active)
      active.element.style.transform = `translate3d(${start.dx + direction * width}px,0,0)`;
    if (spare) spare.element.style.transform = `translate3d(${-direction * width * 2}px,0,0)`;
  },

  /** Coalesce pointer moves to one layout-free transform write per frame. */
  _queueDrag(start, dx) {
    start.pendingDx = dx;
    if (start.raf) return;
    start.raf = requestAnimationFrame(() => {
      start.raf = 0;
      if (this._gesture === start) this._dragPage(start, start.pendingDx);
    });
  },

  /** Apply the last pointer position now (release / cancel) so the settle starts where the finger was. */
  _flushDrag(start, dx) {
    if (start.raf) cancelAnimationFrame(start.raf);
    start.raf = 0;
    if (start.dragging) this._dragPage(start, dx ?? start.pendingDx ?? 0);
  },

  /** Complete a drag without jumping back to its starting position. Short/cancelled drags spring back. */
  _settlePageDrag(start, step, velocity = 0) {
    if (!start.face) return;
    const {face, width, dx, direction} = start;
    const preview = this._swipePreview;
    const spare = this._swipeSpare;
    this._swipeSpare = null;
    spare?.element.remove();
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
      this._animatePageDrag(
        [
          [face, dx + direction * width, 0],
          [outgoing, dx, -direction * width]
        ],
        Math.abs(dx + direction * width),
        velocity
      );
    } else {
      const layers = [[face, dx, 0]];
      if (preview) layers.push([preview.element, dx + direction * width, direction * width]);
      this._animatePageDrag(layers, Math.abs(dx), velocity);
    }
  },

  /** Finish in proportion to the distance left, faster for a flick (px/ms), 120-260 ms. */
  _animatePageDrag(layers, remaining = 0, velocity = 0) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !layers[0][0].animate) {
      this._clearPageTransition();
      return;
    }
    const byDistance = 120 + Math.min(1, remaining / Math.max(1, layers[0][0].offsetWidth)) * 120;
    const duration = Math.round(
      velocity > 0.3 ? Math.max(120, Math.min(byDistance, remaining / velocity)) : byDistance
    );
    const animations = layers.map(([element, from, to]) =>
      element.animate(
        [{transform: `translate3d(${from}px,0,0)`}, {transform: `translate3d(${to}px,0,0)`}],
        {
          duration,
          easing: 'cubic-bezier(.22,1,.36,1)',
          fill: 'both'
        }
      )
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
