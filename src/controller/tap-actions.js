// A short press runs the control that was touched. A hold opens the widget's next screen: a different one when
// there is one, otherwise the screen the pressed key opens anyway. The hold fires while the finger is still down.
import {actionConfigFor, hasActionConfig, runActionConfig} from '../core/action-config.js';
import {settingsAction} from '../core/widget-settings.js';
import {createGestureDetector} from '../core/gesture.js';

/** How long after a release the browser may still deliver that press's click. */
const RELEASE_CLICK_MS = 450;

/** `{widget, index}` when `button` is the primary button of a widget with configured gestures, else null. */
export function configuredWidgetOf(card, button) {
  const attr = button?.getAttribute?.('data-widget');
  if (attr === null || attr === undefined) return null;
  const index = Number(attr);
  const widget = card._config?.widgets?.[index];
  return widget && hasActionConfig(widget) ? {widget, index} : null;
}

/** Actions that may start a hold gesture when pressed as a nested key (brightness, scenes, plants, expand). */
const HOLDABLE_ACTIONS = new Set([
  'info',
  'light-view',
  'climate-view',
  'scene-menu',
  'plants-view'
]);

/** Nested keys that still participate in hold detection (settings or expand). Operational keys stay immediate. */
const holdable = (action) =>
  HOLDABLE_ACTIONS.has(action) ||
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

/**
 * What a hold on `button` opens. A next screen that differs from the short press comes first. A key that opens a
 * screen itself (the brightness key, a details key, a sensor tile) opens that screen on a hold too: a long press
 * must not wait for the release, and a touch browser sends no click at all after one.
 */
function holdTarget(card, widget, button) {
  if (widget.hold_action != null) return {kind: 'config'};
  const own = button?.dataset?.action;
  const expand = expandPress(button);
  if (expand && expand.action !== own)
    return {kind: 'act', action: expand.action, entity: expand.entity};
  const action = settingsAction(card, widget);
  if (action && action !== own) return {kind: 'act', action, entity: widget.entity};
  if (holdable(own)) return {kind: 'act', action: own, entity: button.dataset.entity};
  return null;
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
  const hold = holdTarget(card, widget, button || tile);
  if (!hold && widget.double_tap_action == null) return null;
  return {widget, index, button: button || tile, hold};
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
          // Asked at every press: the key under the finger decides whether there is a screen to open.
          hold: () => {
            const current = widgetNow();
            return !!current && !!holdTarget(this, current, entry.button);
          },
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
            else if (target?.isConnected && !target.disabled && target.dataset.action) {
              this._act(target.dataset.action, target.dataset.entity);
            }
          },
          onHold: () => {
            const current = widgetNow();
            const target = entry.button;
            if (!target?.isConnected || target.disabled || !current) return;
            const hold = holdTarget(this, current, target);
            if (!hold) return;
            // The press is spent: it cannot turn into a page swipe, and its release belongs to nobody.
            this._gestureHeld = true;
            this._swipeCancel?.();
            if (hold.kind === 'config') run('hold_action');
            else this._act(hold.action, hold.entity);
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
    this._gestureHeld = false;
    this._guardGestureClick(event.pointerId);
    this._activeGesture.down(event);
  },

  /**
   * The detector runs this press from pointer events, so the click the browser adds after the release is surplus.
   * The card's own click listener already drops it. This drops it everywhere else: a hold opens its screen under
   * the finger, and the release would otherwise press whatever appeared there (the close key of the light view, a
   * switch in Home Assistant's dialog). A view that covers the card also keeps the release to itself, so the
   * release is heard here, on the window. The guard goes with the next press or shortly after the release.
   */
  _guardGestureClick(pointerId) {
    this._gestureClickGuard?.();
    let timer = null;
    const swallow = (event) => {
      if (Date.now() >= (this._suppressClickUntil || 0)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const drop = () => {
      clearTimeout(timer);
      window.removeEventListener('click', swallow, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.removeEventListener('pointerdown', next, true);
      if (this._gestureClickGuard === drop) this._gestureClickGuard = null;
    };
    const release = (event) => {
      if (event.pointerId !== pointerId || timer !== null) return;
      if (event.type === 'pointerup' && this._gestureHeld) {
        this._suppressClickUntil = Math.max(
          this._suppressClickUntil || 0,
          Date.now() + RELEASE_CLICK_MS
        );
      }
      timer = setTimeout(drop, RELEASE_CLICK_MS);
    };
    // A new press owns its own click.
    const next = (event) => {
      if (event.isPrimary !== false) drop();
    };
    window.addEventListener('click', swallow, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('pointerdown', next, true);
    this._gestureClickGuard = drop;
  },

  /** Keyboard equivalent for holding; also prevents the browser's native touch context menu. */
  _gestureContextMenu(event) {
    const pressed = pressTarget(this, event.target);
    if (!pressed) return false;
    event.preventDefault();
    // A touch browser reports its own long press here, during or right after a press the detector is handling.
    if (this._activeGesture || Date.now() < (this._suppressClickUntil || 0)) return true;
    const hold = pressed.hold;
    if (!hold) return true;
    if (hold.kind === 'config') {
      runActionConfig(this, pressed.widget, 'hold_action').catch((error) => {
        console.error('[HouseView] hold_action failed', error);
      });
    } else this._act(hold.action, hold.entity);
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
    this._gestureClickGuard?.();
  }
};
