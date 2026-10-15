// The bedtime dim button (`bedtime: true`): darkens the screen without touching any device.
// The `dim` action itself is a core feature (core/core-actions.js); it calls `_toggleDim` below.
import {esc} from '../core/html.js';
import {t} from '../core/i18n.js';

export const dimMixin = {
  /** Fill the dim button for the current state (label, icon, text). */
  _paintDimButton(button) {
    const hass = this._hass;
    button.setAttribute('aria-label', t(hass, this._dim ? 'dim.restore' : 'dim.dim_screen'));
    button.innerHTML = `${this._icon(this._dim ? 'brightness-6' : 'weather-night')}<span>${esc(
      t(hass, this._dim ? 'dim.brighter' : 'dim.dim')
    )}</span>`;
  },

  /** Make the shell's dim button match `config.bedtime`: create or update it, or remove it. */
  _syncDimButton(shell) {
    let button = shell.querySelector('.dim-screen');
    if (!this._config.bedtime) {
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.className = 'dim-screen';
      button.dataset.action = 'dim';
      shell.append(button);
    }
    this._paintDimButton(button);
  },

  /** Toggle the dim state in place: no re-render, so nothing under the finger is rebuilt. */
  _toggleDim() {
    this._dim = !this._dim;
    const root = this.shadowRoot;
    root.querySelector('.shell')?.classList.toggle('screen-dim', this._dim);
    const button = root.querySelector('.dim-screen');
    if (button) this._paintDimButton(button);
  }
};
