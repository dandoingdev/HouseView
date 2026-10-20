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
          `<button data-action="page-menu" data-page="${i}" class="page-dot ${i === this._pageIndex ? 'selected' : ''}" aria-label="${esc(t(hass, 'nav.show_all', {label: screen.label}))}" aria-haspopup="dialog" aria-current="${i === this._pageIndex ? 'page' : 'false'}"><span></span></button>`
      )
      .join('');
    return `<button data-action="page-prev" aria-label="${esc(t(hass, 'nav.previous'))}" ${this._pageIndex === 0 ? 'disabled' : ''}>${this._icon('chevron-left')}</button><div class="page-indicators">${dots}</div><button data-action="page-next" aria-label="${esc(t(hass, 'nav.next'))}" ${this._pageIndex === last ? 'disabled' : ''}>${this._icon('chevron-right')}</button>`;
  },

  /** Full-screen list of every page: a button per page with its icon and name. */
  _openPageMenu() {
    if (!this._screens?.length || this._navigationBlocked()) return;
    this._openMenu(
      t(this._hass, 'nav.label'),
      this._screens.map((screen, i) => ({
        action: 'page-goto',
        attrs: `data-page="${i}"`,
        icon: screen.icon,
        label: screen.label,
        selected: i === this._pageIndex
      }))
    );
  },

  /** Area (room) id of an entity: its own, else its device's. */
  _areaOf(id) {
    const hass = this._hass;
    const entry = hass?.entities?.[id];
    return entry?.area_id || hass?.devices?.[entry?.device_id]?.area_id || null;
  },

  /**
   * Held scene tile: every other scene on the dashboard, each one tap to activate. The "All Scenes" chip swaps
   * in every scene of the held scene's room (all scenes when it has none), the held one included.
   */
  _openSceneMenu(entity, all = false) {
    const hass = this._hass;
    const item = (id, widget = {}) => {
      const attrs = hass?.states?.[id]?.attributes || {};
      return {
        action: 'scene-activate',
        attrs: `data-entity="${esc(id)}"`,
        icon: widget.icon || attrs.icon || 'mdi:weather-sunny',
        label: widget.name || attrs.friendly_name || id,
        selected: all && id === entity
      };
    };
    const seen = new Set(all ? [] : [entity]);
    const items = [];
    if (all) {
      const area = this._areaOf(entity);
      const widgets = new Map((this._config?.widgets || []).map((w) => [w.entity, w]));
      for (const id of Object.keys(hass?.states || {})) {
        if (!id.startsWith('scene.') || (area && this._areaOf(id) !== area)) continue;
        seen.add(id);
        items.push(item(id, widgets.get(id)));
      }
      items.sort((x, y) => x.label.localeCompare(y.label));
    } else {
      for (const widget of this._config?.widgets || []) {
        const id = widget.entity;
        if (typeof id !== 'string' || !id.startsWith('scene.') || seen.has(id)) continue;
        seen.add(id);
        items.push(item(id, widget));
      }
    }
    const chip = {
      action: 'scene-all',
      attrs: `data-entity="${esc(entity)}" data-all="${all ? '' : '1'}"`,
      label: t(hass, 'scene.all'),
      selected: all
    };
    if (!items.length && !all) return this._info(entity);
    this._openMenu(t(hass, 'scene.menu'), items, {chip, closeLeft: true});
  },

  /** The shared full-screen menu: `items` are {action, attrs, icon, label, selected}; `chip` is a pill centred at the top. */
  _openMenu(label, items, {chip = null, closeLeft = false} = {}) {
    this._closePageMenu();
    const shell = this.shadowRoot.querySelector('.shell');
    if (!shell) return;
    const hass = this._hass;
    const buttons = items
      .map((item) => {
        const icon = item.icon ? this._icon(item.icon) : '';
        return `<button data-action="${item.action}" ${item.attrs} class="page-menu-item ${item.selected ? 'selected' : ''}">${icon}<span>${esc(item.label)}</span></button>`;
      })
      .join('');
    const chipMarkup = chip
      ? `<button data-action="${chip.action}" ${chip.attrs} class="page-menu-chip ${chip.selected ? 'selected' : ''}" aria-pressed="${!!chip.selected}">${esc(chip.label)}</button>`
      : '';
    const menu = document.createElement('div');
    menu.className = `page-menu${closeLeft ? ' close-left' : ''}`;
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', label);
    menu.innerHTML = `${chipMarkup}<div class="page-menu-grid">${buttons}</div><button data-action="page-menu-close" class="page-menu-close" aria-label="${esc(t(hass, 'nav.close'))}">${this._icon('close')}</button>`;
    shell.append(menu);
    menu.querySelector('.selected')?.focus?.();
  },

  _closePageMenu() {
    this.shadowRoot?.querySelector('.page-menu')?.remove();
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
    if (this.shadowRoot.querySelector('.page-menu')) return;
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
      // The first frame builds and mounts the neighbours; later moves only write transforms.
      this._dragPage(start, dx);
    }
    this._trackVelocity(start, e);
    this._queueDrag(start, dx);
  },

  /** Recent horizontal speed in px/ms (negative = towards the next page), from the last ~100 ms. */
  _trackVelocity(start, e) {
    const samples = (start.samples ||= []);
    const t = e.timeStamp;
    samples.push({x: e.clientX, t});
    while (samples.length > 2 && t - samples[0].t > 100) samples.shift();
  },

  _releaseVelocity(start) {
    const s = start.samples;
    if (!s || s.length < 2) return 0;
    const dt = s[s.length - 1].t - s[0].t;
    return dt > 0 ? (s[s.length - 1].x - s[0].x) / dt : 0;
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
    this._flushDrag(start, dx);
    const v = start.dragging ? this._releaseVelocity(start) : 0;
    // Past 60 px, or a quick flick (>0.4 px/ms) past 24 px in the same direction.
    const far =
      Math.abs(dx) > 60 ||
      (Math.abs(dx) > 24 && Math.abs(v) > 0.4 && Math.sign(v) === Math.sign(dx));
    const step = start.dragging ? (far ? (dx < 0 ? 1 : -1) : 0) : swipeStep(start, e);
    if (start.dragging || step) this._suppressClickUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
    if (start.face) this._settlePageDrag(start, step, Math.abs(v));
    else if (step) this._setPage(this._pageIndex + step);
  },

  /** A browser cancellation or second finger returns the original page without activating a widget. */
  _swipeCancel() {
    const start = this._gesture;
    this._gesture = null;
    if (start?.homePull) this._suppressClickUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
    if (start?.dragging) {
      this._suppressClickUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
      this._flushDrag(start);
      this._settlePageDrag(start, 0);
    }
  }
};
