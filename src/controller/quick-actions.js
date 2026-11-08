import {iconHTML} from '../core/html.js';
import {t} from '../core/i18n.js';
import {runActionConfig} from '../core/action-config.js';
import {
  quickActionsEnabled,
  quickActionsConfigured,
  quickActionAvailable,
  quickActionConfig
} from '../core/quick-actions.js';
import {homePullRelease, SWIPE_CLICK_GUARD_MS} from '../core/swipe.js';

const icons = {
  light: 'lightbulb-group-outline',
  switch: 'power',
  input_boolean: 'toggle-switch-outline',
  scene: 'palette-outline',
  script: 'script-text-play-outline',
  button: 'gesture-tap-button',
  input_button: 'gesture-tap-button',
  fan: 'fan',
  automation: 'lightning-bolt-outline'
};

export const quickActionsMixin = {
  _quickActionsEnabled() {
    return quickActionsEnabled(this._config);
  },

  _openQuickActions({preview = false} = {}) {
    if (
      (!preview && !quickActionsConfigured(this._config)) ||
      this._navigationBlocked() ||
      this._swipeCovered()
    )
      return;
    this._swipeCancel();
    this._quickActions = {
      open: true,
      config: this._config,
      busy: new Set(),
      focus: this.shadowRoot.activeElement,
      preview
    };
    this._syncQuickActions();
    this._controlIdleSync?.();
    const root = this.shadowRoot.querySelector('.quick-actions');
    if (this._quickActionsAnimate(root))
      this._quickActions.animation = root.animate(
        [{transform: 'translateY(100%)'}, {transform: 'translateY(0)'}],
        {duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)'}
      );
    if (!preview) this.shadowRoot.querySelector('.qa-close')?.focus({preventScroll: true});
  },

  _closeQuickActions() {
    const view = this._quickActions;
    if (!view || view.closing) return;
    view.closing = true;
    this._suppressClickUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
    const finish = () => {
      if (this._quickActions !== view) return;
      this._disposeQuickActions();
      if (view.focus?.isConnected && !view.focus.disabled) view.focus.focus({preventScroll: true});
      else this.shadowRoot.querySelector('.page-dot.selected')?.focus({preventScroll: true});
    };
    const root = this.shadowRoot.querySelector('.quick-actions');
    view.animation?.cancel();
    if (this._quickActionsAnimate(root)) {
      view.animation = root.animate(
        [{transform: 'translateY(0)'}, {transform: 'translateY(100%)'}],
        {duration: 180, easing: 'ease-in', fill: 'forwards'}
      );
      void view.animation.finished.then(finish, finish);
    } else finish();
  },

  _quickActionsAnimate(root) {
    return (
      !!root?.animate &&
      !this._quickActions?.preview &&
      this._perf !== 'lite' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  },

  _disposeQuickActions() {
    const view = this._quickActions;
    this._quickActions = null;
    this._controlIdleSync?.();
    if (view?.busy.size) this.shadowRoot?.querySelector('.hv-confirm [data-confirm="no"]')?.click();
    view?.animation?.cancel();
    this.shadowRoot?.querySelector('.quick-actions')?.remove();
  },

  _syncQuickActions() {
    const view = this._quickActions;
    if (!view?.open) return;
    if (view.config !== this._config || (!view.preview && !quickActionsConfigured(this._config)))
      return this._disposeQuickActions();
    const shell = this.shadowRoot.querySelector('.shell');
    if (!shell) return;
    let root = shell.querySelector('.quick-actions');
    if (!root) {
      root = document.createElement('section');
      root.className = 'quick-actions';
      root.setAttribute('role', view.preview ? 'region' : 'dialog');
      if (!view.preview) root.setAttribute('aria-modal', 'true');
      root.innerHTML =
        `<header class="qa-header"><div class="qa-heading"><small></small><h2></h2></div><button type="button" class="ov-panel-key qa-close" data-action="quick-actions-close">${iconHTML('chevron-down')}</button></header>` +
        `<div class="qa-grid">${(this._config.quick_actions || [])
          .map(
            (_, i) =>
              `<button type="button" class="qa-action" data-action="quick-actions-run-${i}" data-quick-index="${i}"><span class="qa-icon"></span><span class="qa-copy"><strong></strong><small></small></span><span class="qa-state"></span></button>`
          )
          .join('')}</div>` +
        '<footer class="qa-footer"><span class="qa-status" role="status" aria-live="polite"></span><span class="qa-hint"></span></footer>';
      shell.append(root);
      const count = this._config.quick_actions?.length || 0;
      const grid = root.querySelector('.qa-grid');
      grid.dataset.count = count;
      grid.style.setProperty('--qa-rows', Math.max(1, Math.ceil(count / 2)));
      grid.style.setProperty('--qa-wide-rows', Math.max(1, Math.ceil(count / 3)));
      if (!count) grid.innerHTML = '<p class="qa-empty"></p>';
      this._bindQuickActions(root);
    }
    const text = (selector, value) => {
      const node = root.querySelector(selector);
      if (node.textContent !== value) node.textContent = value;
    };
    const title = this._config.quick_actions_title || t(this._hass, 'quick_actions.title');
    if (root.getAttribute('aria-label') !== title) root.setAttribute('aria-label', title);
    text('.qa-heading small', t(this._hass, 'quick_actions.eyebrow'));
    text('.qa-heading h2', title);
    text('.qa-hint', t(this._hass, 'quick_actions.hint'));
    text('.qa-status', this._message || '');
    if (root.querySelector('.qa-empty')) text('.qa-empty', t(this._hass, 'quick_actions.empty'));
    const close = root.querySelector('.qa-close');
    const closeLabel = t(this._hass, 'quick_actions.close');
    if (close.getAttribute('aria-label') !== closeLabel)
      close.setAttribute('aria-label', closeLabel);
    for (const button of root.querySelectorAll('.qa-action')) {
      const item = this._config.quick_actions[Number(button.dataset.quickIndex)];
      const state = this._hass?.states?.[item.entity];
      const available = quickActionAvailable(this._hass, item, this._config);
      const busy = view.busy.has(item.entity) || this._pending.has(item.entity);
      const disabled = !available || busy || !!view.closing || view.preview;
      if (button.disabled !== disabled) button.disabled = disabled;
      const on = state?.state === 'on';
      button.classList.toggle('is-active', on);
      const icon =
        item.icon ||
        state?.attributes?.icon ||
        (item.flow
          ? item.flow === 'away'
            ? 'home-export-outline'
            : 'weather-night'
          : icons[item.entity?.split('.')[0]]) ||
        'lightning-bolt-outline';
      const slot = button.querySelector('.qa-icon');
      if (slot.dataset.icon !== icon) {
        slot.dataset.icon = icon;
        slot.innerHTML = iconHTML(icon);
      }
      const name =
        item.name ||
        (item.flow
          ? t(this._hass, item.flow === 'away' ? 'house_routines.leaving' : 'house_routines.night')
          : state?.attributes?.friendly_name || item.entity);
      const set = (selector, value) => {
        const node = button.querySelector(selector);
        if (node.textContent !== value) node.textContent = value;
      };
      set('strong', name);
      set('.qa-copy small', item.note || '');
      set(
        '.qa-state',
        item.flow && available
          ? t(this._hass, 'house_routines.review_short')
          : busy
            ? t(this._hass, 'quick_actions.working')
            : item.entity?.startsWith('script.') && state?.state === 'on'
              ? t(this._hass, 'quick_actions.running')
              : !available
                ? t(this._hass, 'state.unavailable')
                : /^(scene|script|button|input_button)\./.test(item.entity)
                  ? t(this._hass, 'quick_actions.run')
                  : state?.state === 'on'
                    ? t(this._hass, 'common.on')
                    : state?.state === 'off'
                      ? t(this._hass, 'common.off')
                      : t(this._hass, 'quick_actions.run')
      );
      const entity = item.entity || `house-routine:${item.flow}`;
      if (button.dataset.entity !== entity) button.dataset.entity = entity;
      const accessible = `${name}, ${button.querySelector('.qa-state').textContent}`;
      if (button.getAttribute('aria-label') !== accessible)
        button.setAttribute('aria-label', accessible);
    }
  },

  async _runQuickAction(index) {
    const view = this._quickActions;
    const item = this._config?.quick_actions?.[index];
    if (
      !view?.open ||
      view.preview ||
      view.closing ||
      !Number.isInteger(index) ||
      !item ||
      view.config !== this._config ||
      !quickActionAvailable(this._hass, item, this._config) ||
      view.busy.has(item.entity) ||
      this._pending.has(item.entity)
    )
      return;
    if (item.flow) {
      this._disposeQuickActions();
      this._openHouseModes();
      this._showHouseRoutine(item.flow);
      return;
    }
    view.busy.add(item.entity);
    this._syncQuickActions();
    try {
      await runActionConfig(
        this,
        quickActionConfig(item),
        'tap_action',
        () =>
          this._quickActions === view &&
          view.config === this._config &&
          quickActionAvailable(this._hass, item, this._config)
      );
    } catch (error) {
      this._message = t(this._hass, 'error.action', {
        reason: error?.message || t(this._hass, 'error.try_again')
      });
      this._refreshActionState();
    } finally {
      view.busy.delete(item.entity);
      if (this._quickActions === view) this._syncQuickActions();
    }
  },

  _bindQuickActions(root) {
    let start;
    root.addEventListener('pointerdown', (event) => {
      start = null;
      event.stopPropagation();
      if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0))
        return;
      start = {x: event.clientX, y: event.clientY, pointer: event.pointerId};
    });
    root.addEventListener('pointermove', (event) => {
      event.stopPropagation();
      if (
        start?.pointer === event.pointerId &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
      ) {
        start.moved = true;
        root.setPointerCapture?.(event.pointerId);
      }
    });
    root.addEventListener('pointercancel', () => {
      if (start?.moved) this._suppressClickUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
      start = null;
    });
    root.addEventListener('pointerup', (event) => {
      event.stopPropagation();
      const gesture = start;
      start = null;
      if (gesture?.moved) this._suppressClickUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
      if (
        gesture?.pointer === event.pointerId &&
        homePullRelease(event.clientX - gesture.x, event.clientY - gesture.y)
      )
        this._closeQuickActions();
    });
  },

  _quickActionsKeydown(event) {
    if (this._quickActions?.preview) return false;
    if (!this._quickActions?.open) {
      if (event.altKey && event.key === 'ArrowUp' && quickActionsConfigured(this._config)) {
        event.preventDefault();
        this._openQuickActions();
        return true;
      }
      return false;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this._closeQuickActions();
    } else if (event.key === 'Tab') {
      const buttons = [...this.shadowRoot.querySelectorAll('.quick-actions button:not(:disabled)')];
      const index = buttons.indexOf(this.shadowRoot.activeElement);
      event.preventDefault();
      buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    } else if (event.key.startsWith('Arrow')) event.preventDefault();
    return true;
  }
};
