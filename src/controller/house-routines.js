import {HOUSE_ROUTINES, routineChecks, routineFix} from '../core/house-routines.js';
import {houseModeState, canActivateHouseMode} from '../core/house-modes.js';
import {runActionConfig} from '../core/action-config.js';
import {iconHTML} from '../core/html.js';
import {t} from '../core/i18n.js';

export const ROUTINE_VERIFY_MS = 15000;
const keyFor = (mode) => (mode === 'away' ? 'leaving' : 'night');
const stateText = (hass, row, state) => {
  const key = `house_routines.state.${row.kind === 'opening' ? (state === 'off' ? 'closed' : state === 'on' ? 'open' : state) : state}`;
  const translated = t(hass, key);
  return translated === key ? state || t(hass, 'house_routines.unknown') : translated;
};

export const houseRoutinesMixin = {
  _disposeHouseRoutine(view = this._houseModes) {
    clearTimeout(view?.routine?.verificationHandle);
    if (view?.routine) view.routine.verificationHandle = null;
  },

  _showHouseRoutine(mode) {
    const view = this._houseModes;
    if (!view?.open || view.closing || !HOUSE_ROUTINES.includes(mode)) return;
    this._disposeHouseRoutine(view);
    view.routine = {mode, stage: 'review', before: [], error: '', fixErrors: new Map()};
    this.shadowRoot.querySelector('.hr-panel')?.remove();
    this._syncHouseModes();
    if (!view.preview) this.shadowRoot.querySelector('.hm-close')?.focus({preventScroll: true});
  },

  _backHouseRoutine() {
    const view = this._houseModes;
    if (!view?.routine || view.preview) return;
    if (['running', 'verifying'].includes(view.routine.stage)) return this._closeHouseModes();
    this._disposeHouseRoutine(view);
    view.routine = null;
    this.shadowRoot.querySelector('.hr-panel')?.remove();
    this._syncHouseModes();
    this.shadowRoot.querySelector('.hm-close')?.focus({preventScroll: true});
  },

  _reviewHouseRoutine() {
    const routine = this._houseModes?.routine;
    if (routine?.stage !== 'result') return;
    this._showHouseRoutine(routine.mode);
  },

  _syncHouseRoutine() {
    const view = this._houseModes;
    const root = this.shadowRoot.querySelector('.house-modes');
    if (!root) return;
    const routine = view?.routine;
    const focused = this.shadowRoot.activeElement;
    root.classList.toggle('is-routine', !!routine);
    if (!routine) return;
    const model = houseModeState(this._config, this._hass);
    const mode = model.items.find((item) => item.id === routine.mode);
    const rows = routineChecks(this._config, routine.mode, this._hass);
    const modeConfirmed =
      this._hass?.connected !== false && model.available && model.state.state === mode.option;
    if (
      routine.stage === 'verifying' &&
      modeConfirmed &&
      rows.every((row) => row.status === 'ready')
    ) {
      routine.stage = 'result';
      this._disposeHouseRoutine(view);
    }
    let panel = root.querySelector('.hr-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'hr-panel';
      panel.innerHTML = `<div class="hr-summary" role="status" aria-live="polite"><h3 class="hr-headline"></h3><p class="hr-counts"></p><button type="button" class="hm-info" data-action="house-mode-info" data-entity="routine" aria-controls="hr-description" aria-expanded="false">${iconHTML('information-outline')}</button></div><p class="hr-description" id="hr-description" hidden></p><p class="hr-mode-state"></p><p class="hr-message" role="status" aria-live="polite"></p><div class="hr-checks"></div><p class="hr-empty"></p>`;
      const list = panel.querySelector('.hr-checks');
      // These references belong to this routine panel and disappear with the view.
      routine.nodes = [];
      for (const row of rows) {
        const node = document.createElement('article');
        node.className = 'hr-check';
        node.dataset.checkIndex = row.index;
        node.innerHTML = `<span class="hr-icon">${iconHTML(row.icon)}</span><div class="hr-copy"><strong class="hr-name"></strong><span class="hr-detail"></span><small class="hr-expected"></small><small class="hr-fix-error" role="status"></small></div><button type="button" class="hr-fix" data-action="house-routine-fix" data-entity="check:${row.index}"></button>`;
        list.append(node);
        routine.nodes[row.index] = {
          node,
          name: node.querySelector('.hr-name'),
          detail: node.querySelector('.hr-detail'),
          expected: node.querySelector('.hr-expected'),
          error: node.querySelector('.hr-fix-error'),
          button: node.querySelector('.hr-fix')
        };
      }
      root.querySelector('.hm-scroll').append(panel);
    }
    let actions = root.querySelector('.hr-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'hr-actions';
      actions.innerHTML =
        '<button type="button" class="hr-start" data-action="house-routine-start"></button><button type="button" class="hr-back" data-action="house-routine-back"></button>';
      root.querySelector('.hm-footer').prepend(actions);
    }
    const set = (selector, text) => {
      const node = root.querySelector(selector);
      if (node.textContent !== text) node.textContent = text;
    };
    const headingTitle = t(this._hass, `house_routines.${keyFor(routine.mode)}`);
    set('.hm-heading h2', headingTitle);
    if (root.getAttribute('aria-label') !== headingTitle)
      root.setAttribute('aria-label', headingTitle);

    const info = panel.querySelector('.hm-info');
    const infoLabel = t(this._hass, 'house_modes.info', {name: headingTitle});
    if (info.getAttribute('aria-label') !== infoLabel) info.setAttribute('aria-label', infoLabel);
    if (info.disabled !== !!view.preview) info.disabled = !!view.preview;
    set('.hr-description', mode.description || t(this._hass, 'house_modes.setup'));
    const busy = ['running', 'verifying'].includes(routine.stage);
    const close = root.querySelector('.hm-close');
    const closeAction = busy ? 'house-modes-close' : 'house-routine-back';
    if (close.dataset.action !== closeAction) close.dataset.action = closeAction;
    const closeLabel = t(this._hass, busy ? 'house_modes.close' : 'house_routines.back');
    if (close.getAttribute('aria-label') !== closeLabel)
      close.setAttribute('aria-label', closeLabel);
    let attention = 0;
    let unknown = 0;
    for (const row of rows) {
      if (row.status === 'attention') attention++;
      else if (row.status === 'unknown') unknown++;
    }
    const ready = rows.length - attention - unknown;
    const title =
      routine.stage === 'running'
        ? 'running'
        : routine.stage === 'verifying'
          ? 'verifying'
          : routine.stage === 'result'
            ? routine.error
              ? 'failed'
              : unknown
                ? 'unverified'
                : attention
                  ? 'remaining'
                  : !modeConfirmed
                    ? 'mode_unconfirmed'
                    : rows.length
                      ? 'verified'
                      : 'mode_only'
            : rows.length
              ? attention || unknown
                ? 'review'
                : 'ready'
              : 'no_checks';
    set('.hr-headline', t(this._hass, `house_routines.${title}`));
    set(
      '.hr-counts',
      rows.length ? t(this._hass, 'house_routines.counts', {ready, attention, unknown}) : ''
    );
    const reported =
      this._hass?.connected === false
        ? t(this._hass, 'house_routines.unknown')
        : model.current
          ? t(this._hass, `house_modes.${model.current.id}`)
          : model.available
            ? model.state.state
            : t(this._hass, 'house_routines.unknown');
    set('.hm-heading small', t(this._hass, 'house_routines.current_short', {name: reported}));
    if (root.dataset.routineStage !== routine.stage) root.dataset.routineStage = routine.stage;
    const count = String(rows.length);
    if (root.dataset.routineChecks !== count) root.dataset.routineChecks = count;
    set(
      '.hr-mode-state',
      t(
        this._hass,
        routine.stage === 'result'
          ? modeConfirmed
            ? 'house_routines.mode_confirmed'
            : 'house_routines.mode_unconfirmed_detail'
          : 'house_routines.current',
        {name: reported}
      )
    );
    set(
      '.hr-message',
      routine.error ? t(this._hass, 'house_routines.partial_error', {reason: routine.error}) : ''
    );
    set('.hr-empty', rows.length ? '' : t(this._hass, 'house_routines.no_checks_detail'));
    for (const row of rows) {
      const {node, name, detail, expected, error, button} = routine.nodes[row.index];
      if (node.dataset.status !== row.status) node.dataset.status = row.status;
      const put = (slot, text) => {
        if (slot.textContent !== text) slot.textContent = text;
      };
      put(name, row.name);
      const wasReady = routine.before[row.index] === 'ready';
      const outcome =
        row.status === 'ready'
          ? routine.stage === 'result'
            ? wasReady
              ? 'already_ready'
              : 'now_ready'
            : 'check_ready'
          : row.status === 'unknown'
            ? 'check_unknown'
            : 'check_attention';
      put(
        detail,
        `${t(this._hass, `house_routines.${outcome}`)} · ${stateText(this._hass, row, row.actual)}`
      );
      put(
        expected,
        t(this._hass, 'house_routines.expected', {state: stateText(this._hass, row, row.expected)})
      );
      put(error, routine.fixErrors.get(row.entity) || '');
      const fix = routineFix(row, this._hass);
      const hidden = row.status === 'ready';
      const disabled = !!view.preview || busy || this._pending.has(row.entity);
      if (button.hidden !== hidden) button.hidden = hidden;
      if (button.disabled !== disabled) button.disabled = disabled;
      const label = t(this._hass, fix?.label || 'house_routines.details');
      if (button.textContent !== label) button.textContent = label;
      const accessible = `${label}: ${row.name}`;
      if (button.getAttribute('aria-label') !== accessible)
        button.setAttribute('aria-label', accessible);
    }
    // Reorder existing nodes only when a check changes group, keeping visual and keyboard order together.
    const list = panel.querySelector('.hr-checks');
    let next = list.firstElementChild;
    for (const status of ['attention', 'unknown', 'ready'])
      for (const row of rows) {
        if (row.status !== status) continue;
        const node = routine.nodes[row.index].node;
        if (node !== next) list.insertBefore(node, next);
        else next = next.nextElementSibling;
      }
    const start = root.querySelector('.hr-start');
    const startAction = routine.stage === 'result' ? 'house-routine-review' : 'house-routine-start';
    if (start.dataset.action !== startAction) start.dataset.action = startAction;
    const startDisabled =
      !!view.preview ||
      busy ||
      !!view.closing ||
      (routine.stage === 'review' &&
        (this._hass?.connected === false ||
          rows.some((row) => this._pending.has(row.entity)) ||
          !canActivateHouseMode(model, mode)));
    if (start.disabled !== startDisabled) start.disabled = startDisabled;
    const label =
      routine.stage === 'result'
        ? 'house_routines.review_again'
        : routine.stage === 'running'
          ? 'house_routines.running'
          : routine.stage === 'verifying'
            ? 'house_routines.verifying'
            : model.current?.id === mode.id
              ? 'house_routines.already_active'
              : routine.mode === 'away'
                ? 'house_routines.leave'
                : 'house_routines.goodnight';
    set('.hr-start', t(this._hass, label));
    set('.hr-back', t(this._hass, 'house_routines.back'));
    const back = root.querySelector('.hr-back');
    const backDisabled = !!view.preview || busy;
    if (back.disabled !== backDisabled) back.disabled = backDisabled;
    if (!view.preview && focused && root.contains(focused)) {
      if (focused.disabled || !focused.getClientRects().length) close.focus({preventScroll: true});
      else if (this.shadowRoot.activeElement !== focused) focused.focus({preventScroll: true});
    }
  },

  async _startHouseRoutine() {
    const view = this._houseModes;
    const routine = view?.routine;
    if (!routine || view.preview || view.closing || routine.stage !== 'review') return;
    const model = houseModeState(this._config, this._hass);
    const mode = model.items.find((item) => item.id === routine.mode);
    if (
      this._hass?.connected === false ||
      !canActivateHouseMode(model, mode) ||
      routineChecks(this._config, routine.mode, this._hass).some((row) =>
        this._pending.has(row.entity)
      )
    )
      return;
    routine.before = routineChecks(this._config, routine.mode, this._hass).map((row) => row.status);
    routine.stage = 'running';
    routine.error = '';
    this._syncHouseRoutine();
    let ok = false;
    try {
      ok = await this._setHouseMode(`house-mode:${routine.mode}`, {reviewed: true});
    } catch (error) {
      routine.error = error?.message || t(this._hass, 'house_routines.failed');
    }
    if (this._houseModes !== view || view.routine !== routine || view.closing) return;
    if (!ok) {
      routine.stage = 'result';
      routine.error = routine.error || this._message || t(this._hass, 'house_routines.interrupted');
    } else {
      routine.stage = 'verifying';
      routine.verificationHandle = setTimeout(
        () => this._finishHouseRoutine(routine),
        ROUTINE_VERIFY_MS
      );
    }
    this._syncHouseRoutine();
    if (!this.shadowRoot.activeElement || this.shadowRoot.activeElement.disabled)
      this.shadowRoot.querySelector('.hm-close')?.focus({preventScroll: true});
  },

  _finishHouseRoutine(routine = this._houseModes?.routine) {
    if (!routine || this._houseModes?.routine !== routine || routine.stage !== 'verifying') return;
    this._disposeHouseRoutine();
    routine.stage = 'result';
    this._syncHouseRoutine();
  },

  async _fixHouseRoutine(id) {
    const view = this._houseModes;
    const routine = view?.routine;
    if (!routine || view.preview || view.closing || !['review', 'result'].includes(routine.stage))
      return;
    if (!/^check:\d+$/.test(id || '')) return;
    const row = routineChecks(this._config, routine.mode, this._hass)[Number(id.slice(6))];
    if (!row || this._pending.has(row.entity)) return;
    const fix = routineFix(row, this._hass);
    if (!fix) return this._info(row.entity);
    routine.fixErrors.delete(row.entity);
    await runActionConfig(
      this,
      fix,
      'tap_action',
      () =>
        this._houseModes === view &&
        view.routine === routine &&
        !view.closing &&
        routineChecks(this._config, routine.mode, this._hass)[row.index]?.status === 'attention'
    );
    if (this._houseModes !== view || view.routine !== routine) return;
    if (this._message) routine.fixErrors.set(row.entity, this._message);
    this._syncHouseRoutine();
  }
};
