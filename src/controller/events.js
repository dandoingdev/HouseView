import {bindValueActions} from './value-actions.js';

// DOM event delegation on the card's shadow root: swipe, keyboard, and clicks on `button[data-action]`.
// One listener per event type for the whole card; tiles carry no handlers of their own.
//
// The order of work in each handler is the original order, including `_suppressClickUntil`: after a swipe (or a
// gesture, or a screensaver wake) the click that the browser still fires is swallowed so it cannot press the
// control under the finger.

/** Typing in a form control must not turn pages. */
const TEXT_ENTRY_TAGS = ['INPUT', 'SELECT', 'TEXTAREA'];

/**
 * Attach the card's listeners to its shadow root.
 * @param {any} card  a HouseViewCard
 */
export function bindEvents(card) {
  const root = card.shadowRoot;
  bindValueActions(card, root);

  root.addEventListener('pointerdown', (event) => {
    card._swipeStart(event);
    card._extensionPointerDown(event);
    card._gesturePointerDown(event);
  });

  root.addEventListener('pointermove', (event) => card._gesturePointerMove(event));

  root.addEventListener('pointerup', (event) => {
    card._swipeEnd(event);
    card._gesturePointerUp(event);
  });

  root.addEventListener('pointercancel', () => {
    card._gesture = null;
    card._gesturePointerCancel();
  });

  root.addEventListener('contextmenu', (event) => card._gestureContextMenu(event));

  root.addEventListener('keydown', (event) => {
    if (TEXT_ENTRY_TAGS.includes(event.target.tagName)) return;
    // An extension that owns the screen (the camera gallery) gets the key first
    if (card._extensionKeydown(event)) return;
    if (card._navigationBlocked()) return;
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      card._gestureContextMenu(event);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      card._setPage((card._pageIndex || 0) + 1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      card._setPage((card._pageIndex || 0) - 1);
    }
  });

  root.addEventListener('click', (event) => {
    if (Date.now() < (card._suppressClickUntil || 0)) {
      event.preventDefault();
      return;
    }
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    if (button.dataset.action === 'page-select') card._setPage(Number(button.dataset.page));
    else if (!card._runTapAction(button)) card._act(button.dataset.action, button.dataset.entity);
  });
}
