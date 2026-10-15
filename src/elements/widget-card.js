// `houseview-widget-card`: one HouseView widget as a Home Assistant card.
//
// It has two lives:
//   embedded    the carousel (`houseview-card`) creates it for every widget on the page and calls bind; the
//               controller owns state, actions and time, and the element only paints its widget's markup;
//   standalone  Home Assistant creates it from `type: custom:houseview-widget-card` (or a per-kind tag such as
//               `custom:houseview-light-card`). It then hosts a nested `houseview-card` in single-widget mode,
//               so the very same controller code serves both (the browser suite relies on the
//               nested controller, docs/architecture.md).
import {kinds, fromCard} from '../config/convert.js';
import {getWidget} from '../core/registry.js';
import {ensureNativeEditors} from '../editor/native-stack.js';
import {guarded} from '../controller/hooks.js';

/** Pixels per grid row in Home Assistant's sections view; getGridOptions derives rows from the height. */
const GRID_ROW_PX = 56;
const GRID_COLUMNS = 6;

const WRAPPER_CSS = ':host{display:block;min-width:0;height:100%}houseview-card{display:block}';

export class HouseViewWidgetCard extends HTMLElement {
  // ---- embedded ----------------------------------------------------------------------------------------------

  /**
   * Attach to a controller. `display: contents` makes the element invisible to layout: the tile inside is the
   * grid item.
   */
  bind(controller, widget, index) {
    this._embedded = true;
    this._controller = controller;
    this._widget = widget;
    this._index = index;
    this.style.display = 'contents';
    this.update(true);
  }

  /**
   * Repaint from the controller's current state. Unchanged markup is skipped (unless the widget asks for
   * `alwaysPatch`); changed markup is patched into the existing tile so focus, images and animations survive.
   * @param {boolean} [force]  replace the tile instead of patching it (first paint)
   */
  update(force = false) {
    if (!this._embedded) return;
    const controller = this._controller;
    const widget = this._widget;
    const def = getWidget(widget.type);
    let html;
    try {
      html = controller._widget(widget, this._index);
    } catch (error) {
      // One broken widget must not stop the rest of the page (or Home Assistant's state propagation).
      if (!this._renderFailed) console.error(`[HouseView] ${widget.type} render failed`, error);
      this._renderFailed = true;
      return;
    }
    this._renderFailed = false;
    if (!force && !def?.alwaysPatch && this._markup === html) return;
    this._markup = html;
    const tile = this.firstElementChild;
    if (!tile || force) {
      this.innerHTML = html;
      return;
    }
    this._patchTile(controller, def, tile, html);
  }

  /** Give the widget's own `patch` hook the first go; otherwise morph the tile with the controller's patcher. */
  _patchTile(controller, def, tile, html) {
    if (def?.patch) {
      const ctx = controller._hookContext(this._widget, this._index, tile);
      if (guarded(def, 'patch', `${def.type}.patch`, ctx, tile, html) === true) return;
    }
    const template = document.createElement('template');
    template.innerHTML = html;
    controller._patchNode(tile, template.content.firstElementChild, true);
  }

  // ---- standalone --------------------------------------------------------------------------------------------

  setConfig(config) {
    const kind = this.constructor.widgetKind || config.widget_type || 'clock';
    if (!kinds.includes(kind)) throw new Error('Select a HouseView widget type.');
    this._config = {...config, widget_type: kind};
    if (!this.shadowRoot) {
      this.attachShadow({mode: 'open'});
      this.shadowRoot.innerHTML = `<style>${WRAPPER_CSS}</style>`;
      this._inner = document.createElement('houseview-card');
      this.shadowRoot.append(this._inner);
    }
    const widget = fromCard({
      ...this._config,
      type: this._config.type || 'custom:houseview-widget-card'
    });
    this._inner.setConfig({
      widgets: [widget],
      single_widget: true,
      single_widget_height: config.height,
      single_widget_default_height: getWidget(kind).standaloneHeight,
      appearance: config.appearance || 'light',
      wallpaper: config.wallpaper || 'teal',
      camera_gallery: config.camera_gallery,
      ...(config.performance === undefined ? {} : {performance: config.performance})
    });
    if (this._hass) this._inner.hass = this._hass;
  }

  set hass(hass) {
    this._hass = hass;
    if (this._embedded) this.update();
    else if (this._inner) this._inner.hass = hass;
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return getWidget(this._config?.widget_type)?.cardRows ?? 3;
  }

  /** Sections-view size: 6 columns, rows from the height, plus the widget's own minimums. */
  getGridOptions() {
    const def = getWidget(this._config?.widget_type);
    const height = this._config?.height || def?.standaloneHeight || 240;
    return {columns: GRID_COLUMNS, rows: Math.ceil(height / GRID_ROW_PX), ...def?.gridOptions};
  }

  static async getConfigElement() {
    await ensureNativeEditors();
    return document.createElement('houseview-widget-editor');
  }

  /** A starting config for the picker: this kind, the first matching entity in Home Assistant, normal size. */
  static getStubConfig(hass) {
    const kind = this.widgetKind || 'clock';
    const def = getWidget(kind);
    const domains = def?.domains ?? [kind];
    const entity = Object.keys(hass?.states || {}).find((id) => domains.includes(id.split('.')[0]));
    return {widget_type: kind, ...(entity ? {entity} : {}), size: 'normal', ...def?.stub?.(hass)};
  }
}
