// Shared, refcounted data subscriptions. No polling, no intervals.
// One websocket subscription per (connection, spec.id), however many cards or screensavers use it.

/** WeatherEntityFeature bits in `supported_features`. */
export const FORECAST_FEATURE = {daily: 1, hourly: 2, twice_daily: 4};

const settings = {
  graceMs: 2000, // keep a subscription this long after the last release (page re-renders, card moves)
  // Looked up at call time so a test (or the browser harness) can replace the globals.
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id)
};

/** Tests inject fake timers: configure({setTimeout, clearTimeout, graceMs}). */
export function configure(overrides) {
  Object.assign(settings, overrides);
}

/** hass.connection -> Map<spec.id, Entry>. Weak, so a dropped connection takes its entries with it. */
const stores = new WeakMap();
let open = 0;

/** Number of live websocket subscriptions (tests and the dev overlay). */
export const openCount = () => open;

const NOOP_LEASE = Object.freeze({release() {}, live: false});

/**
 * @typedef {Object} DataSpec
 * @property {string} id                         dedupe key, e.g. 'weather-forecast|weather.home|daily'
 * @property {(hass:any, emit:(value:any)=>void)=>Promise<=>void>|(=>void)} subscribe
 * @property {(hass:any)=>boolean} [supported]   false = never subscribe (feature bit missing); fallback only
 * @property {(hass:any)=>any} [fallback]        value used with no connection / unsupported / failed / before first message
 */

/**
 * Take a lease on a subscription. `onValue` is called after every new payload and after a failure
 * (re-read the data with peek). Always release the lease. Returns a no-op lease (`live: false`) when there
 * is no websocket connection (mock hass) or the spec is unsupported: peek then serves the fallback.
 * @param {any} hass
 * @param {DataSpec} spec
 * @param { => void} [onValue]
 * @returns {{release:  => void, live: boolean}}
 */
export function acquire(hass, spec, onValue = () => {}) {
  const connection = hass?.connection;
  if (!connection || spec.supported?.(hass) === false) return NOOP_LEASE;
  let store = stores.get(connection);
  if (!store) stores.set(connection, (store = new Map()));
  let entry = store.get(spec.id);
  if (entry) {
    // Re-leased inside the grace period: keep the subscription (and the value we already have).
    settings.clearTimeout(entry.grace);
    entry.grace = null;
  } else {
    entry = openEntry(store, spec, hass);
  }
  const token = {onValue};
  entry.leases.add(token);
  let released = false;
  return {
    live: true,
    release() {
      if (released) return;
      released = true;
      entry.leases.delete(token);
      if (!entry.leases.size) {
        entry.grace = settings.setTimeout(() => closeEntry(store, entry), settings.graceMs);
      }
    }
  };
}

/**
 * Latest payload for a spec, synchronously. Pure with respect to render: safe to call from it.
 * @param {any} hass
 * @param {DataSpec} spec
 */
export function peek(hass, spec) {
  const entry = hass?.connection && stores.get(hass.connection)?.get(spec.id);
  const value = entry && entry.hasValue ? entry.value : undefined;
  return value ?? spec.fallback?.(hass) ?? null;
}

function openEntry(store, spec, hass) {
  const entry = {
    spec,
    leases: new Set(),
    hasValue: false,
    value: undefined,
    json: '',
    closed: false,
    unsub: null,
    grace: null
  };
  store.set(spec.id, entry);
  open++;
  const emit = (value) => {
    if (entry.closed) return;
    const json = JSON.stringify(value ?? null);
    if (entry.hasValue && json === entry.json) return; // identical payloads are not re-delivered
    Object.assign(entry, {value, json, hasValue: true});
    notify(entry);
  };
  // Consumers re-peek and get the fallback. HA resubscribes by itself after a websocket reconnect.
  const fail = () => notify(entry);
  let confirmation;
  try {
    confirmation = Promise.resolve(spec.subscribe(hass, emit));
  } catch (error) {
    confirmation = Promise.reject(error); // a throwing subscribe is a failure like a rejected one
  }
  confirmation.then((unsub) => {
    if (entry.closed) {
      safely(unsub); // released before the subscription was confirmed
    } else {
      entry.unsub = unsub;
    }
  }, fail);
  return entry;
}

function closeEntry(store, entry) {
  if (entry.closed || entry.leases.size) return;
  entry.closed = true;
  open--;
  if (store.get(entry.spec.id) === entry) store.delete(entry.spec.id);
  safely(entry.unsub);
}

const notify = (entry) => {
  for (const token of [...entry.leases]) safely(() => token.onValue());
};

function safely(fn) {
  try {
    if (typeof fn === 'function') fn();
  } catch (error) {
    console.error('[houseview] subscription callback failed', error);
  }
}

// ---- spec constructors ----------------------------------------------------------------------------------------

/**
 * Does the weather entity offer this forecast type? Home Assistant exposes it as a bit of `supported_features`.
 * A non-numeric value (mock hass) means "try it": a failed subscription falls back.
 */
export function supportsForecast(stateObj, type) {
  if (!stateObj) return false;
  const bits = stateObj.attributes?.supported_features;
  return typeof bits !== 'number' || !!(bits & FORECAST_FEATURE[type]);
}

/** weather/subscribe_forecast; callback payload is {type, forecast: Array|null}. */
export function forecastSpec(entityId, type = 'daily') {
  return {
    id: `weather-forecast|${entityId}|${type}`,
    supported: (hass) => supportsForecast(hass?.states?.[entityId], type),
    subscribe: (hass, emit) =>
      hass.connection.subscribeMessage(
        (event) => emit(Array.isArray(event?.forecast) ? event.forecast : null),
        {type: 'weather/subscribe_forecast', forecast_type: type, entity_id: entityId}
      ),
    fallback: (hass) => legacyForecast(hass?.states?.[entityId], type)
  };
}

/**
 * Pre-2024.3 `attributes.forecast` (one list). Served to the type it looks like: `hourly` when its first two
 * items are 3 hours or less apart, `daily` otherwise. Null for the other type and when there is no list.
 */
export function legacyForecast(stateObj, type) {
  const list = stateObj?.attributes?.forecast;
  if (!Array.isArray(list) || !list.length) return null;
  const gap =
    list.length > 1 ? Date.parse(list[1].datetime) - Date.parse(list[0].datetime) : Infinity;
  return (gap <= 3 * 3600e3 ? 'hourly' : 'daily') === type ? list : null;
}

/** Any other websocket message subscription (for new overviews). */
export function messageSpec(id, message, {map = (event) => event, supported, fallback} = {}) {
  return {
    id,
    supported,
    fallback,
    subscribe: (hass, emit) => hass.connection.subscribeMessage((e) => emit(map(e)), message)
  };
}

/** Event bus subscription (hass.connection.subscribeEvents). */
export function eventSpec(id, eventType, {map = (event) => event, fallback} = {}) {
  return {
    id,
    fallback,
    subscribe: (hass, emit) => hass.connection.subscribeEvents((e) => emit(map(e)), eventType)
  };
}
