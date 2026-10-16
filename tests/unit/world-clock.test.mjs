import {it} from 'node:test';
import assert from 'node:assert/strict';
import {
  clockRows,
  configuredIds,
  discover,
  relativeTime,
  validZone
} from '../../src/overviews/world_clock/model.js';
import {worldClocksSpec} from '../../src/overviews/world_clock/data.js';

it('discovers only enabled integration sensors and keeps registry timezone metadata', () => {
  assert.deepEqual(
    discover(
      [
        {entity_id: 'sensor.sg', platform: 'worldclock', config_entry_id: 'sg'},
        {entity_id: 'sensor.disabled', platform: 'worldclock', disabled_by: 'user'},
        {entity_id: 'sensor.other', platform: 'template'}
      ],
      [{entry_id: 'sg', title: 'Singapore'}]
    ),
    [{entity: 'sensor.sg', name: '', zone: 'Singapore'}]
  );
  assert.equal(validZone('not/a/timezone'), null);
  assert.deepEqual(configuredIds({entities: 'sensor.sg, sensor.sg sensor.ny'}), [
    'sensor.sg',
    'sensor.ny'
  ]);
});
it('computes day changes, DST, and fractional offsets without guessing from the time string', () => {
  assert.deepEqual(relativeTime(Date.parse('2026-10-16T20:47Z'), 'Singapore', 'America/New_York'), {
    days: 1,
    hours: 12
  });
  assert.deepEqual(
    relativeTime(Date.parse('2026-03-15T12:00Z'), 'America/New_York', 'Europe/London'),
    {days: 0, hours: -4}
  );
  assert.deepEqual(relativeTime(Date.parse('2026-10-16T12:00Z'), 'Asia/Kathmandu', 'UTC'), {
    days: 0,
    hours: 5.75
  });
  assert.deepEqual(
    relativeTime(Date.parse('2026-10-16T00:30Z'), 'America/New_York', 'Europe/London'),
    {days: -1, hours: -5}
  );
  assert.equal(relativeTime(0, 'unknown', 'UTC'), null);
});
it('preserves sensor time formatting, unavailable rows and explicit order', () => {
  const hass = {
    states: {
      'sensor.sg': {state: '04:47', attributes: {friendly_name: 'Singapore'}},
      'sensor.offline': {state: 'unavailable'}
    },
    locale: {time_zone: 'server'},
    config: {time_zone: 'America/New_York'}
  };
  const rows = clockRows(
    hass,
    [{entity: 'sensor.sg', zone: 'Singapore'}],
    {entities: 'sensor.offline,sensor.sg'},
    Date.parse('2026-10-16T20:47Z')
  );
  assert.deepEqual(
    rows.map((row) => row.time),
    ['—', '04:47']
  );
  assert.equal(rows[1].relative.hours, 12);
});
it('registry subscriptions refresh discovery and unsubscribe cleanly', async () => {
  const handlers = new Map();
  let removed = 0;
  const payloads = [];
  const spec = worldClocksSpec({});
  const hass = {
    callWS: async ({type}) =>
      type === 'config/entity_registry/list'
        ? [{entity_id: 'sensor.sg', platform: 'worldclock'}]
        : [],
    connection: {
      subscribeEvents: async (fn, type) => {
        handlers.set(type, fn);
        return () => removed++;
      }
    }
  };
  const close = await spec.subscribe(hass, (rows) => payloads.push(rows));
  assert.equal(payloads[0][0].entity, 'sensor.sg');
  handlers.get('entity_registry_updated')();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(payloads.length, 2);
  close();
  assert.equal(removed, 2);
});
