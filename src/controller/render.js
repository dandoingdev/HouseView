// Rendering (docs/architecture.md): the carousel is a shell with one page of widget cards, a page nav and a
// feedback line (`widgets:` and `cards:` configs both end up here).
//
// `_renderWidgets` rebuilds the structure (page, config or layout changed); `_updateWidgets` only refreshes
// what a state change touched. Both leave the shell, face and nav elements in place where they can, because
// keyboard focus, loaded camera images and page animations live in them.
import {createRenderContext} from '../core/context.js';
import {esc} from '../core/html.js';
import {t} from '../core/i18n.js';
import {widgetHassChanged} from '../core/hass-signature.js';
import {getWidget} from '../core/registry.js';

/** A page that holds the home summary alone: the whole page takes the overview's colour (no wallpaper around it). */
export const isHomePage = (screen) =>
  screen?.placements?.length === 1 && screen.placements[0].widget?.type === 'home_overview';

const SURFACES_WITH_WALLPAPER = ['teal', 'silver', 'champagne'];

export const renderMixin = {
  /** Dark when asked for, or when "auto" and Home Assistant is in dark mode. */
  _isDark() {
    const appearance = this._config.appearance;
    return appearance === 'dark' || (appearance !== 'light' && this._hass.themes?.darkMode);
  },

  /** Markup of one widget (the tile): the widget module's render with a fresh context. */
  _widget(widget, index) {
    const def = getWidget(widget.type);
    return def.render(createRenderContext(this, widget, index));
  },

  /** Entry point for every full render. Needs both a config and a hass object. */
  _render() {
    if (!this._config || !this._hass) return;
    return this._renderWidgets();
  },

  /** Build or reuse the shell and put the current page's widgets into it. */
  _renderWidgets(preparedPage) {
    this._dropPagePrefetch();
    this._clearPageTransition();
    this._disposeExtensions('render');
    const config = this._config;
    this._tabletChrome();
    const active = this.shadowRoot.activeElement;
    if (active?.dataset.action) {
      this._focus = {action: active.dataset.action, entity: active.dataset.entity};
    }
    const dark = this._isDark();
    const model = this._screenModel();
    const screen = model.screen;
    const surface = SURFACES_WITH_WALLPAPER.includes(config.wallpaper)
      ? config.wallpaper
      : screen.surface || 'glass';
    this._renderedCards = new Map();
    this._widgetSignatures = new Map();
    this._renderedIndices = screen.placements.map((p) => p.index).join(',');
    this._layoutKey = null; // the face is rebuilt below: the next layout pass must write everything
    this._ensureStyles();

    const shell = this._ensureShell();
    const extra = this._extensionShellClasses().join(' ');
    // Pin before the class replacement, and keep `has-header` in the new class. The replacement used to drop the
    // header until the sync below; slow panels lay that gap out and the page jumps up between swipes.
    const headerOn = this._headerHeight() > 0;
    this._reserveHeaderSpace(shell);
    shell.className = `shell adaptive carousel surface-${surface} layout-page ${extra} ${config.bedtime ? 'night-mode' : ''} ${this._dim ? 'screen-dim' : ''} ${dark ? 'dark' : ''} ${config.palette === 'forest' ? 'forest' : ''} ${config.high_contrast ? 'contrast' : ''} ${config.single_widget ? 'single-widget' : ''}${this._perf === 'lite' ? ' perf-lite' : ''}${isHomePage(screen) ? ' surface-home' : ''}${headerOn ? ' has-header' : ''}`;

    this._syncDashboardHeader(shell);
    const face = shell.querySelector('.face');
    if (preparedPage) {
      face.replaceChildren(...preparedPage.element.childNodes);
      face.setAttribute('aria-label', preparedPage.element.getAttribute('aria-label'));
      this._renderedCards = preparedPage.cards;
      // Apply state received while the neighbour was being revealed before activating its hooks.
      for (const element of this._renderedCards.values())
        if (element.localName === 'houseview-widget-card') element.update();
      this._forwardHassToNativeCards(this._hass);
    } else this._fillFace(face, screen);
    this._writeNav();
    shell.querySelector('.feedback').textContent = this._message || '';
    this._syncOverlays(shell, true);
    this._syncDimButton(shell);
    this._syncHomeButton(shell);
    this._layout(model);
    this._schedulePrefetch();
    this._runAfterRender();
    if (this._focus) {
      const target = [...this.shadowRoot.querySelectorAll('button[data-action]')].find(
        (button) =>
          button.dataset.action === this._focus.action &&
          button.dataset.entity === this._focus.entity
      );
      target?.focus({preventScroll: true});
      this._focus = null;
    }
    this._syncEditorPreview();
    this._screensaverSync();
    // Seed per-tile signatures so the next hass update only repaints tiles whose entities changed.
    this._seedWidgetSignatures();
  },

  /** Remember each visible tile's watched state refs after a structural rebuild. */
  _seedWidgetSignatures() {
    const widgets = this._config?.widgets || [];
    this._widgetSignatures = new Map();
    if (!this._hass) return;
    for (const index of this._renderedCards?.keys() || []) {
      widgetHassChanged(this, index, widgets[index], this._hass);
    }
  },

  /** The carousel shell; created on first use (a stale shell, if any, is removed first). */
  _ensureShell() {
    let shell = this.shadowRoot.querySelector('ha-card.shell.adaptive');
    if (shell) return shell;
    this.shadowRoot.querySelector('.shell')?.remove();
    shell = document.createElement('ha-card');
    shell.innerHTML = `<div class="face"></div><nav class="page-nav" aria-label="${esc(t(this._hass, 'nav.label'))}"></nav><div class="feedback" role="status" aria-live="polite"></div>`;
    this.shadowRoot.append(shell);
    return shell;
  },

  /** Replace the face's children with the page's widget cards (or the empty-page hint). */
  _fillFace(face, screen, cards = this._renderedCards) {
    face.setAttribute('aria-label', t(this._hass, 'page.label', {label: screen.label}));
    face.style.setProperty('--page-direction', this._direction || 0);
    face.replaceChildren();
    if (!screen.placements.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-cards';
      empty.textContent = t(this._hass, 'empty.cards');
      face.append(empty);
    }
    for (const placement of screen.placements) {
      let element;
      if (placement.widget.type === 'native_card') {
        element = this._nativeCardElement(placement);
      } else {
        element = document.createElement('houseview-widget-card');
        element.bind(this, placement.widget, placement.index);
      }
      face.append(element);
      cards.set(placement.index, element);
    }
  },

  /** A state change: refresh the tiles, the dark class, the feedback line and the overlays in place. */
  _updateWidgets() {
    // Hidden under an opaque screensaver: remember that a repaint is owed (`_resumeAfterCover` pays it).
    if (this._screensaverCovered?.()) {
      this._underlayStale = true;
      return;
    }
    const face = this.shadowRoot.querySelector('.face');
    const shell = face?.parentElement;
    if (!face) return this._render();
    const widgets = this._config?.widgets || [];
    const allTiles = this._scalarsDirty;
    this._scalarsDirty = false;
    for (const [index, element] of this._renderedCards?.entries() || []) {
      if (element.localName !== 'houseview-widget-card') continue;
      if (!allTiles && !widgetHassChanged(this, index, widgets[index], this._hass)) continue;
      if (allTiles) widgetHassChanged(this, index, widgets[index], this._hass);
      element.update();
    }
    this._syncDashboardHeader(shell);
    shell.classList.toggle('dark', !!this._isDark());
    shell.querySelector('.feedback').textContent = this._message || '';
    this._syncOverlays(shell, false);
    this._runAfterRender();
  }
};
