// The screen model (which widgets go on which carousel page, at which size) and the layout pass that
// positions the current page. Ported from the original; the maths is unchanged.
import {editorPreviewFor} from '../core/editor-preview.js';
import {buildScreens} from '../layout/index.js';
import {isHomePage} from './render.js';

/** Height used for the carousel when nothing else is known, and the smallest height it is ever given. */
const MIN_HEIGHT = 250;
const FALLBACK_NAV_HEIGHT = 64;

const cssNumber = (element, property) =>
  parseFloat(getComputedStyle(element).getPropertyValue(property));

/** The picture sizes of the card editor's preview: the card is laid out at this size and scaled to fit the box. */
const PREVIEW_STAGES = {
  landscape: {width: 1280, height: 800},
  portrait: {width: 800, height: 1280}
};

/**
 * True inside the card editor's live preview. Home Assistant renders it as `<hui-card preview>` (older versions wrapped it
 * in `hui-card-preview`) inside the edit dialog; the walk goes up through shadow roots.
 */
export function inCardPreview(host) {
  for (let node = host; node; node = node.parentElement || node.getRootNode?.()?.host) {
    if (node.localName === 'hui-card-preview') return true;
    if (
      node.localName === 'hui-card' &&
      (node.preview === true || node.hasAttribute?.('preview'))
    ) {
      return true;
    }
  }
  return false;
}

export const screenModelMixin = {
  /**
   * Work out the pages for the current size and remember them in `_screens`. The page the user is on
   * survives re-packing (`_screenKey`), falling back to the same index when its key disappeared.
   * @returns {{columns:number, height:number, contentHeight:number, maxRows:number, screen:Object}}
   */
  _screenModel() {
    if (this._config.single_widget) return this._singleWidgetModel();

    const stage = this._previewStage();
    const width = stage ? stage.width : this.getBoundingClientRect().width || window.innerWidth;
    const chrome = cssNumber(this, '--hv-chrome') || 0;
    const height = stage
      ? stage.height
      : Math.max(
          MIN_HEIGHT,
          this.hasAttribute('tablet-mode')
            ? this.getBoundingClientRect().height || window.innerHeight
            : window.innerHeight - chrome
        );
    const columns = width < 520 ? 2 : width > height * 1.15 ? 5 : 3;
    const padding = width < 520 ? 20 : width < 1000 ? 40 : 48;
    const gap = width < 520 ? 8 : 14;
    const contentHeight =
      height - (cssNumber(this, '--hv-nav-height') || FALLBACK_NAV_HEIGHT) - this._headerHeight();
    const maxRows = Math.max(2, Math.floor((contentHeight - padding + gap) / (145 + gap)));
    const screens = buildScreens(this._config.widgets, this._config.pages, columns, maxRows);
    const target = inCardPreview(this) ? editorPreviewFor(this) : undefined;
    if (target?.kind === 'page' && !screens.some((screen) => screen.name === target.name)) {
      const page = this._config.pages?.find((page) => page.name === target.name);
      if (page)
        screens.push({
          ...page,
          key: `${page.name}:0`,
          label: page.name,
          columns,
          rows: 1,
          placements: []
        });
    }
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
    if (target?.kind === 'page') {
      const selected = screens.findIndex(
        (screen) =>
          screen.name === target.name &&
          (target.widget === undefined || screen.placements.some((p) => p.index === target.widget))
      );
      if (selected >= 0) index = selected;
    }
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

  /**
   * In the card editor the preview box is a narrow column, which would lay the dashboard out like a phone. Lay it out as
   * a wall tablet instead (`editor_preview`: landscape by default, portrait, or auto = the box as it is) and scale the
   * picture to fit the box. Null everywhere else.
   */
  _previewStage() {
    if (this._config?.single_widget) return null;
    const mode = this._config?.editor_preview ?? 'landscape';
    return mode !== 'auto' && inCardPreview(this) ? PREVIEW_STAGES[mode] : null;
  },

  /** Scale the laid-out stage to the width of the preview box (and give the host the matching height). */
  _applyPreviewScale(model) {
    const shell = this.shadowRoot.querySelector('.shell');
    if (!shell) return;
    const stage = this._previewStage();
    if (!stage) {
      if (this._previewScaled) {
        this._previewScaled = false;
        this.style.removeProperty('height');
        this.style.removeProperty('overflow');
        shell.style.removeProperty('width');
        shell.style.removeProperty('transform');
        shell.style.removeProperty('transform-origin');
      }
      return;
    }
    const boxWidth = this.getBoundingClientRect().width || stage.width;
    const scale = boxWidth / stage.width;
    this._previewScaled = true;
    this.style.height = `${Math.round(stage.height * scale)}px`;
    this.style.overflow = 'hidden';
    shell.style.width = `${stage.width}px`;
    shell.style.transformOrigin = '0 0';
    shell.style.transform = `scale(${scale.toFixed(4)})`;
    void model;
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
    this._applyPreviewScale(model);
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
    shell.classList.toggle('surface-home', isHomePage(screen));
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
