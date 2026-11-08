import {lineAlert} from '../core/line-alert.js';
import {t} from '../core/i18n.js';

export const lineAlertMixin = {
  _lineAlert() {
    return lineAlert(this._config, this._hass);
  },

  /** One stable button moves between toolbars; the sensor's details remain owned by Home Assistant. */
  _syncLineAlert(shell, header, alert, inHeader, stacked, control, width = this._dashboardWidth()) {
    let button = shell.querySelector('.line-alert');
    let footer = shell.querySelector('.dashboard-controls');
    const dim = shell.querySelector('.dim-screen');
    const focused = button && this.shadowRoot.activeElement === button;
    shell.classList.toggle('has-line-alert-footer', !!alert && !inHeader);
    header?.classList.toggle('has-line-alert', !!alert && inHeader);
    header?.classList.toggle('line-alert-stacked', !!alert && stacked);
    header?.classList.toggle('line-alert-with-control', !!alert && inHeader && !!control);
    let footerStacked = false;
    if (alert && !inHeader) {
      const count = (control ? 1 : 0) + (this._config.bedtime ? 1 : 0);
      const footerWidth = 144 + count * 64;
      const navWidth = ((this._screens?.length || 1) + 2) * 56 + 16;
      footerStacked = width / 2 + navWidth / 2 + 8 > width - footerWidth - 10;
    }
    if (this.classList.contains('line-alert-footer-stacked') !== footerStacked) {
      this.classList.toggle('line-alert-footer-stacked', footerStacked);
      this._scheduleLayout?.();
    }
    // A page render replaces the shell class, while the host's size token survives. Restore both.
    shell.classList.toggle('line-alert-footer-stacked', footerStacked);
    if (!alert) {
      button?.remove();
      if (footer && !footer.querySelector('.dashboard-control')) {
        if (dim && footer.contains(dim)) shell.append(dim);
        footer.remove();
      }
      if (focused)
        (dim || shell.querySelector('.house-mode-indicator,.page-dot.selected'))?.focus({
          preventScroll: true
        });
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'line-alert';
      button.dataset.action = 'info';
      button.innerHTML = `${this._icon('alert-circle-outline')}<span class="line-alert-copy"><strong></strong><span></span></span>`;
    }
    if (button.dataset.entity !== alert.entity) button.dataset.entity = alert.entity;
    if (button.dataset.severity !== alert.severity) button.dataset.severity = alert.severity;
    const label = t(this._hass, 'line_alert.label', {name: alert.name, status: alert.status});
    const full = alert.detail ? `${label}. ${alert.detail}` : label;
    if (button.getAttribute('aria-label') !== full) button.setAttribute('aria-label', full);
    if (button.title !== full) button.title = full;
    const name = button.querySelector('strong');
    if (name.textContent !== alert.name) name.textContent = alert.name;
    const status = button.querySelector('.line-alert-copy > span');
    const value = inHeader && !stacked ? t(this._hass, `line_alert.${alert.short}`) : alert.status;
    if (status.textContent !== value) status.textContent = value;
    if (inHeader) {
      if (header && button.parentElement !== header) header.append(button);
      if (footer && !footer.querySelector('.dashboard-control')) {
        if (dim && footer.contains(dim)) shell.append(dim);
        footer.remove();
      }
    } else {
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'dashboard-controls';
        shell.append(footer);
      }
      if (dim && dim.parentElement !== footer) footer.append(dim);
      if (dim) {
        if (button.nextElementSibling !== dim) footer.insertBefore(button, dim);
      } else if (button.parentElement !== footer || footer.lastElementChild !== button)
        footer.append(button);
    }
    if (focused && this.shadowRoot.activeElement !== button) button.focus({preventScroll: true});
  }
};
