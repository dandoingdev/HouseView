import {HOUSE_ROUTINES} from '../core/house-routines.js';
import {houseModeViewHTML} from '../core/house-mode-view.js';
import {homePullRelease, swipeAxis, SWIPE_CLICK_GUARD_MS} from '../core/swipe.js';
import {houseModeState, canActivateHouseMode} from '../core/house-modes.js';
import {iconHTML} from '../core/html.js';
import {t} from '../core/i18n.js';
import {requestConfirmation} from '../core/confirm.js';
import {runActionConfig} from '../core/action-config.js';
import {inCardPreview} from './screen-model.js';

export const houseModesMixin = {
  _disposeHouseModeRequest() {
    if (this._houseModeRequest)
      this.shadowRoot?.querySelector('.hv-house-mode-confirm [data-confirm="no"]')?.click();
    this._houseModeRequest = null;
    this._houseModeFeedback = null;
  },

  _syncHouseModeIndicator(header) {
    let button = header.querySelector('.house-mode-indicator');
    header.classList.toggle('has-house-mode', !!this._config?.house_mode_entity);
    if (!this._config?.house_mode_entity) {
      button?.remove();
      return;
    }
    const model = houseModeState(this._config, this._hass);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'house-mode-indicator';
      button.dataset.action = 'house-modes-open';
      button.innerHTML = '<span></span><strong></strong>';
      header.append(button);
    }
    const name = model.current
      ? t(this._hass, `house_modes.${model.current.id}`)
      : t(this._hass, model.available ? 'house_modes.other' : 'house_modes.unavailable');
    const icon = model.current?.icon || 'home-alert-outline';
    if (button.dataset.icon !== icon) {
      button.dataset.icon = icon;
      button.querySelector('span').innerHTML = iconHTML(icon);
    }
    const label = button.querySelector('strong');
    if (label.textContent !== name) label.textContent = name;
    const labelText = t(this._hass, 'house_modes.indicator', {name});
    if (button.getAttribute('aria-label') !== labelText)
      button.setAttribute('aria-label', labelText);
    const mode = model.current?.id || 'unknown';
    if (button.dataset.mode !== mode) button.dataset.mode = mode;
  },

  _openHouseModes({preview = false} = {}) {
    if (
      (!preview && !this._config?.house_mode_entity) ||
      this._config?.single_widget ||
      this._navigationBlocked() ||
      this._swipeCovered()
    )
      return;
    this._swipeCancel();
    this._houseModes = {
      open: true,
      config: this._config,
      focus: this.shadowRoot.activeElement,
      preview
    };
    this._syncHouseModes();
    this._controlIdleSync?.();
    const root = this.shadowRoot.querySelector('.house-modes');
    if (this._houseModesAnimate(root))
      this._houseModes.animation = root.animate(
        [{transform: 'translateX(-100%)'}, {transform: 'translateX(0)'}],
        {duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)'}
      );
    if (!preview) root.querySelector('.hm-close').focus({preventScroll: true});
  },

  _houseModesAnimate(root) {
    return (
      !!root?.animate &&
      !this._houseModes?.preview &&
      this._perf !== 'lite' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  },

  _closeHouseModes() {
    const view = this._houseModes;
    if (!view || view.closing || view.preview) return;
    view.closing = true;
    this._suppressClickUntil = Date.now() + SWIPE_CLICK_GUARD_MS;
    const finish = () => {
      if (this._houseModes !== view) return;
      this._disposeHouseModes();
      const focus =
        view.focus?.isConnected && !view.focus.disabled
          ? view.focus
          : this.shadowRoot.querySelector('.house-mode-indicator,.page-dot.selected');
      focus?.focus({preventScroll: true});
    };
    const root = this.shadowRoot.querySelector('.house-modes');
    view.animation?.cancel();
    if (this._houseModesAnimate(root)) {
      view.animation = root.animate(
        [{transform: 'translateX(0)'}, {transform: 'translateX(-100%)'}],
        {duration: 180, easing: 'ease-in', fill: 'forwards'}
      );
      void view.animation.finished.then(finish, finish);
    } else finish();
  },

  _disposeHouseModes() {
    const view = this._houseModes;
    this._disposeHouseRoutine(view);
    this._houseModes = null;
    this._controlIdleSync?.();
    this._disposeHouseModeRequest();
    view?.animation?.cancel();
    this.shadowRoot?.querySelector('.house-modes')?.remove();
  },

  _syncHouseModes() {
    const view = this._houseModes;
    if (!view?.open) return;
    if (view.config !== this._config) return this._disposeHouseModes();
    const shell = this.shadowRoot.querySelector('.shell');
    if (!shell) return;
    let root = shell.querySelector('.house-modes');
    if (!root) {
      root = document.createElement('section');
      root.className = 'house-modes';
      root.setAttribute('role', view.preview ? 'region' : 'dialog');
      if (!view.preview) root.setAttribute('aria-modal', 'true');
      root.innerHTML = houseModeViewHTML();
      shell.append(root);
      this._bindHouseModes(root);
    }
    if (view.routine) {
      this._syncHouseRoutine();
      return;
    }
    const model = houseModeState(this._config, this._hass);
    const set = (selector, value) => {
      const node = root.querySelector(selector);
      if (node.textContent !== value) node.textContent = value;
    };
    const title = t(this._hass, 'house_modes.screen_title');
    if (root.getAttribute('aria-label') !== title) root.setAttribute('aria-label', title);
    set('.hm-heading small', '');
    set('.hm-heading h2', title);
    set('.hm-caption', t(this._hass, 'house_modes.current'));
    set(
      '.hm-current-name > span:last-child',
      model.current
        ? t(this._hass, `house_modes.${model.current.id}`)
        : t(this._hass, model.available ? 'house_modes.other' : 'house_modes.unavailable')
    );
    const icon = root.querySelector('.hm-current-icon');
    const name = model.current?.icon || 'home-alert-outline';
    if (icon.dataset.icon !== name) {
      icon.dataset.icon = name;
      icon.innerHTML = iconHTML(name);
    }
    const end = root.querySelector('.hm-end');
    const hideEnd = !model.current || model.current.id === 'home';
    if (end.hidden !== hideEnd) end.hidden = hideEnd;
    set('.hm-end', t(this._hass, 'house_modes.return'));
    const close = root.querySelector('.hm-close');
    if (close.dataset.action !== 'house-modes-close') close.dataset.action = 'house-modes-close';
    if (close.disabled !== view.preview) close.disabled = view.preview;
    const closeLabel = t(this._hass, 'house_modes.close');
    if (close.getAttribute('aria-label') !== closeLabel)
      close.setAttribute('aria-label', closeLabel);
    for (const button of root.querySelectorAll('.hm-mode')) {
      const mode = model.items.find((mode) => mode.id === button.dataset.houseMode);
      const active = model.current?.id === mode.id;
      const selected = String(active);
      if (button.getAttribute('aria-pressed') !== selected)
        button.setAttribute('aria-pressed', selected);
      const label = button.querySelector('.hm-name');
      const text = t(this._hass, `house_modes.${mode.id}`);
      if (label.textContent !== text) label.textContent = text;
      const mark = button.querySelector('.hm-mark');
      const glyph = active ? 'check-circle' : 'chevron-right';
      if (mark.dataset.icon !== glyph) {
        mark.dataset.icon = glyph;
        mark.innerHTML = iconHTML(glyph);
      }
    }
    this._syncHouseModeStatus();
    this._syncHouseRoutine();
  },

  _bindHouseModes(root) {
    let start;
    root.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      start = null;
      if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0))
        return;
      start = {x: event.clientX, y: event.clientY, pointer: event.pointerId};
    });
    root.addEventListener('pointermove', (event) => {
      event.stopPropagation();
      if (start?.pointer !== event.pointerId) return;
      const dx = event.clientX - start.x,
        dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) > 10) start.moved = true;
      if (swipeAxis(dx, dy) === 'horizontal') root.setPointerCapture?.(event.pointerId);
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
        homePullRelease(event.clientY - gesture.y, gesture.x - event.clientX)
      )
        this._closeHouseModes();
    });
  },

  _houseModesKeydown(event) {
    const view = this._houseModes;
    if (view?.preview) return false;
    if (!view?.open) {
      if (event.altKey && event.key === 'ArrowRight' && this._config?.house_mode_entity) {
        event.preventDefault();
        this._openHouseModes();
        return true;
      }
      return false;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (view.routine && !['running', 'verifying'].includes(view.routine.stage))
        this._backHouseRoutine();
      else this._closeHouseModes();
    } else if (event.key === 'Tab') {
      const buttons = [
        ...this.shadowRoot.querySelectorAll('.house-modes button:not(:disabled):not([hidden])')
      ].filter((button) => button.getClientRects().length);
      const index = buttons.indexOf(this.shadowRoot.activeElement);
      event.preventDefault();
      buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    } else if (event.key.startsWith('Arrow')) event.preventDefault();
    return true;
  },

  _syncHouseModeStatus() {
    if (!this._config?.house_mode_entity) return;
    const nodes = this.shadowRoot.querySelectorAll('.hm-status');
    if (!nodes.length) return;
    const model = houseModeState(this._config, this._hass);
    const busy =
      this._pending.has(model.entity) || !!(this._houseModeRequest && this._houseModeFeedback);
    const feedback = this._houseModeFeedback;
    const waiting = feedback && feedback.option !== model.state?.state;
    if (feedback && !this.shadowRoot.activeElement)
      this.shadowRoot.querySelector('.hm-close')?.focus({preventScroll: true});
    const message = busy
      ? t(this._hass, 'house_modes.changing')
      : feedback?.error ||
        (waiting ? t(this._hass, 'house_modes.waiting', {name: feedback.name}) : '');
    for (const node of nodes) {
      if (node.textContent !== message) node.textContent = message;
    }
    for (const button of this.shadowRoot.querySelectorAll('.hm-mode,.hm-end')) {
      const item = model.items.find((item) => `house-mode:${item.id}` === button.dataset.entity);
      const disabled =
        !!this._houseModes?.preview ||
        !!this._houseModes?.closing ||
        busy ||
        (!HOUSE_ROUTINES.includes(item?.id) && !canActivateHouseMode(model, item));
      if (button.disabled !== disabled) button.disabled = disabled;
    }
  },

  async _setHouseMode(id, {reviewed = false} = {}) {
    const config = this._config;
    const model = houseModeState(config, this._hass);
    const mode = model.items.find((item) => `house-mode:${item.id}` === id);
    if (
      inCardPreview(this) ||
      !this._houseModes?.open ||
      this._houseModes.preview ||
      this._houseModes.closing ||
      this._houseModeRequest ||
      this._pending.has(model.entity)
    )
      return;
    if (!reviewed && HOUSE_ROUTINES.includes(mode?.id)) {
      this._showHouseRoutine(mode.id);
      return false;
    }
    if (!canActivateHouseMode(model, mode)) return false;
    const request = {config};
    const initialState = model.state.state;
    this._houseModeFeedback = null;
    this._houseModeRequest = request;
    const name = t(this._hass, `house_modes.${mode.id}`);
    const current = () => {
      if (!this.isConnected || this._config !== config || this._houseModeRequest !== request)
        return false;
      const latest = houseModeState(config, this._hass);
      const choice = latest.items.find((item) => item.id === mode.id);
      if (!request.scriptFinished && mode.script && this._pending.has(mode.script)) return false;
      // The named script call has completed successfully; its state event may arrive after its response.
      if (request.scriptFinished) choice.scriptAvailable = true;
      return latest.state?.state === initialState && canActivateHouseMode(latest, choice);
    };
    try {
      const yes =
        reviewed ||
        (await requestConfirmation(this, mode.description, {
          inline: true,
          title: t(
            this._hass,
            mode.id === 'home' ? 'house_modes.return_title' : 'house_modes.activate_title',
            {name}
          ),
          accept: t(
            this._hass,
            mode.id === 'home' ? 'house_modes.return' : 'house_modes.activate',
            {
              name
            }
          ),
          className: 'hv-house-mode-confirm',
          targetSize: 64
        }));
      if (!yes || !current()) return;
      this._houseModeFeedback = {option: mode.option, name};
      if (mode.script) {
        await runActionConfig(
          this,
          {
            entity: mode.script,
            tap_action: {
              action: 'perform-action',
              perform_action: mode.script
            }
          },
          'tap_action',
          current
        );
        if (this._message) return;
        request.scriptFinished = true;
        if (!current()) return;
      }
      await runActionConfig(
        this,
        {
          entity: model.entity,
          tap_action: {
            action: 'perform-action',
            perform_action: `${model.entity.split('.')[0]}.select_option`,
            target: {entity_id: model.entity},
            data: {option: mode.option}
          }
        },
        'tap_action',
        current
      );
      return !this._message && this._houseModeRequest === request;
    } finally {
      if (this._houseModeRequest === request) {
        this._houseModeRequest = null;
        if (this._houseModeFeedback && this._message) this._houseModeFeedback.error = this._message;
        this._syncHouseModeStatus();
        if (!this.shadowRoot.activeElement || this.shadowRoot.activeElement.disabled)
          (
            this.shadowRoot.querySelector('.hm-close') ||
            this.shadowRoot.querySelector('.house-mode-indicator')
          )?.focus({preventScroll: true});
      }
    }
  }
};
