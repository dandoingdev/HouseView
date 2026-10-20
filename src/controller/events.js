import {bindValueActions} from './value-actions.js';

// DOM event delegation on the card's shadow root: swipe, keyboard, and clicks on `button[data-action]`.
// One listener per event type for the whole card; tiles carry no handlers of their own.
//
// The order of work in each handler is the original order, including `_suppressClickUntil`: after a swipe (or a
// gesture, or a screensaver wake) the click that the browser still fires is swallowed so it cannot press the
// control under the finger.

/** Typing in a form control must not turn pages. */
const TEXT_ENTRY_TAGS = ['INPUT', 'SELECT', 'TEXTAREA'];

/** Holding the previous / next arrow this long jumps to the first / last page; holding a page dot opens the page menu. */
const NAV_HOLD_MS = 500;

/**
 * Attach the card's listeners to its shadow root.
 * @param {any} card  a HouseViewCard
 */
export function bindEvents(card) {
  const root = card.shadowRoot;
  bindValueActions(card, root);

  let navHold = null;
  const clearNavHold = () => {
    clearTimeout(navHold);
    navHold = null;
  };

  root.addEventListener('pointerdown', (event) => {
    clearNavHold();
    const arrow = event.target.closest?.(
      'button[data-action="page-prev"],button[data-action="page-next"]'
    );
    if (arrow && !arrow.disabled && event.isPrimary !== false) {
      const first = arrow.dataset.action === 'page-prev';
      navHold = setTimeout(() => {
        navHold = null;
        card._suppressClickUntil = Date.now() + 600;
        card._setPage(first ? 0 : Infinity);
      }, NAV_HOLD_MS);
    }
    const dot = event.target.closest?.('button.page-dot');
    if (dot && !dot.disabled && event.isPrimary !== false) {
      navHold = setTimeout(() => {
        navHold = null;
        card._swipeCancel();
        card._suppressClickUntil = Date.now() + 300;
        card._openPageMenu();
      }, NAV_HOLD_MS);
    }
    card._swipeStart(event);
    card._extensionPointerDown(event);
    card._gesturePointerDown(event);
  });

  root.addEventListener('pointermove', (event) => {
    if (navHold && card._gesture?.dragging) clearNavHold();
    card._gesturePointerMove(event);
    card._swipeMove(event);
  });

  root.addEventListener('pointerup', (event) => {
    clearNavHold();
    card._swipeEnd(event);
    card._gesturePointerUp(event);
  });

  root.addEventListener('pointercancel', () => {
    clearNavHold();
    card._swipeCancel();
    card._gesturePointerCancel();
  });

  // A downward pull starts in the top band. Claiming the touch keeps the browser from treating it as a scroll
  // and cancelling the pointer before the home summary can open.
  root.addEventListener(
    'touchmove',
    (event) => {
      if (!card._gesture?.homeEdge || !event.cancelable) return;
      event.preventDefault();
    },
    {passive: false}
  );

  root.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.('button[data-action="page-prev"],button[data-action="page-next"]')) {
      event.preventDefault();
      return;
    }
    if (event.target.closest?.('button.page-dot')) {
      event.preventDefault();
      card._openPageMenu();
      return;
    }
    card._gestureContextMenu(event);
  });

  root.addEventListener('keydown', (event) => {
    if (TEXT_ENTRY_TAGS.includes(event.target.tagName)) return;
    // An extension that owns the screen (the camera gallery) gets the key first
    if (card._extensionKeydown(event)) return;
    if (card._navigationBlocked()) return;
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      card._gestureContextMenu(event);
      return;
    }
    if (event.key === 'Escape' && root.querySelector('.page-menu')) {
      card._closePageMenu();
      return;
    }
    if (root.querySelector('.page-menu')) return;
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
    if (event.target.classList?.contains('page-menu')) {
      card._closePageMenu();
      return;
    }
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    if (button.dataset.action === 'page-select') card._setPage(Number(button.dataset.page));
    else if (button.dataset.action === 'page-menu') card._openPageMenu();
    else if (button.dataset.action === 'page-menu-close') card._closePageMenu();
    else if (button.dataset.action === 'scene-all') card._openSceneMenu(button.dataset.entity, !!button.dataset.all);
    else if (button.dataset.action === 'scene-activate') {
      card._closePageMenu();
      card._act('scene', button.dataset.entity);
    } else if (button.dataset.action === 'page-goto') {
      card._closePageMenu();
      card._setPage(Number(button.dataset.page));
    } else if (!card._runTapAction(button)) card._act(button.dataset.action, button.dataset.entity);
  });
}
