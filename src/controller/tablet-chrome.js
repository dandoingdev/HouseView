// Tablet mode: hide Home Assistant's own sidebar and header so the carousel can use the whole screen
// (`?tablet=1` explicitly, or `tablet_mode: true` on a touch display).
// Desktop users keep HA navigation and its dashboard editor; editing always restores them.
//
// THIS IS THE ONLY CODE THAT TOUCHES HOME ASSISTANT'S PRIVATE DOM. It reaches into the shadow roots of
// `home-assistant` > `home-assistant-main` > `ha-drawer` and of the `hui-root` that contains the card, none of
// which is a public API and all of which can change in any frontend release.
// Therefore everything here is feature-detected and wrapped: when a piece of HA is not where we expect it we
// do nothing, and when anything throws we undo what we did and carry on without tablet mode. A failure here
// must never break the card. Re-check after each major HA frontend release.

import {isEditMode} from './screensaver.js';

const DRAWER_CSS =
  '.sidebar-shell{display:none!important}.layout{grid-template-columns:1fr!important}.app-content{margin:0!important;padding:0!important;width:100%!important}';
const HEADER_CSS =
  '.header{display:none!important}#view{padding-top:0!important;--header-height:0px}';

let warned = false;

/** `?tablet=1` in the address, parsed again only when the address changes (this runs on every layout pass). */
let lastSearch;
let lastSearchTablet;
function tabletInAddress() {
  const search = window.location.search;
  if (search !== lastSearch) {
    lastSearch = search;
    const value = new URLSearchParams(search).get('tablet');
    lastSearchTablet = value === '1' ? true : value === '0' ? false : undefined;
  }
  return lastSearchTablet;
}

/** Was tablet mode asked for? */
function tabletRequested(card) {
  if (isEditMode(card)) return false;
  const override = tabletInAddress();
  if (override !== undefined) return override;
  const desktop = window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches;
  return card._config?.tablet_mode === true && !desktop;
}

/** The `ha-drawer` of the running Home Assistant frontend, or undefined. */
function findDrawer() {
  const main = document
    .querySelector('home-assistant')
    ?.shadowRoot?.querySelector('home-assistant-main');
  return main?.shadowRoot?.querySelector('ha-drawer');
}

/** The `hui-root` ancestor of the card, walking up through shadow roots; undefined when not inside one. */
function findRoot(card) {
  for (let node = card; node; node = node.parentElement || node.getRootNode?.()?.host) {
    if (node.localName === 'hui-root') return node;
  }
  return undefined;
}

export const tabletChromeMixin = {
  /** Undo tablet mode: attribute, injected styles, chrome variable. Never throws. */
  _restoreChrome() {
    try {
      this.removeAttribute('tablet-mode');
      for (const style of this._chromeStyles || []) style.remove();
      this._chromeStyles = [];
      this.style.removeProperty('--hv-chrome');
    } catch (error) {
      this._chromeFailed(error);
    }
  },

  /**
   * Apply tablet mode when requested, remove it when not. Idempotent: called on every render and layout.
   * A standalone widget card (single_widget) never uses it.
   */
  _tabletChrome() {
    if (this._config?.single_widget) return;
    try {
      if (!tabletRequested(this)) {
        if (this._chromeStyles?.length || this.hasAttribute('tablet-mode')) this._restoreChrome();
        return;
      }
      // only when absent: rewriting an attribute with the same value still invalidates style for `:host([tablet-mode])`
      if (!this.hasAttribute('tablet-mode')) this.setAttribute('tablet-mode', '');
      if (this._chromeStyles?.length && this._chromeStyles.every((style) => style.isConnected))
        return;
      for (const style of this._chromeStyles || []) style.remove();
      const drawer = findDrawer();
      const root = findRoot(this);
      // Not inside Home Assistant's dashboard (a test page, a preview) or HA changed: keep the attribute only.
      if (!drawer?.shadowRoot || !root?.shadowRoot) return;
      this._chromeStyles = [];
      for (const [target, css] of [
        [drawer.shadowRoot, DRAWER_CSS],
        [root.shadowRoot, HEADER_CSS]
      ]) {
        const style = document.createElement('style');
        style.dataset.houseviewChrome = '';
        style.textContent = css;
        target.append(style);
        this._chromeStyles.push(style);
      }
      this.style.setProperty('--hv-chrome', '0px');
    } catch (error) {
      this._chromeFailed(error);
    }
  },

  /** Fail closed: leave HA exactly as we found it, say so once, and run without tablet mode. */
  _chromeFailed(error) {
    if (!warned) {
      warned = true;
      console.warn(
        '[HouseView] tablet mode is not available with this Home Assistant version',
        error
      );
    }
    try {
      for (const style of this._chromeStyles || []) style.remove();
      this._chromeStyles = [];
      this.removeAttribute('tablet-mode');
      this.style?.removeProperty('--hv-chrome');
    } catch {
      /* nothing more can be done */
    }
  }
};

/** Test seam: let the next failure warn again. */
export function _resetTabletChromeWarning() {
  warned = false;
}
