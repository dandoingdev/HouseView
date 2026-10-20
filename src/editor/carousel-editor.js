// houseview-editor: the visual editor of `custom:houseview-card` (the carousel). It edits the global look, the
// camera grid, the screensaver and the pages; each page's cards are edited by Home Assistant's own
// `hui-stack-card-editor`, which in turn creates houseview-widget-editor for HouseView cards.
//
// The editor keeps a normalised copy of the config (`cards:` format, at least one page) and emits it whole in
// `config-changed`. Forms are updated in place when Home Assistant echoes a changed config back, so typing in a
// field or in a nested card editor never loses focus to a full rebuild.
import {clearEditorPreview, selectEditorPreview} from '../core/editor-preview.js';
import {fromCard, onPage, toCards} from '../config/convert.js';
import {fireEvent} from '../core/events.js';
import {AUTOMATIC_DISPLAYS, overviewList} from '../core/overview-registry.js';
import {PERFORMANCE_MODES} from '../core/performance.js';
import {PAGE_SURFACES, WALLPAPER_SURFACES} from '../core/surfaces.js';
import {
  applyAutomatic,
  automaticData,
  automaticSchema,
  showAutomatic
} from './automatic-displays-form.js';
import {applyDoorbell, doorbellData, doorbellSchema, showDoorbell} from './doorbell-form.js';
import {applyHome, homeData, homeSchema, showHome} from './home-form.js';
import {CAMERA_SLOTS, applySlot, slotData, slotHeadingKey, slotSchema} from './camera-forms.js';
import {STYLES, createForm, field, select, text, textOrNone} from './form.js';
import {createStackEditor, hasForm, hasStackEditor, whenNativeReady} from './native-stack.js';
import {
  applyScreensaver,
  extraEntries,
  screensaverData,
  screensaverLabels,
  screensaverSchema
} from './screensaver-form.js';

/** Keys of the pre-widgets (single climate) config, dropped once its widgets have been converted to cards. */
const TOP_LEVEL_KEYS = ['climate', 'clock', 'camera', 'scene', 'lock', 'secondary_light', 'light'];

const APPEARANCE_DEFAULTS = {
  appearance: 'auto',
  wallpaper: 'page',
  palette: 'stone',
  performance: 'auto',
  editor_preview: 'landscape',
  show_header: false,
  tablet_mode: false
};
const SURFACES = PAGE_SURFACES;

const newPage = (name, surface = 'glass') => ({name, surface});

/**
 * The config the editor works on: cards instead of widgets, no top-level keys of the removed single-climate shape, and a page for the
 * first card and for every page name a card refers to.
 */
export function editorConfig(config) {
  const next = structuredClone(config);
  next.cards = toCards(next);
  delete next.widgets;
  for (const key of TOP_LEVEL_KEYS) delete next[key];
  next.pages = next.pages?.length ? next.pages : [newPage('Home')];
  for (const card of next.cards) {
    const page = fromCard(card).page;
    if (page && !next.pages.some((p) => p.name === page)) next.pages.push(newPage(page));
  }
  return next;
}

/** Cards of `page`; cards that name no page belong to the first one. */
export const cardsOfPage = (config, page) =>
  config.cards.filter((card) => (fromCard(card).page || config.pages[0].name) === page.name);

/**
 * Drop one page and the cards that belong to it. The last page stays, so the card always has a page to edit.
 * Returns the same config when `index` cannot be removed.
 */
export function withoutPage(config, index) {
  const pages = config.pages;
  if (!pages || pages.length < 2 || index < 0 || index >= pages.length) return config;
  const removed = pages[index].name;
  const first = pages[0].name;
  return {
    ...config,
    pages: pages.filter((_, i) => i !== index),
    cards: config.cards.filter((card) => (fromCard(card).page || first) !== removed)
  };
}

export const appearanceData = (config) =>
  Object.fromEntries(
    [
      'appearance',
      'wallpaper',
      'palette',
      'bedtime',
      'high_contrast',
      'performance',
      'editor_preview',
      'show_header',
      'tablet_mode'
    ].map((key) => [key, config[key] ?? APPEARANCE_DEFAULTS[key]])
  );

export const appearanceSchema = (hass) => [
  field('show_header', {boolean: {}}),
  field('tablet_mode', {boolean: {}}),
  field('appearance', select(hass, ['auto', 'light', 'dark'])),
  field('wallpaper', select(hass, ['page', ...WALLPAPER_SURFACES])),
  field('palette', select(hass, ['stone', 'forest'])),
  field('bedtime', {boolean: {}}),
  field('high_contrast', {boolean: {}}),
  field('performance', select(hass, PERFORMANCE_MODES)),
  field('editor_preview', select(hass, ['landscape', 'portrait', 'auto']))
];

/** Helper text under a field of the appearance form: only the fields that have one (`editor.helper.<name>`). */
export const appearanceHelper = (hass) => (item) => textOrNone(hass, `editor.helper.${item.name}`);

export const pageData = (page) => ({
  surface: page.surface || 'glass',
  columns: page.columns,
  icon: page.icon
});

export const pageSchema = (hass) => [
  field('surface', select(hass, SURFACES)),
  field('columns', {number: {min: 2, max: 5, step: 1, mode: 'box'}}),
  field('icon', {icon: {}})
];

/** The screensaver section appears when an overview is registered, or when the config already has the key. */
const showScreensaver = (config) => overviewList().length > 0 || config.screensaver !== undefined;

/** Changes in this key need a rebuild; anything else is updated in place. */
const structureKey = (config) =>
  JSON.stringify([
    config.pages.map((page) => page.name),
    showScreensaver(config),
    showAutomatic(config),
    showHome(config),
    showDoorbell(config)
  ]);

const panel = (parent, header) => {
  const el = document.createElement('ha-expansion-panel');
  el.header = header;
  const section = document.createElement('section');
  el.append(section);
  parent.append(el);
  return {el, section};
};

export class HouseViewEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    // Cards in the page stacks ask whether they sit inside this editor (see houseview-widget-editor).
    this.addEventListener('houseview-editor-context', (event) => {
      event.detail.embedded = true;
    });
  }

  set hass(hass) {
    this._hass = hass;
    for (const el of this.shadowRoot.querySelectorAll('ha-form,hui-stack-card-editor'))
      el.hass = hass;
    if (this._config && !this.shadowRoot.querySelector('.editor')) this._render();
  }

  set lovelace(value) {
    this._lovelace = value;
    for (const el of this.shadowRoot.querySelectorAll('hui-stack-card-editor')) el.lovelace = value;
  }

  setConfig(config) {
    const next = editorConfig(config);
    if (JSON.stringify(next) === JSON.stringify(this._config)) return;
    this._config = next;
    if (this._view?.key === structureKey(next)) this._sync();
    else this._render();
  }

  _emit() {
    fireEvent(this, 'config-changed', {config: structuredClone(this._config)});
    this._refreshPreview();
  }

  _status(message) {
    this.shadowRoot.querySelector('.status').textContent = message;
  }

  _label = (item) => text(this._hass, `editor.${item.name}`, item.name);

  _form(parent, options) {
    return createForm(parent, {hass: this._hass, computeLabel: this._label, ...options});
  }

  // ---- rendering ----

  _render() {
    if (!this._config) return;
    clearEditorPreview(this);
    this._previewTarget = undefined;
    this._followed = [];
    this._view = null;
    this.shadowRoot.innerHTML =
      STYLES + '<div class="editor"><ha-alert class="status" alert-type="error"></ha-alert></div>';
    const parent = this.shadowRoot.querySelector('.editor');
    if (!hasForm()) return this._renderDegraded(parent);
    const view = {key: structureKey(this._config), cameras: [], pages: []};
    this._view = view;
    view.appearance = this._renderAppearance(parent);
    if (showHome(this._config)) this._renderHome(parent, view);
    this._renderCameras(parent, view);
    if (showScreensaver(this._config)) this._renderScreensaver(parent, view);
    if (showAutomatic(this._config)) this._renderAutomatic(parent, view);
    if (showDoorbell(this._config)) this._renderDoorbell(parent, view);
    this._config.pages.forEach((_, index) => this._renderPage(parent, view, index));
    this._renderAddPage(parent);
    if (!hasStackEditor()) this._upgradeWhenReady();
  }

  // No ha-form: nothing to edit with. Say so, and rebuild once Home Assistant has loaded its editors.
  _renderDegraded(parent) {
    const message = document.createElement('p');
    message.textContent = text(this._hass, 'editor.degraded');
    parent.append(message);
    this._upgradeWhenReady();
  }

  _upgradeWhenReady() {
    if (this._upgrading) return;
    this._upgrading = true;
    whenNativeReady().then((ready) => {
      this._upgrading = false;
      if (ready && this.isConnected && this._config) this._render();
    });
  }

  _renderAppearance(parent) {
    const form = this._form(parent, {
      data: appearanceData(this._config),
      schema: appearanceSchema(this._hass),
      computeHelper: appearanceHelper(this._hass),
      changed: (value) => {
        this._config = {...this._config, ...value};
        this._emit();
      }
    });
    const select = () => {
      this._previewPanel = null;
      this._previewTarget = () => ({
        kind: 'page',
        name: this._lastPreviewPage || this._config.pages[0].name
      });
      this._refreshPreview();
    };
    form.addEventListener('focusin', select);
    form.addEventListener('pointerdown', select);
    return form;
  }

  _renderCameras(parent, view) {
    const outer = panel(parent, text(this._hass, 'editor.camera_grid'));
    this._followPreview(outer.el, () => ({kind: 'cameras'}));
    for (let slot = 0; slot < CAMERA_SLOTS; slot++) {
      const {section} = panel(outer.section, text(this._hass, slotHeadingKey(slot)));
      view.cameras.push(
        this._form(section, {
          data: slotData(this._config.camera_gallery, slot),
          schema: slotSchema(),
          changed: (value) => this._cameraChanged(slot, value)
        })
      );
    }
  }

  _cameraChanged(slot, value) {
    const {gallery, error} = applySlot(this._config.camera_gallery, slot, value);
    if (error) return this._status(text(this._hass, `editor.${error}`));
    if (gallery) this._config.camera_gallery = gallery;
    else delete this._config.camera_gallery;
    this._status('');
    this._emit();
  }

  _renderScreensaver(parent, view) {
    const {el, section} = panel(parent, text(this._hass, 'screensaver.section'));
    this._followPreview(el, () => ({
      kind: 'overview',
      type: screensaverData(this._config).type,
      options: screensaverData(this._config)
    }));
    const note = document.createElement('p');
    const data = screensaverData(this._config);
    const form = createForm(section, {
      hass: this._hass,
      data,
      schema: screensaverSchema(this._hass, data),
      // The labels depend on the chosen overview, so they are looked up when ha-form renders.
      computeLabel: (item) =>
        screensaverLabels(this._hass, screensaverData(this._config).type).computeLabel(item),
      computeHelper: (item) =>
        screensaverLabels(this._hass, screensaverData(this._config).type).computeHelper(item),
      changed: (value) => this._screensaverChanged(value)
    });
    section.append(note);
    view.screensaver = {form, note};
    this._showScreensaverNote();
  }

  _renderAutomatic(parent, view) {
    const {el, section} = panel(parent, text(this._hass, 'editor.automatic_displays'));
    const automaticTarget = (key) => {
      const display = AUTOMATIC_DISPLAYS.find((d) => d.key === key) || AUTOMATIC_DISPLAYS[0];
      const saved = this._config[display.key];
      const entity = Array.isArray(saved)
        ? saved[0]
        : this._config.cards.map(fromCard).find((w) => w.type === display.widget)?.entity;
      return {kind: 'overview', type: display.overview, options: {entity}};
    };
    for (const type of ['focusin', 'pointerdown'])
      el.addEventListener(type, (event) => {
        const field = event
          .composedPath()
          .find((node) => AUTOMATIC_DISPLAYS.some((d) => d.key === node.schema?.name));
        if (field) this._automaticPreviewKey = field.schema.name;
      });
    this._followPreview(el, () => automaticTarget(this._automaticPreviewKey));
    view.automatic = this._form(section, {
      data: automaticData(this._config),
      schema: automaticSchema(),
      computeHelper: (item) => textOrNone(this._hass, `editor.helper.${item.name}`),
      changed: (value) => {
        this._automaticPreviewKey =
          Object.keys(value).find((key) => value[key] !== automaticData(this._config)[key]) ||
          this._automaticPreviewKey;
        this._config = applyAutomatic(this._config, value);
        this._emit();
      }
    });
  }

  _renderDoorbell(parent, view) {
    const {el, section} = panel(parent, text(this._hass, 'editor.doorbell_section'));
    this._followPreview(el, () => ({
      kind: 'overview',
      type: 'doorbell',
      options: {entity: this._config.doorbell?.entity, camera: this._config.doorbell?.camera}
    }));
    view.doorbell = this._form(section, {
      data: doorbellData(this._config),
      schema: doorbellSchema(),
      computeHelper: (item) => textOrNone(this._hass, `editor.helper.${item.name}`),
      changed: (value) => {
        this._config = applyDoorbell(this._config, value);
        this._emit();
      }
    });
  }

  _renderHome(parent, view) {
    const {el, section} = panel(parent, text(this._hass, 'editor.home_section'));
    this._followPreview(el, () => ({
      kind: 'overview',
      type: 'home',
      options: this._config.home_title ? {title: this._config.home_title} : {}
    }));
    view.home = this._form(section, {
      data: homeData(this._config),
      schema: homeSchema(),
      computeHelper: (item) => textOrNone(this._hass, `editor.helper.${item.name}`),
      changed: (value) => {
        this._config = applyHome(this._config, value);
        this._emit();
      }
    });
  }

  // Expansion, pointer input and keyboard focus all select the section, including nested HA editors.
  _followPreview(el, target) {
    const entry = {el, target};
    (this._followed ||= []).push(entry);
    const select = () => {
      this._previewPanel = el;
      this._previewTarget = target;
      // Most recently used last: it takes over again when a later section is closed.
      this._followed = this._followed.filter((other) => other !== entry).concat(entry);
      this._refreshPreview();
    };
    el.addEventListener('expanded-changed', (event) => {
      if (event.target !== el) return;
      if (el.expanded) select();
      else if (this._previewPanel === el) {
        // Closing the section being previewed hands the preview to the newest section still open.
        const next = this._followed.findLast((other) => other.el.expanded);
        if (next) {
          this._previewPanel = next.el;
          this._previewTarget = next.target;
          this._refreshPreview();
        } else {
          this._previewTarget = undefined;
          clearEditorPreview(this);
        }
      }
    });
    el.addEventListener('houseview-editor-context', () => {
      if (el.expanded) select();
    });
    el.addEventListener('focusin', () => {
      if (el.expanded) select();
    });
    el.addEventListener('pointerdown', () => {
      if (el.expanded) select();
    });
  }

  _refreshPreview() {
    if (!this._previewTarget) return;
    const target = this._previewTarget();
    if (target.kind === 'page') this._lastPreviewPage = target.name;
    selectEditorPreview(this, target);
  }

  disconnectedCallback() {
    clearEditorPreview(this);
  }

  _showScreensaverNote() {
    const extra = extraEntries(this._config);
    const {note} = this._view.screensaver;
    note.textContent =
      extra > 0 ? text(this._hass, 'screensaver.list_note', undefined, {n: extra + 1}) : '';
    note.hidden = extra <= 0;
  }

  _screensaverChanged(value) {
    this._config = applyScreensaver(this._config, value);
    const {form} = this._view.screensaver;
    const data = screensaverData(this._config);
    const schema = screensaverSchema(this._hass, data);
    // A new overview type brings other fields; keep the user's typing alone otherwise.
    if (schema.map((item) => item.name).join() !== form.schema.map((item) => item.name).join()) {
      form.schema = schema;
      form.data = data;
    }
    this._showScreensaverNote();
    this._emit();
  }

  _stackConfig(index) {
    const page = this._config.pages[index];
    return {type: 'vertical-stack', title: page.name, cards: cardsOfPage(this._config, page)};
  }

  _renderPage(parent, view, index) {
    const page = this._config.pages[index];
    const {el, section} = panel(parent, page.name);
    let focusedEditor;
    const selectWidget = (event) => {
      const editor = event
        .composedPath()
        .find((node) => node.localName === 'houseview-widget-editor');
      if (editor) focusedEditor = editor;
    };
    for (const type of ['focusin', 'pointerdown', 'houseview-editor-context'])
      el.addEventListener(type, selectWidget);
    this._followPreview(el, () => {
      const editing =
        focusedEditor?.isConnected && focusedEditor._config
          ? fromCard(focusedEditor._config)
          : undefined;
      const widgetIndex = editing
        ? this._config.cards.findIndex((card) => {
            const widget = fromCard(card);
            return (
              (widget.page || this._config.pages[0].name) === this._config.pages[index].name &&
              widget.type === editing.type &&
              widget.entity === editing.entity &&
              widget.name === editing.name
            );
          })
        : -1;
      return {
        kind: 'page',
        name: this._config.pages[index].name,
        widget: widgetIndex >= 0 ? widgetIndex : undefined
      };
    });
    const form = this._form(section, {
      data: pageData(page),
      schema: pageSchema(this._hass),
      computeHelper: (item) => textOrNone(this._hass, `editor.helper.${item.name}`),
      changed: (value) => this._pageChanged(index, value)
    });
    if (this._config.pages.length > 1) {
      const remove = document.createElement('ha-button');
      remove.textContent = text(this._hass, 'editor.remove_page');
      remove.addEventListener('click', () => this._removePage(index));
      section.append(remove);
    }
    const pageView = {panel: el, form};
    view.pages.push(pageView);
    if (!hasStackEditor()) {
      const note = document.createElement('p');
      note.textContent = text(this._hass, 'editor.degraded_cards');
      section.append(note);
      return;
    }
    const config = this._stackConfig(index);
    const stack = createStackEditor({
      hass: this._hass,
      lovelace: this._lovelace,
      title: config.title,
      cards: config.cards
    });
    pageView.stack = stack;
    pageView.stackKey = JSON.stringify(config);
    stack.addEventListener('config-changed', (event) => {
      event.stopPropagation();
      this._stackChanged(index, event.detail.config);
    });
    section.append(stack);
  }

  _pageChanged(index, value) {
    const page = this._config.pages[index];
    page.surface = value.surface || 'glass';
    delete page.layout;
    if (value.columns) page.columns = value.columns;
    else delete page.columns;
    if (value.icon) page.icon = value.icon;
    else delete page.icon;
    this._emit();
  }

  /** Remove one page and the cards on it, then rebuild. The last page has no remove button. */
  _removePage(index) {
    const next = withoutPage(this._config, index);
    if (next === this._config) return;
    this._config = next;
    this._emit();
    this._render();
  }

  // The stack editor reports the page's whole card list and, when the title field was edited, a page name.
  _stackChanged(index, stackConfig) {
    const cards = stackConfig.cards;
    if (!Array.isArray(cards)) return;
    const {pages} = this._config;
    const page = pages[index];
    const first = pages[0].name;
    const old = page.name;
    const pageView = this._view.pages[index];
    // Cards apply at once under the current name; a rename waits until typing pauses so the preview does not
    // jump to a half-typed page name on every keystroke.
    const others = this._config.cards.filter((card) => (fromCard(card).page || first) !== old);
    this._config.cards = others.concat(cards.map((card) => onPage(card, old)));
    clearTimeout(pageView.renameTimer);
    const title = stackConfig.title ?? old;
    if (title.trim() === old) {
      this._status('');
    } else {
      pageView.renameTimer = setTimeout(() => this._renamePage(index, title), 800);
      if (!pageView.renameBound) {
        pageView.renameBound = true;
        pageView.stack.addEventListener('focusout', () => this._flushRename(index));
      }
      pageView.pendingTitle = title;
    }
    pageView.stackKey = JSON.stringify({...this._stackConfig(index), title});
    this._emit();
  }

  _flushRename(index) {
    const pageView = this._view?.pages[index];
    if (!pageView?.renameTimer) return;
    clearTimeout(pageView.renameTimer);
    this._renamePage(index, pageView.pendingTitle);
  }

  _renamePage(index, title) {
    const pageView = this._view.pages[index];
    pageView.renameTimer = undefined;
    const {pages} = this._config;
    const page = pages[index];
    const first = pages[0].name;
    const old = page.name;
    const name = title.trim();
    if (!name || pages.some((other, i) => i !== index && other.name === name)) {
      return this._status(text(this._hass, 'editor.page_name_invalid'));
    }
    if (name === old) return;
    this._config.cards = this._config.cards.map((card) =>
      (fromCard(card).page || first) === old ? onPage(card, name) : card
    );
    page.name = name;
    pageView.panel.header = name;
    pageView.stackKey = JSON.stringify(this._stackConfig(index));
    this._view.key = structureKey(this._config);
    this._status('');
    this._emit();
  }

  _renderAddPage(parent) {
    const add = document.createElement('ha-button');
    add.textContent = text(this._hass, 'editor.add_page');
    add.addEventListener('click', () => {
      let n = 2;
      while (this._config.pages.some((page) => page.name === `Page ${n}`)) n++;
      this._config.pages.push(newPage(`Page ${n}`, 'teal'));
      this._emit();
      this._render();
      const added = this._view.pages.at(-1).panel;
      added.expanded = true;
      added.dispatchEvent(new CustomEvent('expanded-changed'));
    });
    parent.append(add);
  }

  // ---- updating in place ----

  // Home Assistant pushed a different config with the same pages: refresh values, keep every element.
  _sync() {
    const view = this._view;
    const config = this._config;
    view.appearance.data = appearanceData(config);
    view.cameras.forEach((form, slot) => {
      form.data = slotData(config.camera_gallery, slot);
    });
    if (view.automatic) view.automatic.data = automaticData(config);
    if (view.home) view.home.data = homeData(config);
    if (view.doorbell) view.doorbell.data = doorbellData(config);
    if (view.screensaver) {
      const data = screensaverData(config);
      view.screensaver.form.schema = screensaverSchema(this._hass, data);
      view.screensaver.form.data = data;
      this._showScreensaverNote();
    }
    config.pages.forEach((page, index) => {
      const pageView = view.pages[index];
      pageView.form.data = pageData(page);
      if (!pageView.stack) return;
      const stackConfig = this._stackConfig(index);
      // A rename still waiting for typing to pause: keep what the user typed.
      if (pageView.renameTimer) stackConfig.title = pageView.pendingTitle;
      const key = JSON.stringify(stackConfig);
      if (key === pageView.stackKey) return;
      pageView.stackKey = key;
      pageView.stack.setConfig(stackConfig);
    });
  }
}
