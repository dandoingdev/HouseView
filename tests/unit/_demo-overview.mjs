// A tiny overview used by the core unit tests, so they never depend on the weather overview.
// One option of every type, a watched entity, and one data spec.
import {defineOverview} from '../../src/core/define-overview.js';
import {forecastSpec} from '../../src/core/subscriptions.js';

export const demo = defineOverview({
  type: 'demo',
  label: 'Demo overview',
  order: 990,
  domains: ['sensor', 'weather'],
  strings: {en: {'demo_overview.label': 'Demo overview', 'demo_overview.description': 'A demo.'}},
  options: {
    flag: {type: 'boolean', default: true},
    level: {type: 'number', default: 3, min: 1, max: 5},
    mode: {type: 'enum', values: ['a', 'b'], default: 'a'},
    kind: {type: 'enum', values: ['x', 'y'], default: 'x', error: 'Demo kind must be x or y.'},
    picks: {type: 'enum_list', values: ['one', 'two', 'three'], default: ['one'], max: 2},
    peer: {type: 'entity', domains: ['sun'], default: 'sun.sun'},
    note: {type: 'text'}
  },
  watch: (options) => [options.peer],
  data: ({entityId}) => (entityId ? {daily: forecastSpec(entityId, 'daily')} : {}),
  render: (ctx) => `<div class="ov-scene">${ctx.esc(ctx.rawName)}|${ctx.mode}</div>`
});
