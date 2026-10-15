// Native Home Assistant cards placed on a HouseView page (`native_card`, the pseudo-type for any card that
// is not a HouseView card). They are created through HA's own card helpers, which load lazily.
import {t} from '../core/i18n.js';

export const nativeCardMixin = {
  /** Start loading HA's card helpers when the config has a native card; re-render once they arrive. */
  _ensureCardHelpers() {
    if (this._helpers || this._helpersLoading) return;
    if (!this._config.widgets.some((widget) => widget.type === 'native_card')) return;
    if (!window.loadCardHelpers) return;
    this._helpersLoading = window
      .loadCardHelpers()
      .then((helpers) => {
        this._helpers = helpers;
        if (this.isConnected) this._render();
      })
      .catch(() => {
        this._helpersLoading = null;
      });
  },

  /**
   * The element for a native card placement: a tile that holds HA's card element, or a loading note until
   * the helpers are available. `_helpers` is a plain property (tests assign `{createCardElement}`).
   */
  _nativeCardElement(placement) {
    const element = document.createElement('div');
    element.className = 'tile widget native-card';
    element.dataset.widget = placement.index;
    if (this._helpers) {
      const native = this._helpers.createCardElement(placement.widget._card);
      native.hass = this._hass;
      element.append(native);
    } else {
      element.textContent = t(this._hass, 'native.loading');
    }
    return element;
  },

  /** Native cards need every hass update; widget cards are updated by the controller itself. */
  _forwardHassToNativeCards(hass) {
    for (const element of this._renderedCards?.values() || []) {
      if (element.localName !== 'houseview-widget-card' && element.firstElementChild) {
        element.firstElementChild.hass = hass;
      }
    }
  }
};
