// The page glide: the old page slides out while the new one slides in (Web Animations API).
// The keyframes and durations are asserted by the browser suite; do not "tidy" them.

const INCOMING = {duration: 320, easing: 'cubic-bezier(.22,1,.36,1)'};
const OUTGOING = {duration: 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards'};

export const pageTransitionMixin = {
  /** Cancel running animations and drop the temporary outgoing layer. Idempotent. */
  _clearPageTransition() {
    for (const animation of this._pageAnimations || []) animation.cancel();
    this._pageAnimations = [];
    this._outgoingPage?.remove();
    this._outgoingPage = null;
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
    outgoing.style.setProperty('height', `${face.getBoundingClientRect().height}px`, 'important');
    outgoing.append(...face.childNodes);
    return outgoing;
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
