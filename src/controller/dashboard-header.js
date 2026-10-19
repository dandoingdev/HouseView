import {DASHBOARD_HEADER_HEIGHT, headerLabels} from '../core/dashboard-header.js';

export const dashboardHeaderMixin = {
  _headerHeight() {
    return this._config?.show_header === true && !this._config.single_widget
      ? DASHBOARD_HEADER_HEIGHT
      : 0;
  },

  /**
   * Keep the header's block size on the shell itself. Page renders replace `className`, which used to remove
   * `has-header` until the header was synced again. On a slow device that gap is laid out: the header collapses,
   * the page jumps up by its height, then the class comes back. An inline variable survives the class rewrite,
   * and writing the same value again does not invalidate style.
   */
  _reserveHeaderSpace(shell = this.shadowRoot?.querySelector('.shell')) {
    if (!shell) return;
    const next = this._headerHeight() > 0 ? `${DASHBOARD_HEADER_HEIGHT}px` : '';
    if (shell.style.getPropertyValue('--hv-header-height') === next) return;
    if (next) shell.style.setProperty('--hv-header-height', next);
    else shell.style.removeProperty('--hv-header-height');
  },

  /** Reuse the header and its text nodes across page changes and clock updates. */
  _syncDashboardHeader(shell = this.shadowRoot.querySelector('.shell'), now = Date.now()) {
    if (!shell) return;
    const enabled = this._headerHeight() > 0;
    this._reserveHeaderSpace(shell);
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
