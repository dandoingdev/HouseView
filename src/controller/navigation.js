// Carousel navigation: the page nav markup, switching pages, and the swipe gesture.
import {esc} from '../core/html.js';
import {t} from '../core/i18n.js';

import {isHomePage} from './render.js';
import {
  homePullEdgePx,
  homePullRelease,
  swipeAxis,
  swipeStep,
  SWIPE_CLICK_GUARD_MS
} from '../core/swipe.js';

const SLIDER_SELECTOR = 'input[type=range],[role=slider],ha-slider,ha-control-slider';

function capturePointer(event) {
  try {
    event.target?.setPointerCapture?.(event.pointerId);
  } catch {
    // The pointer can already have been released.
  }
}

export const navigationMixin = {
  /** The previous / dots / next buttons of the page nav. */
  _pageMarkup() {
    const hass = this._hass;
    const last = this._screens.length - 1;
    const dots = this._screens
      .map(
        (screen, i) =>
          `<button data-action="page-select" data-page="${i}" class="page-dot ${i === this._pageIndex ? 'selected' : ''}" aria-label="${esc(t(hass, 'nav.go_to', {label: screen.label}))}" aria-current="${i === this._pageIndex ? 'page' : 'false'}"><span></span></button>`
      )
      .join('');
    return `<button data-action="page-prev" aria-label="${esc(t(hass, 'nav.previous'))}" ${this._pageIndex === 0 ? 'disabled' : ''}>${this._icon('chevron-left')}</button><div class="page-indicators">${dots}</div><button data-action="page-next" aria-label="${esc(t(hass, 'nav.next'))}" ${this._pageIndex === last ? 'disabled' : ''}>${this._icon('chevron-right')}</button>`;
  },

  /**
   * Go to a page (clamped). Ignored while an extension owns the screen (camera gallery). With motion allowed
   * the old widgets glide out; `prefers-reduced-motion` is looked up at call time.
   */
  _setPage(index) {
    if (!this._screens?.length || this._navigationBlocked()) return;
    const next = Math.max(0, Math.min(this._screens.length - 1, index));
    if (next === this._pageIndex) return;
    this._clearPageTransition();
    const face = this.shadowRoot.querySelector('.face');
    // `performance: lite` has no glide either: it is decoration, and the first thing a weak GPU drops
    const animate =
      face?.animate &&
      this._perf !== 'lite' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const outgoing = animate ? this._prepareOutgoingPage(face) : null;
    const direction = next > this._pageIndex ? 1 : -1;
    this._pageIndex = next;
    this._screenKey = this._screens[next].key;
    this._renderWidgets();
    if (outgoing) this._glidePage(face, outgoing, direction);
  },

  /** The home button's twin: `home_overview` is on, and this page is not already the home summary. */
  _homePullEnabled() {
    const config = this._config;
    if (config?.home_overview !== true || config.single_widget) return false;
    return !isHomePage(this._screens?.[this._pageIndex]);
  },

  /** Top of the visible card, in client coordinates. Null when it has not been laid out. */
  _displayFrame() {
    const shell = this.shadowRoot?.querySelector?.('.shell');
    const rect = shell?.getBoundingClientRect?.() || this.getBoundingClientRect?.();
    if (!rect || !(rect.height > 0)) return null;
    return {top: rect.top || 0, height: rect.height};
  },

  /** pointerdown: remember where a possible swipe starts (not on sliders, not with a mouse's other buttons). */
  _swipeStart(e) {
    this._swipeCancel();
    if (e.isPrimary === false || this._navigationBlocked()) return;
    if (e.composedPath?.().some((node) => node.matches?.(SLIDER_SELECTOR))) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this._clearPageTransition();
    const frame = this._displayFrame();
    const fromTop = frame ? e.clientY - frame.top : Infinity;
    this._gesture = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      pointerId: e.pointerId,
      homeEdge:
        !!frame &&
        this._homePullEnabled() &&
        fromTop >= 0 &&
        fromTop <= homePullEdgePx(frame.height)
    };
  },

  /** Lock horizontal paging, or a downward pull from the top edge. Other vertical movement keeps scrolling. */
  _swipeMove(e) {
    const start = this._gesture;
    if (!start || start.pointerId !== e.pointerId || this._navigationBlocked()) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (start.homePull) return;
    if (!start.dragging) {
      const axis = swipeAxis(dx, dy);
      if (axis === 'pending') return;
      if (axis === 'vertical') {
        if (start.homeEdge && dy > 0) {
          start.homePull = true;
          this._gesturePointerCancel();
          capturePointer(e);
        } else {
          this._gesture = null;
        }
        return;
      }
      start.dragging = true;
      this._gesturePointerCancel();
      // Follow the finger even when it slides off the tile that received the press.
      capturePointer(e);
    }
    this._dragPage(start, dx);
  },

  /** Release the page at the finger position, then slide to the nearest destination. */
  _swipeEnd(e) {
    const start = this._gesture;
    this._gesture = null;
    if (!start || start.pointerId !== e.pointerId) {
      this._clearPageTransition();
      return;
    }
    if (start.homePull) {
      this._suppressClickUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (homePullRelease(dx, dy)) this._act('home-view');
      return;
    }
    const dx = e.clientX - start.x;
    const step = start.dragging ? (Math.abs(dx) > 60 ? (dx < 0 ? 1 : -1) : 0) : swipeStep(start, e);
    if (start.dragging || step) this._suppressClickUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
    if (start.face) this._settlePageDrag(start, step);
    else if (step) this._setPage(this._pageIndex + step);
  },

  /** A browser cancellation or second finger returns the original page without activating a widget. */
  _swipeCancel() {
    const start = this._gesture;
    this._gesture = null;
    if (start?.homePull) this._suppressClickUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
    if (start?.dragging) {
      this._suppressClickUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
      this._settlePageDrag(start, 0);
    }
  }
};
