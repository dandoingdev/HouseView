import {createIdleManager, DEFAULT_CONTROL_SECONDS} from '../core/idle.js';
import * as ticker from '../core/ticker.js';
import {inCardPreview} from './screen-model.js';
import {isEditMode} from './screensaver.js';

const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'input',
  'change',
  'wheel',
  'click'
];

/** One lease on the shared ticker, only while a manually opened screen exists. No device commands. */
export const controlIdleMixin = {
  _controlIdleTarget() {
    if (!this.isConnected || !this._config || isEditMode(this) || inCardPreview(this)) return null;
    if (this._houseModes?.open && !this._houseModes.preview) return this._houseModes;
    if (this._quickActions?.open && !this._quickActions.preview) return this._quickActions;
    const active = this._screensaver?.active;
    return active?.entry.manual && !active.entry.preview ? active : null;
  },

  _controlIdleSync() {
    const target = this._controlIdleTarget();
    const seconds = this._config?.control_timeout ?? DEFAULT_CONTROL_SECONDS;
    if (target && seconds && this._controlIdle?.target === target) return;
    this._controlIdleStop();
    if (!target || !seconds) return;
    const pointers = new Set();
    const record = {target, pointers, idle: null};
    this._controlIdle = record;
    const activity = (event) => {
      if (event.type === 'pointerdown') pointers.add(event.pointerId);
      if (event.type !== 'pointermove' || pointers.has(event.pointerId)) record.idle.activity();
    };
    const release = (event) => {
      if (pointers.delete(event.pointerId)) record.idle.activity();
    };
    const visibility = () => {
      pointers.clear();
      record.idle.visibility(document.hidden);
    };
    const blur = () => {
      pointers.clear();
      record.idle.activity();
    };
    record.idle = createIdleManager({
      subscribe: (fn) => {
        const token = ticker.subscribe(fn);
        return () => ticker.unsubscribe(token);
      },
      timeout: seconds,
      blocked: () =>
        document.hidden ||
        pointers.size > 0 ||
        !!this._pending?.size ||
        !!this._quickActions?.busy?.size ||
        ['running', 'verifying'].includes(this._houseModes?.routine?.stage),
      onActivate: () => {
        if (this._controlIdleTarget() !== target) {
          this._controlIdleSync();
          return;
        }
        if (target === this._houseModes) {
          this._disposeHouseModeRequest?.();
          this._closeHouseModes();
        } else if (target === this._quickActions) this._closeQuickActions();
        else this._screensaver?.idle?.wake('api');
        record.idle.wake('api');
      },
      onDeactivate: () => {}
    });
    record.activity = activity;
    record.release = release;
    record.visibility = visibility;
    record.blur = blur;
    for (const type of ACTIVITY_EVENTS)
      this.shadowRoot.addEventListener(type, activity, {capture: true, passive: true});
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    record.idle.start();
  },

  _controlIdleStop() {
    const record = this._controlIdle;
    this._controlIdle = null;
    if (!record) return;
    record.idle.dispose();
    record.pointers.clear();
    for (const type of ACTIVITY_EVENTS)
      this.shadowRoot.removeEventListener(type, record.activity, true);
    document.removeEventListener('pointerup', record.release, true);
    document.removeEventListener('pointercancel', record.release, true);
    document.removeEventListener('visibilitychange', record.visibility);
    window.removeEventListener('blur', record.blur);
  }
};
