// A stand-in for the HouseViewCard controller, for Node suites that call core/context.js and core/dispatch.js.
//
// ALL knowledge of what the engine expects from `card` lives in this one file. The names mirror the
// controller members that docs/architecture.md says are kept: _hass _config _pending _message _state
// _available _info _refreshActionState _widget. `hass` and `config` aliases are provided too, in case the
// engine's context reads the public spelling. If core/context.js needs more, extend it here, not in each suite.

import {createMockHass} from './mock-hass.js';

/**
 * @param {{states?: Object, config?: Object, hass?: Object, pending?: Iterable<string>, mock?: Object}} opts
 *   `hass` carries MockOptions (locale, config, themes, connection...). `mock` reuses an existing createMockHass.
 */
export function createHost({
  states = {},
  config = {},
  hass: hassOptions = {},
  pending = [],
  mock
} = {}) {
  const m = mock || createMockHass({...hassOptions, states});
  /** @type {string[]} */
  const infos = [];
  const host = {
    mock: m,
    infos,
    refreshes: 0,
    _hass: m.hass,
    _config: config,
    _pending: new Set(pending),
    _message: '',
    get hass() {
      return this._hass;
    },
    get config() {
      return this._config;
    },
    get calls() {
      return m.calls;
    },
    _state(id) {
      return this._hass?.states[id];
    },
    _available(id) {
      const s = this._state(id);
      return (
        !!s &&
        s.state !== 'unavailable' &&
        (['scene', 'button', 'input_button'].includes(id.split('.')[0]) || s.state !== 'unknown')
      );
    },
    _info(id) {
      infos.push(id);
    },
    _refreshActionState() {
      this.refreshes++;
    },
    dispatchEvent(event) {
      if (event?.type === 'hass-more-info') infos.push(event.detail?.entityId);
      return true;
    },
    /** Replace the widgets list the way setConfig would after normalisation. */
    setWidgets(widgets, extra = {}) {
      this._config = {...extra, widgets};
      return this;
    }
  };
  return host;
}

/** Host for a fixture variant. `variant.config` is merged into the card config. */
export function hostForVariant(variant, widget, {pending = [], hass: hassOptions = {}} = {}) {
  const config = {...(variant.config || {}), widgets: [widget]};
  return createHost({
    states: variant.states,
    config,
    pending,
    hass: {...(variant.hass || {}), ...hassOptions}
  });
}

const ALIASES = ['scene', 'script', 'button', 'input_button'];

/**
 * The new-side view of a widget config: alias folding to the canonical type, then def.normalize, like setConfig
 * does after validation.
 */
export function normalizeForNew(def, widget, config = {}) {
  let out = {...widget};
  if (
    !out.type ||
    out.type === def.type ||
    ALIASES.includes(out.type) ||
    def.aliases?.includes(out.type)
  )
    out.type = def.type;
  if (def.normalize) out = def.normalize(out, config) ?? out;
  return out;
}
