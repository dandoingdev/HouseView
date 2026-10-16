import {DASHBOARD_HEADER_HEIGHT, headerLabels} from '../core/dashboard-header.js';

export const dashboardHeaderMixin = {
  _headerHeight() {
    return this._config?.show_header === true && !this._config.single_widget
      ? DASHBOARD_HEADER_HEIGHT
      : 0;
  },

  /** Reuse the header and its text nodes across page changes and clock updates. */
  _syncDashboardHeader(shell = this.shadowRoot.querySelector('.shell'), now = Date.now()) {
    if (!shell) return;
    const enabled = this._headerHeight() > 0;
    shell.classList.toggle('has-header', enabled);
    let header = shell.querySelector('.dashboard-header');
    if (!enabled) {
      header?.remove();
      this._headerStamp = undefined;
      return;
    }
    if (!header) {
      header = document.createElement('header');
      header.className = 'dashboard-header';
      header.innerHTML = '<time class="dashboard-date"></time><time class="dashboard-time"></time>';
      shell.prepend(header);
      this._headerStamp = undefined;
    }
    const stamp = this._config.preview_time ? new Date(this._config.preview_time).valueOf() : now;
    const key = JSON.stringify([
      Math.floor(stamp / 60000),
      this._hass?.locale,
      this._hass?.config?.time_zone
    ]);
    if (key === this._headerStamp) return;
    this._headerStamp = key;
    const labels = headerLabels(this._hass, stamp);
    for (const kind of ['date', 'time']) {
      const element = header.querySelector(`.dashboard-${kind}`);
      element.textContent = labels[kind];
      element.dateTime = new Date(stamp).toISOString();
    }
  }
};
