// The screen model (which widgets go on which carousel page, at which size) and the layout pass that
// positions the current page. Ported from the original; the maths is unchanged.
import {buildScreens} from '../layout/index.js';

/** Height used for the carousel when nothing else is known, and the smallest height it is ever given. */
const MIN_HEIGHT = 250;
const FALLBACK_NAV_HEIGHT = 52;

const cssNumber = (element, property) =>
  parseFloat(getComputedStyle(element).getPropertyValue(property));

export const screenModelMixin = {
  /**
   * Work out the pages for the current size and remember them in `_screens`. The page the user is on
   * survives re-packing (`_screenKey`), falling back to the same index when its key disappeared.
   * @returns {{columns:number, height:number, contentHeight:number, maxRows:number, screen:Object}}
   */
  _screenModel() {
    if (this._config.single_widget) return this._singleWidgetModel();

    const width = this.getBoundingClientRect().width || window.innerWidth;
    const chrome = cssNumber(this, '--hv-chrome') || 0;
    const height = Math.max(
      MIN_HEIGHT,
      this.hasAttribute('tablet-mode')
        ? this.getBoundingClientRect().height || window.innerHeight
        : window.innerHeight - chrome
    );
    const columns = width < 520 ? 2 : width > height * 1.15 ? 5 : 3;
    const padding = width < 520 ? 20 : width < 1000 ? 40 : 48;
    const gap = width < 520 ? 8 : 14;
    const contentHeight = height - (cssNumber(this, '--hv-nav-height') || FALLBACK_NAV_HEIGHT);
    const maxRows = Math.max(2, Math.floor((contentHeight - padding + gap) / (145 + gap)));
    const screens = buildScreens(this._config.widgets, this._config.pages, columns, maxRows);
    if (!screens.length) {
      screens.push({
        ...(this._config.pages?.[0] || {}),
        key: 'Empty:0',
        label: this._config.pages?.[0]?.name || 'Home',
        columns,
        rows: 1,
        placements: []
      });
    }
    const oldKey = this._screenKey;
    this._screens = screens;
    let index = oldKey ? screens.findIndex((s) => s.key === oldKey) : 0;
    if (index < 0) index = Math.min(this._pageIndex || 0, screens.length - 1);
    this._pageIndex = Math.max(0, index);
    this._screenKey = screens[this._pageIndex]?.key;
    return {
      columns: screens[this._pageIndex]?.columns || columns,
      height,
      contentHeight,
      maxRows,
      width,
      screen: screens[this._pageIndex]
    };
  },

  /** A standalone card shows exactly one widget, sized by its host (or its configured / default height). */
  _singleWidgetModel() {
    const config = this._config;
    const height =
      config.single_widget_height ||
      this.getRootNode().host?.getBoundingClientRect().height ||
      config.single_widget_default_height ||
      280;
    const screen = {
      key: 'Widget:0',
      label: 'Widget',
      layout: 'controls',
      surface: 'teal',
      columns: 1,
      rows: 1,
      placements: [{widget: config.widgets[0], index: 0, x: 0, y: 0, w: 1, h: 1}]
    };
    this._screens = [screen];
    this._pageIndex = 0;
    this._screenKey = screen.key;
    return {
      columns: 1,
      height,
      contentHeight: height,
      maxRows: 1,
      width: this.getBoundingClientRect().width,
      screen
    };
  },

  /**
   * Position the current page: grid placement of each tile, clock dial size, shell height. When the model
   * says a different set of widgets belongs on the page (the window was resized), render again instead.
   *
   * Reads come first and writes after, so one pass costs at most one forced layout (the dial size needs the
   * tile's measured size, which only exists once the grid is written). A pass whose inputs equal the previous
   * pass writes nothing at all: the resize observer fires after our own height change, and a layout that
   * touches the DOM again would only wake the browser up for the same picture.
   * @param {Object} [model]  the result of `_screenModel` when the caller has just computed it (a render)
   */
  _layout(model) {
    if (!this._config?.widgets) return;
    this._tabletChrome();
    const face = this.shadowRoot.querySelector('.face');
    if (!face) return;
    model ||= this._screenModel();
    const screen = model.screen;
    const indices = screen.placements.map((p) => p.index).join(',');
    if (indices !== this._renderedIndices) {
      this._renderWidgets();
      return;
    }
    const key = [
      model.width,
      model.height,
      model.contentHeight,
      model.columns,
      screen.rows,
      screen.surface === 'soft',
      indices
    ].join('|');
    const shell = this.shadowRoot.querySelector('.shell');
    const nav = this._pageMarkup();
    if (key === this._layoutKey) {
      // the geometry is as written: at most the page buttons changed (a page appeared or went away)
      if (nav !== this._navHtml) this._writeNav(nav);
      return;
    }
    this._layoutKey = key;
    face.style.setProperty('--columns', model.columns);
    face.style.setProperty('--rows', screen.rows);
    face.style.height = `${model.contentHeight}px`;
    shell.style.height = `${model.height}px`;
    if (nav !== this._navHtml) this._writeNav(nav);
    for (const p of screen.placements) {
      const tile = face.querySelector(`[data-widget="${p.index}"]`);
      if (!tile) continue;
      tile.style.gridColumn = `${p.x + 1} / span ${p.w}`;
      tile.style.gridRow = `${p.y + 1} / span ${p.h}`;
    }
    for (const clock of face.querySelectorAll('.clock')) this._sizeDial(clock);
    // add/remove (not toggle): remove rewrites the class attribute even when the token is absent
    if (screen.surface === 'soft') shell.classList.add('surface-soft');
    else shell.classList.remove('surface-soft');
  },

  /** Replace the page navigation and remember its markup, so `_layout` can tell when it has changed. */
  _writeNav(markup = this._pageMarkup()) {
    this.shadowRoot.querySelector('.page-nav').innerHTML = markup;
    this._navHtml = markup;
  },

  /** The analogue dial fills its tile: square, as large as the tile allows (48..220 px). */
  _sizeDial(clock) {
    const dial = clock.querySelector('.dial');
    if (!dial) return;
    const size = Math.max(48, Math.min(clock.clientWidth - 36, clock.clientHeight - 70, 220));
    dial.style.width = `${size}px`;
    dial.style.height = `${size}px`;
  },

  /** Ask for one layout pass on the next animation frame; any number of requests in a frame cost one. */
  _scheduleLayout() {
    if (this._layoutFrame) return;
    this._layoutFrame = requestAnimationFrame(() => {
      this._layoutFrame = 0;
      this._layout();
    });
  },

  _cancelScheduledLayout() {
    if (this._layoutFrame) cancelAnimationFrame(this._layoutFrame);
    this._layoutFrame = 0;
  }
};
