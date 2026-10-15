// Home Assistant style `tap_action` / `hold_action` / `double_tap_action` on a widget's primary button
// (opt-in, docs/architecture.md). Without those keys nothing in this file runs and the click
// goes to the internal action.
//
// The primary button of a widget is its root `<button data-widget="N">` (light, switch, sensor... the
// tile-style widgets). The inner controls of panels (cover keys, presets, transport, climate +/-) stay
// internal actions and never come through here.
//
//   click on the primary button of a widget that has tap_action  -> core/action-config.js runs tap_action
//   hold_action or double_tap_action configured                  -> a gesture detector (core/gesture.js) watches
//                                                                   the pointer and decides tap / hold / double
import {
  actionConfigFor,
  hasActionConfig,
  needsGestures,
  runActionConfig
} from '../core/action-config.js';
import {createGestureDetector} from '../core/gesture.js';

/** `{widget, index}` when `button` is the primary button of a widget with configured gestures, else null. */
export function configuredWidgetOf(card, button) {
  const attr = button?.getAttribute?.('data-widget');
  if (attr === null || attr === undefined) return null;
  const index = Number(attr);
  const widget = card._config?.widgets?.[index];
  return widget && hasActionConfig(widget) ? {widget, index} : null;
}

export const tapActionsMixin = {
  /**
   * A click on `button`. Returns true when the widget's tap_action took it, false when the caller should run
   * the button's internal action.
   */
  _runTapAction(button) {
    const configured = configuredWidgetOf(this, button);
    if (!configured || !actionConfigFor(configured.widget, 'tap_action')) return false;
    runActionConfig(this, configured.widget, 'tap_action').catch((error) => {
      console.error('[HouseView] tap_action failed', error);
    });
    return true;
  },

  /**
   * The gesture entry `{detector, button}` of a widget that needs one (hold or double tap), created on first
   * use. `button` is the tile pressed last: a tap the detector reports later (after the double-tap window)
   * runs that tile's internal action.
   */
  _gestureEntryFor(index, button) {
    const entries = (this._gestureEntries ||= new Map());
    let entry = entries.get(index);
    if (!entry) {
      const widgetNow = () => this._config?.widgets?.[index];
      const run = (gesture) => {
        runActionConfig(this, widgetNow(), gesture).catch((error) => {
          console.error(`[HouseView] ${gesture} failed`, error);
        });
      };
      const widget = widgetNow();
      entry = {
        button,
        detector: createGestureDetector({
          hold: widget.hold_action != null,
          doubleTap: widget.double_tap_action != null,
          onTap: () => {
            const current = widgetNow();
            const target = entry.button;
            if (current && actionConfigFor(current, 'tap_action')) run('tap_action');
            else if (target?.isConnected && !target.disabled) {
              this._act(target.dataset.action, target.dataset.entity);
            }
          },
          onHold: () => run('hold_action'),
          onDoubleTap: () => run('double_tap_action'),
          suppressClick: (until) => {
            this._suppressClickUntil = Math.max(this._suppressClickUntil || 0, until);
          }
        })
      };
      entries.set(index, entry);
    }
    entry.button = button;
    return entry;
  },

  /** pointerdown: start watching when the pressed tile's widget uses hold or double tap. */
  _gesturePointerDown(event) {
    this._activeGesture = null;
    const button = event.target?.closest?.('button[data-widget]');
    if (!button || button.disabled) return;
    const configured = configuredWidgetOf(this, button);
    if (!configured || !needsGestures(configured.widget)) return;
    this._activeGesture = this._gestureEntryFor(configured.index, button).detector;
    this._activeGesture.down(event);
  },

  _gesturePointerMove(event) {
    this._activeGesture?.move(event);
  },

  _gesturePointerUp(event) {
    const detector = this._activeGesture;
    this._activeGesture = null;
    detector?.up(event);
  },

  _gesturePointerCancel() {
    this._activeGesture?.cancel();
    this._activeGesture = null;
  },

  /** Forget gestures in flight (the config changed or the card left the page). */
  _disposeGestures() {
    for (const {detector} of this._gestureEntries?.values() || []) detector.dispose();
    this._gestureEntries?.clear();
    this._activeGesture = null;
  }
};
