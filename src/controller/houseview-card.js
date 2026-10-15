// HouseViewCard: the carousel controller (`<houseview-card>`).
//
// ONE class. Its body holds only the constructor, setConfig, the hass setter, the lifecycle callbacks and the
// statics Home Assistant calls; every other method is a mixin of plain functions that use `this`
// (core/mixin.js), grouped by concern in the files next to this one. No method or field of was renamed
// (docs/architecture.md), so the browser suite and old configs keep working.
import {validateConfig} from '../config/validate.js';
import {mixin} from '../core/mixin.js';
import {hassChanged} from '../core/hass-signature.js';
import {resolvePerformance} from '../core/performance.js';
import {onRegistryChange} from '../core/registry.js';
import {subscribe, unsubscribe} from '../core/ticker.js';
import {ensureNativeEditors} from '../editor/native-stack.js';
import {dimMixin} from './dim.js';
import {bindEvents} from './events.js';
import {extensionsMixin, syncCompat} from './extensions.js';
import {hooksMixin} from './hooks.js';
import {nativeCardMixin} from './native-card.js';
import {navigationMixin} from './navigation.js';
import {pageTransitionMixin} from './page-transition.js';
import {patchMixin} from './patch.js';
import {renderMixin} from './render.js';
import {screenModelMixin} from './screen-model.js';
import {screensaverMixin} from './screensaver.js';
import {stateMixin} from './state.js';
import {stylesMixin} from './styles.js';
import {tabletChromeMixin} from './tablet-chrome.js';
import {tapActionsMixin} from './tap-actions.js';

export class HouseViewCard extends HTMLElement {
  constructor() {
    super();
    this._onResize = () => this._scheduleLayout();
    this._observer = new ResizeObserver(() => this._scheduleLayout());
    this.attachShadow({mode: 'open'});
    this._pending = new Set();
    this._tickAt = new Map();
    this._ext = {};
    this._perf = 'full';
    this._ensureExtensionState();
    bindEvents(this);
  }

  /**
   * Validate and adopt a config, then render. Throws `Error(<message>)` for a broken config and keeps the
   * previous one in that case (the pipeline is config/validate.js).
   */
  setConfig(config) {
    const validated = validateConfig(config);
    this._disposeGestures();
    this._config = validated;
    // 'lite' or 'full' for the life of this config (the device does not change under a card)
    this._perf = resolvePerformance(validated.performance);
    if (validated.widgets) this._ensureCardHelpers();
    this._ensureExtensionState();
    this._screensaverSetConfig(this._config);
    this._render();
  }

  get hass() {
    return this._hass;
  }

  set hass(hass) {
    this._applyHass(hass);
    this._screensaverHass();
  }

  connectedCallback() {
    this._start();
    this._observer.observe(this);
    window.addEventListener('resize', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    // Coming back to the page (Home Assistant detaches cards when views change): refill what disconnect released.
    if (this._renderedCards?.size) this._runAfterRender();
    this._screensaverConnect();
  }

  disconnectedCallback() {
    this._screensaverDisconnect();
    this._clearPageTransition();
    this._disposeGestures();
    this._disposeExtensions('disconnect');
    this._observer.disconnect();
    window.removeEventListener('resize', this._onResize);
    window.visualViewport?.removeEventListener('resize', this._onResize);
    this._cancelScheduledLayout();
    this._restoreChrome();
    this._stop();
  }

  /** Subscribe to the shared 1 s ticker. `_timer` is the subscription token (null while disconnected). */
  _start() {
    if (this._timer) return;
    this._tickAt.clear();
    this._timer = subscribe((now) => this._tick(now));
  }

  _stop() {
    unsubscribe(this._timer);
    this._timer = null;
  }

  /**
   * The body of the hass setter. In order: remember hass, give native cards their updates, tell the widgets,
   * then re-render only when something this card shows has changed (core/hass-signature.js).
   */
  _applyHass(hass) {
    const previous = this._hass;
    this._hass = hass;
    // Under an opaque screensaver native cards stay as they were; `_resumeAfterCover` hands them the latest hass.
    if (this._screensaverCovered?.()) this._nativeHassStale = true;
    else this._forwardHassToNativeCards(hass);
    this._runOnHass(previous, hass);
    if (!this._config) return;
    if (!hassChanged(this, hass)) return;
    if (this._config.widgets && this.shadowRoot.querySelector('.shell.adaptive')) {
      this._updateWidgets();
    } else {
      this._render();
    }
  }

  /** Rough size for Home Assistant's masonry view. */
  getCardSize() {
    return 10;
  }

  /** The carousel fills its column in the sections view. */
  getGridOptions() {
    return {columns: 'full'};
  }

  static async getConfigElement() {
    await ensureNativeEditors();
    return document.createElement('houseview-editor');
  }

  static getStubConfig() {
    return {
      pages: [{name: 'Home', surface: 'teal', layout: 'auto'}],
      cards: [{type: 'custom:houseview-clock-card', page: 'Home'}]
    };
  }
}

mixin(
  HouseViewCard.prototype,
  stateMixin,
  screenModelMixin,
  navigationMixin,
  pageTransitionMixin,
  renderMixin,
  patchMixin,
  hooksMixin,
  extensionsMixin,
  tabletChromeMixin,
  nativeCardMixin,
  dimMixin,
  stylesMixin,
  tapActionsMixin,
  screensaverMixin
);

// Private names that live in widget extensions (_galleryOpen, _alarm...) are accessors on the prototype,
// kept in step with the registry: a widget registered later adds its names.
syncCompat(HouseViewCard.prototype);
onRegistryChange(() => syncCompat(HouseViewCard.prototype));
