import {configuredIds, discover} from './model.js';

/** Only read registry metadata while this view has a subscription lease; no device services or polling. */
export function worldClocksSpec(options) {
  return {
    id: 'worldclock-registry',
    supported: (hass) =>
      typeof hass.callWS === 'function' && typeof hass.connection?.subscribeEvents === 'function',
    fallback: () => configuredIds(options).map((entity) => ({entity})),
    async subscribe(hass, emit) {
      let alive = true;
      let revision = 0;
      const refresh = async () => {
        const current = ++revision;
        try {
          const [entries, configs] = await Promise.all([
            hass.callWS({type: 'config/entity_registry/list'}),
            hass.callWS({type: 'config_entries/get', domain: 'worldclock'}).catch(() => [])
          ]);
          if (alive && current === revision) emit(discover(entries, configs));
        } catch {
          // Restricted accounts can still use explicitly selected sensor entities.
          if (alive && current === revision) emit([]);
        }
      };
      const unsubs = [];
      try {
        for (const event of ['entity_registry_updated', 'config_entry_changed']) {
          unsubs.push(
            await hass.connection.subscribeEvents(() => {
              void refresh();
            }, event)
          );
        }
        await refresh();
      } catch {
        alive = false;
        unsubs.forEach((unsubscribe) => unsubscribe());
        throw new Error('World clock registry subscription unavailable');
      }
      return () => {
        alive = false;
        unsubs.forEach((unsubscribe) => unsubscribe());
      };
    }
  };
}
