// Owns the data leases of ONE overview instance (a screensaver entry or a rendered overview card).
// Leases follow the options (entity change), the websocket connection and the entity's supported features.
import {acquire} from './subscriptions.js';
import {specsFor} from './overview-context.js';

/**
 * @param {Object} o
 * @param {Object} o.overview            a defineOverview module
 * @param {Object} o.options             resolved options (output of resolveOptions)
 * @param { => any} o.getHass          the current hass object (the controller's `_hass`)
 * @param { => void} o.onChange        called after a payload arrived or a subscription failed
 */
export function createOverviewSession({overview, options, getHass, onChange}) {
  /** spec.id -> lease */
  const leases = new Map();
  let connection;
  // What the last sync looked at. Home Assistant sets a new hass for every state change in the house, so sync
  // runs far more often than anything it depends on changes: skip it when nothing it reads can have changed.
  let synced = false;
  let seenOptions;
  let seenState;

  const releaseAll = () => {
    for (const lease of leases.values()) lease.release();
    leases.clear();
  };

  /** Idempotent. Call after construction, on every hass update and after setOptions. */
  const sync = () => {
    const hass = getHass();
    if (!hass) return;
    // Same connection, same options, same state object of the entity (its supported_features decide which
    // subscriptions are possible) and every lease already live: there is nothing to add, drop or retry.
    // (A lease that is not live is retried on every sync, so the loop below still runs for those.)
    const state = hass.states?.[options.entity];
    if (
      synced &&
      hass.connection === connection &&
      options === seenOptions &&
      state === seenState &&
      [...leases.values()].every((lease) => lease.live)
    ) {
      return;
    }
    synced = true;
    seenOptions = options;
    seenState = state;
    if (hass.connection !== connection) {
      releaseAll(); // reconnect or first hass: start clean
      connection = hass.connection;
    }
    const wanted = new Map(
      Object.values(specsFor(overview, hass, options)).map((spec) => [spec.id, spec])
    );
    for (const [id, lease] of leases) {
      if (!wanted.has(id)) {
        lease.release();
        leases.delete(id);
      }
    }
    for (const [id, spec] of wanted) {
      // A lease that is not live (no connection, or a spec that was not supported) is retried on every sync,
      // which is how a feature bit that appears later is picked up.
      if (!leases.get(id)?.live) leases.set(id, acquire(hass, spec, onChange));
    }
  };

  return {
    sync,
    setOptions(next) {
      options = next;
      sync();
    },
    dispose: releaseAll,
    get size() {
      return leases.size;
    }
  };
}
