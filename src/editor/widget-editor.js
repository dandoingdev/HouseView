// houseview-widget-editor: the visual editor of `custom:houseview-widget-card` and the per-kind standalone cards,
// and the per-card editor shown inside the carousel editor's page stacks. The form is compiled from the widget
// definition (fields.js); this class only owns the element lifecycle and the config round trip.
import {fireEvent} from '../core/events.js';
import {getWidget, widgetList} from '../core/registry.js';
import {
  compileWidgetSchema,
  definitionFor,
  widgetFormData,
  widgetHelper,
  widgetLabeller
} from './fields.js';
import {STYLES, createForm, sameFields, text} from './form.js';
import {hasForm, whenNativeReady} from './native-stack.js';

const WIDGET_CARD = 'custom:houseview-widget-card';

/**
 * Widget kind of a card config type: `custom:houseview-<kind>-card` for a registered kind (its `tag` when it has
 * one, e.g. overview cards), else the default pattern. The generic widget card names no kind.
 */
export function kindFromType(type = '') {
  const tag = type.replace(/^custom:/, '');
  const registered = widgetList().find((def) => (def.tag || `houseview-${def.type}-card`) === tag);
  if (registered) return registered.type;
  const alias = /^custom:houseview-(.+)-card$/.exec(type)?.[1];
  return alias && alias !== 'widget' ? alias : null;
}

export class HouseViewWidgetEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._embedded = false;
  }

  // The carousel editor answers this event with `embedded: true`: inside a page stack the card has a size and no
  // standalone appearance fields.
  connectedCallback() {
    const detail = {embedded: false};
    this.dispatchEvent(
      new CustomEvent('houseview-editor-context', {detail, bubbles: true, composed: true})
    );
    if (detail.embedded !== this._embedded) {
      this._embedded = detail.embedded;
      this._render();
    }
  }

  set hass(value) {
    this._hass = value;
    // Only the forms need the new hass; the DOM is not rebuilt.
    if (this._form) this._form.hass = value;
    else if (this._config && hasForm()) this._render();
  }

  setConfig(config) {
    const next = structuredClone(config);
    next.widget_type = next.widget_type || kindFromType(next.type) || 'clock';
    if (JSON.stringify(next) === JSON.stringify(this._config)) return;
    this._config = next;
    if (this._form && this._formEmbedded === this._embedded) this._refresh();
    else this._render();
  }

  get _definition() {
    const kind = this._config.widget_type;
    return definitionFor(kind, getWidget(kind));
  }

  _formView() {
    const data = widgetFormData(this._definition, this._config);
    return {
      data,
      schema: compileWidgetSchema(this._hass, this._definition, {embedded: !!this._embedded, data})
    };
  }

  _render() {
    if (!this._config) return;
    this.shadowRoot.innerHTML = STYLES;
    this._form = null;
    if (!hasForm()) return this._renderDegraded();
    const {data, schema} = this._formView();
    this._formEmbedded = this._embedded;
    this._form = createForm(this.shadowRoot, {
      hass: this._hass,
      data,
      schema,
      computeLabel: (item) => widgetLabeller(this._hass, this._definition)(item),
      computeHelper: (item) => widgetHelper(this._hass, this._definition)(item),
      changed: (value) => this._changed(value)
    });
  }

  // ha-form is not defined (yet): say so, and upgrade as soon as Home Assistant has loaded it.
  _renderDegraded() {
    const notice = document.createElement('p');
    notice.textContent = text(this._hass, 'editor.degraded');
    this.shadowRoot.append(notice);
    whenNativeReady().then((ready) => {
      if (ready && this.isConnected && !this._form) this._render();
    });
  }

  /** Push the current config into the existing form: new data, and a new schema only when the fields changed. */
  _refresh() {
    const {data, schema} = this._formView();
    if (!sameFields(this._form.schema, schema)) this._form.schema = schema;
    this._form.data = data;
  }

  _changed(value) {
    const changedKind = value.widget_type !== this._config.widget_type;
    this._config = {...this._config, ...value};
    if (changedKind) {
      // The old kind's entity and tap action mean nothing to the new kind.
      delete this._config.entity;
      delete this._config.action;
      if (this._config.type !== WIDGET_CARD) this._config.type = WIDGET_CARD;
      this._definition.editor?.onKindChange?.(this._config);
    }
    fireEvent(this, 'config-changed', {config: structuredClone(this._config)});
    if (changedKind) {
      // New kind: new fields, labels and data, but the same <ha-form>.
      const {data, schema} = this._formView();
      this._form.schema = schema;
      this._form.data = data;
    } else {
      // Options with `when(widget)` appear and disappear as their inputs change.
      const {schema} = this._formView();
      if (!sameFields(this._form.schema, schema)) this._form.schema = schema;
    }
  }
}
