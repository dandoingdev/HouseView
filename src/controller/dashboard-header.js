import {DASHBOARD_HEADER_HEIGHT, headerLabels} from '../core/dashboard-header.js';

export const dashboardHeaderMixin = {
  _dashboardWidth() {
    return this._previewStage?.()?.width || this.getBoundingClientRect().width || window.innerWidth;
  },

  _dashboardControlInHeader(control = this._dashboardControl(), width) {
    return !!control && (width ?? this._dashboardWidth()) < 700;
  },

  _headerHeight(compact, width, alert = this._lineAlert?.()) {
    compact ??= this._dashboardControlInHeader(this._dashboardControl(), width);
    if (alert && (width ??= this._dashboardWidth()) < 700) {
      return width < 480 &&
        (compact || this._config.show_header === true || this._config.house_mode_entity)
        ? 112
        : 56;
    }
    if (compact || (!this._config?.single_widget && this._config?.house_mode_entity)) return 56;
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
  _reserveHeaderSpace(
    shell = this.shadowRoot?.querySelector('.shell'),
    height = this._headerHeight()
  ) {
    if (!shell) return;
    const next = height > 0 ? `${height}px` : '';
    if (shell.style.getPropertyValue('--hv-header-height') === next) return;
    if (next) shell.style.setProperty('--hv-header-height', next);
    else shell.style.removeProperty('--hv-header-height');
    this._scheduleLayout?.();
  },

  /** Reuse the header and its text nodes across page changes and clock updates. */
  _syncDashboardHeader(shell = this.shadowRoot.querySelector('.shell'), now = Date.now()) {
    if (!shell) return;
    const control = this._dashboardControl();
    const alert = this._lineAlert?.() || null;
    const width = control || alert ? this._dashboardWidth() : 0;
    const inHeader = this._dashboardControlInHeader(control, width);
    const alertInHeader = !!alert && width < 700;
    const height = this._headerHeight(inHeader, width, alert);
    const enabled = height > 0;
    this._reserveHeaderSpace(shell, height);
    shell.classList.toggle('has-header', enabled);
    let header = shell.querySelector('.dashboard-header');
    if (!enabled) {
      this._syncDashboardControl(shell, null, control, inHeader);
      this._syncLineAlert?.(shell, null, alert, false, false, control, width);
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
    header.classList.toggle('controls-only', this._config.show_header !== true);
    this._syncHouseModeIndicator(header);
    header.classList.toggle('has-dashboard-control', inHeader);
    this._syncDashboardControl(shell, header, control, inHeader);
    this._syncLineAlert?.(shell, header, alert, alertInHeader, height === 112, control, width);
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
  },

  /** Preserve the shortcut node and focus while playback changes or the screen rotates. */
  _syncDashboardControl(shell, header, control, inHeader) {
    let button = shell.querySelector('.dashboard-control');
    const focused = button && this.shadowRoot.activeElement === button;
    let footer = shell.querySelector('.dashboard-controls');
    const dim = shell.querySelector('.dim-screen');
    if (!control || inHeader) {
      if (dim && footer?.contains(dim) && !footer.querySelector('.line-alert')) shell.append(dim);
    }
    if (!control) {
      button?.remove();
      if (!footer?.querySelector('.line-alert')) footer?.remove();
      if (focused) (dim || shell.querySelector('.page-dot.selected'))?.focus({preventScroll: true});
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.className = 'dashboard-control';
    }
    if (button.dataset.action !== control.action) button.dataset.action = control.action;
    if (button.dataset.entity !== control.entity) button.dataset.entity = control.entity;
    if (button.getAttribute('aria-label') !== control.label) {
      button.setAttribute('aria-label', control.label);
      button.title = control.label;
    }
    if (button.dataset.icon !== control.icon) {
      button.dataset.icon = control.icon;
      button.innerHTML = this._icon(control.icon);
    }
    const disabled = !!control.disabled || this._pending.has(control.entity);
    if (button.disabled !== disabled) button.disabled = disabled;
    if (inHeader) {
      if (header && button.parentElement !== header) header.append(button);
      if (!footer?.querySelector('.line-alert')) footer?.remove();
    } else {
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'dashboard-controls';
        shell.append(footer);
      }
      if (button.parentElement !== footer) footer.prepend(button);
      if (dim && dim.parentElement !== footer) footer.append(dim);
    }
    if (focused && this.shadowRoot.activeElement !== button) button.focus({preventScroll: true});
  }
};
