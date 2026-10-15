// Stylesheet delivery. The whole stylesheet (every widget, surface and layout, wallpapers inlined) is one string
// in the bundle (`virtual:houseview-css`, produced by tools/build.mjs). Each card's shadow root gets it as a
// `<link rel="stylesheet">` pointing at ONE shared Blob URL, so the browser parses it once however many
// cards there are. The link element is kept (not an inline <style>) because the browser suite asserts a
// stable `link[rel=stylesheet]` across renders, and because a link can report load/error.
//
// If the Blob URL cannot be created or is blocked (a strict Content-Security-Policy, an odd WebView) the card
// falls back to an inline `<style>` with the same text. Nothing here may throw: a card without styles is
// ugly, a card that throws is gone.
import css from 'virtual:houseview-css';

const LINK_SELECTOR = 'link[rel="stylesheet"]';
const STYLE_SELECTOR = 'style[data-houseview-styles]';

/** The shared Blob URL; '' once we know blobs do not work here. undefined until first asked. */
let blobUrl;

function sharedBlobUrl() {
  if (blobUrl === undefined) {
    try {
      blobUrl = URL.createObjectURL(new Blob([css], {type: 'text/css'}));
    } catch {
      blobUrl = '';
    }
  }
  return blobUrl;
}

function inlineStyle() {
  const style = document.createElement('style');
  style.dataset.houseviewStyles = '';
  style.textContent = css;
  return style;
}

export const stylesMixin = {
  /**
   * Make sure this card's shadow root has its stylesheet as the first child. Idempotent and cheap: the link
   * is created once and survives every render. A single layout pass follows the load, because sizes
   * measured before the CSS arrived are wrong.
   */
  _ensureStyles() {
    const root = this.shadowRoot;
    if (root.querySelector(LINK_SELECTOR) || root.querySelector(STYLE_SELECTOR)) return;
    const url = sharedBlobUrl();
    if (!url) {
      root.prepend(inlineStyle());
      this._layoutKey = null;
      this._scheduleLayout();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.addEventListener(
      'load',
      () => {
        this._layoutKey = null; // sizes measured before the stylesheet arrived are wrong: write them all again
        this._layout();
      },
      {once: true}
    );
    link.addEventListener(
      'error',
      () => {
        // The blob was refused (CSP): remember it for every other card, and use inline styles from now on.
        blobUrl = '';
        if (link.isConnected) link.replaceWith(inlineStyle());
        this._layoutKey = null;
        this._layout();
      },
      {once: true}
    );
    root.prepend(link);
  }
};

/** Test seam: forget the shared blob so the next card creates a new one. */
export function _resetStyles() {
  blobUrl = undefined;
}
