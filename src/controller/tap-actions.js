// Widget taps keep everyday actions; holding opens controls or Home Assistant settings.
import {actionConfigFor, hasActionConfig, runActionConfig} from '../core/action-config.js';
import {settingsAction} from '../core/widget-settings.js';
import {createGestureDetector} from '../core/gesture.js';

/** `{widget, index}` when `button` is the primary button of a widget with configured gestures, else null. */
export function configuredWidgetOf(card, button) {
  const attr = button?.getAttribute?.('data-widget');
  if (attr === null || attr === undefined) return null;
  const index = Number(attr);
  const widget = card._config?.widgets?.[index];
  return widget && hasActionConfig(widget) ? {widget, index} : null;
}

const SETTINGS_ACTIONS = new Set([
  'info',
  'light-view',
  'climate-view',
  'scene-menu',
  'plants-view'
]);

/** Settings keys open on hold. A tiny player's track title opens the full player on hold as well as tap. */
const holdable = (action) =>
  SETTINGS_ACTIONS.has(action) ||
  String(action || '').startsWith('media-player-expand-') ||
  String(action || '').startsWith('plants-');

/** Full-screen player opened from a compact music tile, or null. */
function expandPress(button) {
  const direct = button?.dataset?.action || '';
  if (direct.startsWith('media-player-expand-'))
    return {action: direct, entity: button.dataset.entity};
  const tile = button?.classList?.contains('mc-compact')
    ? button
    : button?.closest?.('.mc-compact');
  const details = tile?.querySelector?.('.mc-details');
  const action = details?.dataset?.action || '';
  if (!action.startsWith('media-player-expand-')) return null;
  return {action, entity: details.dataset.entity};
}

function pressTarget(card, target) {
  if (target?.closest?.('.hv-screensaver, .ov-scene')) return null;
  const tile = target?.closest?.('[data-widget]');
  if (!tile) return null;
  const index = Number(tile.dataset.widget);
  const widget = card._config?.widgets?.[index];
  if (!widget) return null;
  const button = target.closest('button');
  if (button?.disabled) return null;
  // Nested operational keys (transport, volume, temperature steps...) remain direct controls.
  if (button && button !== tile && !holdable(button.dataset.action)) return null;
  const action = settingsAction(card, widget);
  if (!action && widget.hold_action == null && widget.double_tap_action == null) return null;
  return {widget, index, button: button || tile, action};
}

export const tapActionsMixin = {
  /**
   * A click on `button`. Returns true when the widget's tap_action took it, false when the caller should run
   * the button's internal action.
   */
  _runTapAction(button) {
    const configured = configuredWidgetOf(this, button);
    if (!configured || !actionConfigFor(configured.widget, 'tap_action')) {
      return !!pressTarget(this, button) && SETTINGS_ACTIONS.has(button.dataset.action);
    }
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
          hold: widget.hold_action != null || !!settingsAction(this, widget),
          doubleTap: widget.double_tap_action != null,
          onTap: () => {
            const current = widgetNow();
            const target = entry.button;
            if (
              current &&
              target?.matches('button[data-widget]') &&
              actionConfigFor(current, 'tap_action')
            )
              run('tap_action');
            else if (
              target?.isConnected &&
              !target.disabled &&
              target.dataset.action &&
              !SETTINGS_ACTIONS.has(target.dataset.action)
            ) {
              this._act(target.dataset.action, target.dataset.entity);
            }
          },
          onHold: () => {
            const current = widgetNow();
            const target = entry.button;
            if (!target?.isConnected || target.disabled || !current) return;
            const expand = expandPress(target);
            // A configured hold_action stays the override. Otherwise a compact player opens full screen
            // before speaker settings, which remain on the title inside that player.
            if (current.hold_action != null) run('hold_action');
            else if (expand) this._act(expand.action, expand.entity);
            else {
              const action = settingsAction(this, current);
              if (action) this._act(action, current.entity);
            }
          },
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
    this._gesturePointerCancel();
    if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
    const pressed = pressTarget(this, event.target);
    if (!pressed) return;
    this._activeGesture = this._gestureEntryFor(pressed.index, pressed.button).detector;
    this._activeGesture.down(event);
  },

  /** Keyboard equivalent for holding; also prevents the browser's native touch context menu. */
  _gestureContextMenu(event) {
    const pressed = pressTarget(this, event.target);
    if (!pressed) return false;
    event.preventDefault();
    if (this._activeGesture) return true;
    const expand = expandPress(pressed.button);
    if (pressed.widget.hold_action != null) {
      runActionConfig(this, pressed.widget, 'hold_action').catch((error) => {
        console.error('[HouseView] hold_action failed', error);
      });
    } else if (expand) this._act(expand.action, expand.entity);
    else if (pressed.action) this._act(pressed.action, pressed.widget.entity);
    return true;
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
