// Entity state helpers and the action entry point. The names are the original names (some tests and old code
// call them directly); the logic now lives in core (availability policy, markup helpers, dispatcher).
import {buttonHTML, iconHTML} from '../core/html.js';
import {dispatchAction} from '../core/dispatch.js';
import {moreInfo} from '../core/events.js';
import {isAvailable} from '../core/state.js';

export const stateMixin = {
  /** hass.states[id]; undefined before the first hass or for an unknown entity. */
  _state(id) {
    return this._hass?.states[id];
  },

  /** Exists, is not "unavailable", and is not "unknown" (except for domains where unknown is normal). */
  _available(id) {
    return isAvailable(this._state(id), id);
  },

  /** Open Home Assistant's more-info dialog for an entity. */
  _info(id) {
    // The dialog sits outside the card and takes the release, which would otherwise leave a swipe armed.
    this._swipeCancel?.();
    moreInfo(this, id);
  },

  /**
   * Run a data-action. Async: resolves after the service call (and the pending/feedback bookkeeping).
   * The order of the original pipeline is in core/dispatch.js.
   */
  _act(action, id) {
    return dispatchAction(this, action, id);
  },

  /** Re-render after pending or feedback changed: the tiles of a carousel. */
  _refreshActionState() {
    if (this._config?.widgets) this._updateWidgets();
  },

  /** A `<button data-action>`; disabled when unavailable or when a call for the entity is in flight. */
  _button(action, id, content, cls = '', available = this._available(id)) {
    return buttonHTML(action, id, content, cls, available, {pending: this._pending.has(id)});
  },

  _icon(name) {
    return iconHTML(name);
  }
};
