// Runs the per-widget hooks of the widget contract (docs/widget-api.md) for the mounted widgets:
// afterRender, tick, onHass. Hooks are widget code, so every call is isolated: a hook that throws is logged
// once and never stops the other widgets, the render, or Home Assistant's hass propagation.
//
// This file names no widget kind. The per-kind refresh methods (_clock, _camera, _countdowns) are
// kept as thin delegates that run the afterRender hooks of the widgets that declare the matching role
// (`layoutRoles`: clock, camera or timer).
import {createHookContext} from '../core/context.js';
import {getWidget} from '../core/registry.js';

/** The ticker fires about once a second; a hook due within this slack of its `every` runs on this tick. */
const TICK_SLACK_MS = 50;

const reported = new WeakSet();

/**
 * Call `owner[name](...args)` and swallow (but report once per hook function) anything it throws.
 * @returns {any} the hook's result, or undefined when it threw or does not exist
 */
export function guarded(owner, name, label, ...args) {
  const hook = owner?.[name];
  if (typeof hook !== 'function') return undefined;
  try {
    return hook.apply(owner, args);
  } catch (error) {
    if (!reported.has(hook)) {
      reported.add(hook);
      console.error(`[HouseView] ${label} failed`, error);
    }
    return undefined;
  }
}

export const hooksMixin = {
  /**
   * The context a widget hook receives: the render context plus the mounted tile and per-instance memory.
   * `ext` is the card-level state of the widget's own extension (undefined for widgets without one), so a
   * hook such as the timer's onHass can tell its alarm extension that a timer finished.
   */
  _hookContext(widget, index, el = null) {
    const ctx = createHookContext(this, widget, index, el);
    ctx.ext = this._ext?.[ctx.type];
    return ctx;
  },

  /** The tile root of a rendered widget (null for native cards and for widgets not on this page). */
  _tileOf(index) {
    const element = this._renderedCards?.get(index);
    return element?.localName === 'houseview-widget-card' ? element.firstElementChild : null;
  },

  /** `[widget, index, def]` for every widget of the current page that has a registered module. */
  _mountedWidgets() {
    const mounted = [];
    for (const index of this._renderedCards?.keys() || []) {
      const widget = this._config?.widgets?.[index];
      const def = widget && getWidget(widget.type);
      if (def) mounted.push([widget, index, def]);
    }
    return mounted;
  },

  /** Run every mounted widget's afterRender hook, then the extensions' (after a render or an update). */
  _runAfterRender() {
    for (const [widget, index, def] of this._mountedWidgets()) {
      if (!def.afterRender) continue;
      guarded(
        def,
        'afterRender',
        `${def.type}.afterRender`,
        this._hookContext(widget, index, this._tileOf(index))
      );
    }
    this._afterRenderExtensions();
  },

  /**
   * Tell the widgets that hass changed, before the render decision. Runs for every configured widget, also
   * those on other pages (the timer must notice a finished countdown wherever it is).
   * @param {any} previous  the hass object that was set before (undefined the first time)
   * @param {any} hass      the new one
   */
  _runOnHass(previous, hass) {
    for (const [index, widget] of (this._config?.widgets || []).entries()) {
      const def = getWidget(widget.type);
      if (!def?.onHass) continue;
      const ctx = this._hookContext(widget, index, this._tileOf(index));
      guarded(
        def,
        'onHass',
        `${def.type}.onHass`,
        ctx,
        previous?.states?.[widget.entity],
        hass?.states?.[widget.entity]
      );
    }
  },

  /** Re-render one widget in place (HookContext.requestRender). */
  _requestWidgetRender(index) {
    this._renderedCards?.get(index)?.update?.();
  },

  // ---- time ----------------------------------------------------------------------------------------------------

  /** One tick of the shared ticker: scheduled DOM work of the mounted widgets and of the extensions. */
  _tick(now = Date.now()) {
    if (!this._config) return;
    // Under an opaque screensaver nobody sees the clock hands, the countdown or the camera picture: no work, no
    // snapshot requests. `_resumeAfterCover` catches everything up the moment the layer goes.
    if (this._screensaverCovered?.()) return;
    for (const [widget, index, def] of this._mountedWidgets()) {
      const tick = def.tick;
      if (!tick) continue;
      this._tickWorkIfDue(
        index,
        tick.every,
        now,
        () =>
          guarded(
            tick,
            'run',
            `${def.type}.tick`,
            this._hookContext(widget, index, this._tileOf(index))
          ),
        tick.align
      );
    }
    this._tickExtensions(now);
  },

  /**
   * Run `work` unless it ran less than `every` ms ago. The first call always runs. With `align: 'minute'` the rule
   * is "unless it ran in this wall-clock minute", so a clock that shows minutes changes on the minute.
   */
  _tickWorkIfDue(key, every, now, work, align) {
    const last = this._tickAt.get(key);
    if (last !== undefined) {
      if (align === 'minute') {
        if (Math.floor(now / 60000) === Math.floor(last / 60000)) return;
      } else if (now - last < every - TICK_SLACK_MS) return;
    }
    this._tickAt.set(key, now);
    work();
  },

  /**
   * The screensaver layer has gone: bring the carousel up to date with what it missed while hidden. Native cards
   * get the latest hass, widget tiles are repainted if a watched state changed, and every scheduled job (camera
   * picture, countdown, clock hands) runs once now instead of waiting for its next turn.
   */
  _resumeAfterCover() {
    if (this._nativeHassStale) {
      this._nativeHassStale = false;
      this._forwardHassToNativeCards(this._hass);
    }
    if (this._underlayStale) {
      this._underlayStale = false;
      this._updateWidgets();
    }
    this._tickAt.clear();
    this._tick(Date.now());
  },

  // ---- per-kind refresh methods, kept as thin delegates -------------------------------------------------

  /** Refresh the dials of the clock widgets. */
  _clock() {
    this._refreshRole('clock');
  },

  /** Refresh the camera snapshots. */
  _camera() {
    this._refreshRole('camera');
  },

  /** Refresh the timer countdown texts. */
  _countdowns() {
    this._refreshRole('timer');
  },

  /** Run the afterRender hooks of the mounted widgets that declare `role` in their layoutRoles. */
  _refreshRole(role) {
    if (!this._config) return;
    for (const [widget, index, def] of this._mountedWidgets()) {
      if (!def.afterRender || !def.layoutRoles.includes(role)) continue;
      guarded(
        def,
        'afterRender',
        `${def.type}.afterRender`,
        this._hookContext(widget, index, this._tileOf(index))
      );
    }
  }
};
