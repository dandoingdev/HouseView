// Recording mock of the Home Assistant `hass` object, shared by every HouseView test harness.
//
// Plain ES module with no Node or DOM imports, so the same file runs under `node --test`, in the widget
// harness (tests/widgets), in the preview playground and in the browser pages.
//
// Nothing here reaches a network or a real Home Assistant: `callService` only records the call and
// settles according to the current mode (resolve, reject or defer).
//
//   const mock = createMockHass({states: {'light.a': {state: 'on'}}});
//   card.hass = mock.hass;
//   mock.calls                 // [{d, s, data, target?}] in call order (same shape as tests/index.html)
//   mock.mode = 'reject'       // or mock.rejectWith('Permission denied'); 'defer' parks calls until flush
//   mock.setState('light.a', {state: 'off', attributes: {brightness: 3}})   // mutates IN PLACE (like the browser suite)

const DEFAULT_LOCALE = {language: 'en-GB'};
const DEFAULT_CONFIG = {unit_system: {temperature: '°C'}};

/** @param {any} v */
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/**
 * Normalise a states map: every entry gets `attributes` and the object identity is kept per entity so tests
 * can mutate it in place.
 * @param {Record<string, {state: string, attributes?: Object}>} input
 */
export function normaliseStates(input = {}) {
  const states = {};
  for (const [id, value] of Object.entries(input)) {
    states[id] = {
      ...value,
      state: value.state,
      attributes: value.attributes ? {...value.attributes} : {}
    };
  }
  return states;
}

/**
 * @typedef {Object} MockOptions
 * @property {Record<string, {state: string, attributes?: Object}>} [states]
 * @property {Object|null} [locale]   hass.locale; null removes it (the browser locale is used then)
 * @property {Object|null} [config]   hass.config; null removes it (exercises the optional-chaining paths)
 * @property {Object} [themes]        hass.themes, e.g. {darkMode: true}
 * @property {boolean} [connection]   add hass.connection (mock subscribeMessage/subscribeEvents). Off by default:
 *                                    the architecture picks the JSON signature path when it is absent, like tests/browser.html.
 * @property {string} [origin]        when set, adds hass.hassUrl(path) resolving against this origin
 * @property {boolean} [formatEntityState]   add a hass.formatEntityState double ("<state> (localized)")
 * @property {'resolve'|'reject'|'defer'} [mode]
 */

/**
 * @param {MockOptions} [opts]
 */
export function createMockHass(opts = {}) {
  /** @type {{d: string, s: string, data: any, target?: any}[]} */
  const calls = [];
  /** @type {{resolve: Function, reject: Function, call: Object}[]} */
  const deferred = [];
  const subscriptions = [];
  const events = [];

  const mock = {
    calls,
    deferred,
    subscriptions,
    /** entity ids passed to hass-more-info listeners are collected by harnesses, not here */
    mode: opts.mode || 'resolve',
    error: new Error('Permission denied'),
    hass: /** @type {any} */ (null),

    /** Make every following call reject with this message (until resolveAll/mode changes). */
    rejectWith(message = 'Permission denied') {
      mock.mode = 'reject';
      mock.error = message instanceof Error ? message : new Error(message);
      return mock;
    },
    /** Back to resolving immediately. */
    resolveAll() {
      mock.mode = 'resolve';
      return mock;
    },
    /** Park calls: the returned promise stays pending until flush or fail. */
    deferAll() {
      mock.mode = 'defer';
      return mock;
    },
    /** Resolve every parked call and wait for the microtasks it unblocks. */
    async flush() {
      const parked = deferred.splice(0);
      for (const entry of parked) entry.resolve();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      return parked.length;
    },
    /** Reject every parked call. */
    async fail(message = 'Permission denied') {
      const parked = deferred.splice(0);
      const err = message instanceof Error ? message : new Error(message);
      for (const entry of parked) entry.reject(err);
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      return parked.length;
    },

    /** Merge into an entity IN PLACE (state objects keep identity). Creates it when missing. */
    setState(id, patch = {}) {
      const states = mock.hass.states;
      const current = states[id] || (states[id] = {state: 'unknown', attributes: {}});
      if ('state' in patch) current.state = patch.state;
      if (patch.attributes) current.attributes = {...current.attributes, ...patch.attributes};
      return current;
    },
    /** Replace the entity object (new identity, for reference-compare paths). */
    replaceState(id, value) {
      mock.hass.states[id] = {...value, attributes: {...(value.attributes || {})}};
      return mock.hass.states[id];
    },
    removeState(id) {
      delete mock.hass.states[id];
    },

    /** Deliver a message to every live subscribeMessage/subscribeEvents callback (optionally one event type). */
    emit(message, eventType) {
      for (const sub of subscriptions) {
        if (sub.closed) continue;
        if (eventType && sub.eventType && sub.eventType !== eventType) continue;
        sub.callback(message);
      }
    },
    /** Subscriptions still open. */
    get openSubscriptions() {
      return subscriptions.filter((s) => !s.closed);
    },

    reset() {
      calls.length = 0;
      deferred.length = 0;
      events.length = 0;
      mock.mode = opts.mode || 'resolve';
    },
    /** Deep copy of the recorded calls, for snapshot style assertions. */
    snapshotCalls() {
      return clone(calls);
    }
  };

  const hass = {
    states: normaliseStates(opts.states),
    callService(domain, service, data, target) {
      const call = {d: domain, s: service, data};
      if (target !== undefined) call.target = target;
      calls.push(call);
      if (mock.mode === 'reject') return Promise.reject(mock.error);
      if (mock.mode === 'defer') {
        return new Promise((resolve, reject) => deferred.push({resolve, reject, call}));
      }
      return Promise.resolve();
    }
  };

  if (opts.config !== null) hass.config = clone(opts.config || DEFAULT_CONFIG);
  if (opts.locale !== null) hass.locale = clone(opts.locale || DEFAULT_LOCALE);
  if (opts.themes) hass.themes = clone(opts.themes);
  if (opts.origin) hass.hassUrl = (path = '') => new URL(path, opts.origin).href;
  if (opts.formatEntityState) {
    hass.formatEntityState = (stateObj) => `${stateObj?.state} (localized)`;
  }
  if (opts.connection) {
    const subscribe = (eventType) => (callback, message) => {
      const sub = {callback, message, eventType, closed: false};
      subscriptions.push(sub);
      return Promise.resolve(() => {
        sub.closed = true;
      });
    };
    hass.connection = {
      // WebSocket API used by the HA frontend: subscribeMessage(callback, {type: ...}) -> Promise<unsubscribe>
      subscribeMessage: (callback, message) => subscribe(message?.event_type)(callback, message),
      subscribeEvents: (callback, eventType) =>
        subscribe(eventType)(callback, {event_type: eventType}),
      sendMessagePromise: () => Promise.resolve({})
    };
  }

  mock.hass = hass;
  return mock;
}

/**
 * Build a mock from a fixture variant ({widget, states, config?, hass?}). `variant.hass` may carry
 * {locale, config, themes, connection, origin}.
 * @param {{states?: Object, hass?: Object}} variant
 * @param {MockOptions} [extra]
 */
export function mockFromVariant(variant, extra = {}) {
  return createMockHass({
    ...(variant.hass || {}),
    ...extra,
    states: {...variant.states, ...(extra.states || {})}
  });
}

/** Hass flavours the contract suite runs every variant under. */
export const HASS_FLAVOURS = {
  // what tests/index.html uses: °C, en-GB
  default: {},
  // no locale, Fahrenheit: exercises the optional-chaining and unit fallbacks
  imperial: {locale: null, config: {unit_system: {temperature: '°F'}}},
  // no config at all
  bare: {locale: null, config: null}
};
