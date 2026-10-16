// The home overview's pure model (src/overviews/home/model.js), its render in Node, and the framework pieces it
// needs: the `interactive` flag, `watch(options, config)` and the `goto-widget` core action.
import test from 'node:test';
import assert from 'node:assert/strict';
import home from '../../src/overviews/home/index.js';
import {variants} from '../../src/overviews/home/fixtures.js';
import {
  MAX_CAMERAS,
  ago,
  anyPlaying,
  chips,
  collect,
  lightsOn,
  lockCounts,
  temperatureRange,
  visibleCameras
} from '../../src/overviews/home/model.js';
import {contextFor, defineOverview} from '../../src/core/define-overview.js';
import {registerStrings} from '../../src/core/i18n.js';
import {createMockHass} from '../fixtures/mock-hass.js';
import {featureActions} from '../../src/core/core-actions.js';
import {FEATURE_ACTIONS} from '../fixtures/contract-rules.mjs';
import {watchedIds} from '../../src/core/hass-signature.js';
import {registerWidget, _resetRegistry} from '../../src/core/registry.js';
import strings from '../../src/overviews/home/strings.js';

registerStrings(strings);

const stateOf = (states) => (id) => states[id];
const s = (state, attributes = {}) => ({state, attributes});

test('collect groups the widgets by kind with their position, one per entity, scenes only', () => {
  const groups = collect([
    {type: 'home_overview'},
    {type: 'clock'},
    {type: 'light', entity: 'light.a'},
    {type: 'light', entity: 'light.a'},
    {type: 'light', entity: 'light.b', name: 'B'},
    {type: 'climate', entity: 'climate.x'},
    {type: 'lock', entity: 'lock.d'},
    {type: 'media_player', entity: 'media_player.m'},
    {type: 'camera', entity: 'camera.c', name: 'Door'},
    {type: 'action', entity: 'scene.evening', icon: 'mdi:movie'},
    {type: 'action', entity: 'script.s'},
    {type: 'action', entity: 'button.b'},
    {type: 'native_card'},
    null
  ]);
  assert.deepEqual(groups.light, [
    {index: 2, entity: 'light.a'},
    {index: 4, entity: 'light.b', name: 'B'}
  ]);
  assert.deepEqual(groups.climate, [{index: 5, entity: 'climate.x'}]);
  assert.deepEqual(groups.lock, [{index: 6, entity: 'lock.d'}]);
  assert.deepEqual(groups.media, [{index: 7, entity: 'media_player.m'}]);
  assert.deepEqual(groups.camera, [{index: 8, entity: 'camera.c', name: 'Door'}]);
  assert.deepEqual(groups.scene, [{index: 9, entity: 'scene.evening', icon: 'mdi:movie'}]);
  assert.deepEqual(collect(undefined).scene, []);
  assert.deepEqual(collect('x').light, []);
});

test('temperatureRange: a range, one value, none, unavailable and odd values', () => {
  const items = (...ids) => ids.map((entity, index) => ({index, entity}));
  const states = {
    'climate.a': s('heat', {current_temperature: 20.4}),
    'climate.b': s('heat', {current_temperature: 21.6}),
    'climate.c': s('cool', {current_temperature: 20.6}),
    'climate.off': s('unavailable', {current_temperature: 5}),
    'climate.none': s('heat', {}),
    'climate.str': s('heat', {current_temperature: '20'})
  };
  const read = stateOf(states);
  assert.equal(temperatureRange(items('climate.a', 'climate.b'), read).text, '20-22');
  assert.equal(temperatureRange(items('climate.a', 'climate.c'), read).text, '20-21');
  assert.equal(temperatureRange(items('climate.a'), read).text, '20');
  assert.equal(temperatureRange(items('climate.a', 'climate.a'), read).text, '20');
  assert.equal(temperatureRange(items('climate.b', 'climate.c'), read).text, '21-22');
  assert.equal(
    temperatureRange(items('climate.off', 'climate.none', 'climate.str'), read).text,
    '--'
  );
  assert.equal(temperatureRange([], read).text, '--');
  assert.equal(temperatureRange(items('climate.gone'), read).min, null);
  assert.equal(
    temperatureRange(items('climate.a', 'climate.b'), read, (n) => `<${n}>`).text,
    '<20>-<22>'
  );
});

test('counts: lights on, locks locked or open, playing', () => {
  const read = stateOf({
    'light.a': s('on'),
    'light.b': s('off'),
    'light.c': s('on'),
    'light.d': s('unavailable'),
    'lock.a': s('locked'),
    'lock.b': s('unlocked'),
    'lock.c': s('jammed'),
    'lock.d': s('unavailable'),
    'lock.e': s('locking'),
    'media_player.a': s('paused'),
    'media_player.b': s('playing')
  });
  const list = (...ids) => ids.map((entity, index) => ({index, entity}));
  assert.equal(lightsOn(list('light.a', 'light.b', 'light.c', 'light.d', 'light.x'), read), 2);
  assert.deepEqual(lockCounts(list('lock.a', 'lock.b', 'lock.c', 'lock.d', 'lock.e'), read), {
    locked: 2,
    unlocked: 2
  });
  assert.equal(anyPlaying(list('media_player.a'), read), false);
  assert.equal(anyPlaying(list('media_player.a', 'media_player.b'), read), true);
});

test('chips exist only for the kinds on the carousel, in a fixed order, with their target page widget', () => {
  const states = {
    'climate.a': s('heat', {current_temperature: 20}),
    'light.a': s('off'),
    'lock.a': s('locked'),
    'media_player.a': s('playing')
  };
  const widgets = [
    {type: 'media_player', entity: 'media_player.a'},
    {type: 'lock', entity: 'lock.a'},
    {type: 'light', entity: 'light.a'},
    {type: 'climate', entity: 'climate.a'}
  ];
  const all = chips(collect(widgets), stateOf(states));
  assert.deepEqual(
    all.map((c) => [c.key, c.tone, c.value, c.target]),
    [
      ['climate', 'cyan', '20', 3],
      ['lights', 'yellow', '0', 2],
      ['locks', 'teal', '1', 1],
      ['media', 'grey', '', 0]
    ]
  );
  assert.equal(all[1].dim, true, 'zero lights on is dim');
  assert.equal(all[0].dim, false);
  assert.equal(all[3].active, true, 'a playing speaker has the accent');
  assert.deepEqual(chips(collect([{type: 'clock'}]), stateOf(states)), []);
  assert.deepEqual(
    chips(collect([{type: 'light', entity: 'light.a'}]), stateOf(states)).map((c) => c.key),
    ['lights']
  );
  // an open lock replaces the teal chip by an amber one that counts the open locks
  const open = chips(
    collect([
      {type: 'lock', entity: 'lock.a'},
      {type: 'lock', entity: 'lock.b'},
      {type: 'lock', entity: 'lock.c'}
    ]),
    stateOf({'lock.a': s('locked'), 'lock.b': s('unlocked'), 'lock.c': s('open')})
  );
  assert.deepEqual(
    open.map((c) => [c.key, c.tone, c.value, c.target]),
    [['unlocked', 'amber', '2', 0]]
  );
});

test('at most three cameras are shown', () => {
  const widgets = [1, 2, 3, 4].map((n) => ({type: 'camera', entity: `camera.c${n}`}));
  assert.equal(MAX_CAMERAS, 3);
  assert.deepEqual(
    visibleCameras(collect(widgets)).map((c) => c.entity),
    ['camera.c1', 'camera.c2', 'camera.c3']
  );
});

test('ago: now under a minute, then minutes, hours and days', () => {
  const now = Date.UTC(2026, 9, 15, 10, 0, 0);
  const before = (seconds) => now - seconds * 1000;
  assert.deepEqual(ago(before(0), now), {value: 0, unit: 'second'});
  assert.deepEqual(ago(before(59), now), {value: 0, unit: 'second'});
  assert.deepEqual(ago(before(60), now), {value: -1, unit: 'minute'});
  assert.deepEqual(ago(before(125), now), {value: -2, unit: 'minute'});
  assert.deepEqual(ago(before(3599), now), {value: -59, unit: 'minute'});
  assert.deepEqual(ago(before(3600), now), {value: -1, unit: 'hour'});
  assert.deepEqual(ago(before(86399), now), {value: -23, unit: 'hour'});
  assert.deepEqual(ago(before(2 * 86400 + 5), now), {value: -2, unit: 'day'});
  assert.deepEqual(ago(now + 60000, now), {value: 0, unit: 'second'}, 'the future counts as now');
  assert.equal(ago(null, now), null);
  assert.equal(ago(NaN, now), null);
});

const render = (variant, mode = 'card', hassOptions = {}) => {
  const hass = createMockHass({states: variant.states, ...hassOptions}).hass;
  const ctx = contextFor(home, {hass, config: variant.config, raw: variant.options, mode});
  return home.render(ctx, mode);
};

test('embedded and full-screen Home render interactive scene controls; only full-screen Home has a close button', () => {
  const html = render(variants.ok);
  for (const text of [
    '20-22°',
    'data-entity="widget:1"',
    'camera-grid',
    'run-action',
    'scene.evening'
  ]) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(!html.includes('script.good_night'), 'a script is not a scene');
  const full = render(variants.ok, 'screensaver');
  assert.ok(full.includes('data-action="run-action"'));
  assert.ok(full.includes('data-action="overview-close"'));
  assert.ok(!html.includes('data-action="overview-close"'));
  assert.ok(render(variants.ok, 'screensaver').includes('20-22°'));
  assert.ok(
    /Add lights, climate, locks, cameras or scenes to this dashboard/.test(render(variants.empty))
  );
  assert.ok(!/<button/.test(render(variants.empty)));
  assert.ok(!render(variants.noTime).includes('ov-home-time'));
  assert.ok(render(variants.noTime).includes('>My Home<'));
});

test('lights only: one chip and no cameras or scenes section', () => {
  const html = render(variants.lightsOnly);
  assert.equal((html.match(/data-tone=/g) || []).length, 1);
  assert.ok(!html.includes('ov-home-cameras') && !html.includes('ov-home-scenes'));
});

test('the unlocked fixture shows the amber open-lock chip', () => {
  const html = render(variants.unlocked);
  assert.ok(html.includes('data-tone="amber"') && html.includes('mdi:lock-open-variant'));
});

test('watch(options, config): every entity of the configured widgets', () => {
  const ids = home.watch({}, variants.ok.config);
  for (const id of [
    'climate.living_room',
    'light.kitchen',
    'lock.front_door',
    'media_player.kitchen_speaker',
    'camera.front_door',
    'scene.evening'
  ]) {
    assert.ok(ids.includes(id), id);
  }
  assert.ok(!ids.includes('script.good_night'));
  assert.deepEqual(home.widget.watch({type: 'home_overview'}, variants.lightsOnly.config), [
    'light.kitchen',
    'light.hall',
    'light.porch'
  ]);
  assert.deepEqual(home.watch({}, undefined), []);
});

test('hass-signature passes the card config to a widget watch, so the home card watches the widgets', () => {
  _resetRegistry();
  registerWidget(home.widget);
  const config = {widgets: [{type: 'home_overview'}, {type: 'light', entity: 'light.zzz'}]};
  assert.ok(watchedIds(config).includes('light.zzz'));
  assert.ok(
    watchedIds({
      widgets: [{type: 'home_overview'}, ...variants.ok.config.widgets.slice(1)]
    }).includes('scene.evening')
  );
});

test('interactive: a boolean, default false; an interactive card has no tap overlay', () => {
  const base = {
    type: 'x',
    label: 'X',
    order: 1,
    entity: 'none',
    strings: {en: {'x_overview.label': 'X', 'x_overview.description': 'X.'}},
    render: () => '<div class="ov-scene"></div>'
  };
  assert.equal(defineOverview(base).interactive, false);
  assert.equal(defineOverview({...base, interactive: true}).interactive, true);
  assert.throws(
    () => defineOverview({...base, interactive: 'yes'}),
    /interactive must be true or false/
  );
  assert.equal(home.interactive, true);
  assert.equal(home.selectable, true, 'the home screen can also be a screensaver');
  assert.equal(home.widget.defaultSize, 'large');
});

test('goto-widget: jumps to the page that holds the widget; unknown input does nothing', () => {
  assert.ok(FEATURE_ACTIONS.includes('goto-widget'));
  const def = featureActions['goto-widget'];
  assert.equal(def.immediate, true);
  const pages = [];
  const card = {
    _screens: [
      {placements: [{index: 0}, {index: 1}]},
      {placements: [{index: 2}]},
      {placements: [{index: 3}, {index: 4}]}
    ],
    _setPage: (page) => pages.push(page)
  };
  const ctx = {card};
  def.run(ctx, 'widget:4');
  def.run(ctx, 'widget:0');
  def.run(ctx, 'widget:2');
  assert.deepEqual(pages, [2, 0, 1]);
  for (const bad of ['widget:9', 'widget:-1', 'widget:x', 'light.a', '', undefined, 'widget:1.5']) {
    def.run(ctx, bad);
  }
  def.run({card: {_setPage: () => assert.fail('no screens')}}, 'widget:1');
  assert.deepEqual(pages, [2, 0, 1]);
});

test('the tick re-renders only when the minute (clock, "2m ago") or the 30 s snapshot bucket changes', () => {
  const minute = Date.UTC(2026, 9, 15, 10, 0, 0);
  const run = (widgets, options, steps) => {
    let now = minute;
    let renders = 0;
    const store = new Map();
    const ctx = () => ({
      el: {},
      config: {widgets},
      options,
      store,
      now: () => now,
      requestRender: () => renders++
    });
    home.afterRender(ctx());
    return steps.map((seconds) => {
      now = minute + seconds * 1000;
      home.tick.run(ctx());
      return renders;
    });
  };
  const camera = {type: 'camera', entity: 'camera.c'};
  // with a camera: 30 s and 60 s each change something
  assert.deepEqual(
    run([camera], {show_time: true}, [1, 29, 30, 31, 59, 60, 61]),
    [0, 0, 1, 1, 1, 2, 2]
  );
  // a clock only: once a minute
  assert.deepEqual(run([], {show_time: true}, [1, 30, 59, 60, 90, 120]), [0, 0, 0, 1, 1, 2]);
  // a camera and no clock: the label and the picture still move
  assert.deepEqual(run([camera], {show_time: false}, [10, 30, 60]), [0, 1, 2]);
  // nothing depends on time: nothing happens
  assert.deepEqual(run([], {show_time: false}, [30, 60, 600]), [0, 0, 0]);
  assert.deepEqual(run([{type: 'light', entity: 'light.a'}], {show_time: false}, [60]), [0]);
  // not mounted (no element): nothing
  let renders = 0;
  home.tick.run({
    el: null,
    config: {widgets: [camera]},
    options: {show_time: true},
    store: new Map(),
    now: () => minute,
    requestRender: () => renders++
  });
  assert.equal(renders, 0);
});

test('binsThisWeek reads the dated attributes within the week, one icon per type', async () => {
  const {binsThisWeek} = await import('../../src/overviews/home/model.js');
  const now = Date.parse('2026-10-15T10:00:00Z');
  const state = {
    state: 'Recycling in 1 days',
    attributes: {
      '2026-10-16': 'Recycling',
      '2026-10-23': 'Garden waste',
      '2026-10-17': 'Non-Recyclable Waste, Food Waste'
    }
  };
  assert.deepEqual(
    binsThisWeek(state, now).map((b) => [b.type, b.days, b.icon]),
    [
      ['Recycling', 1, 'mdi:recycle'],
      ['Non-Recyclable Waste', 2, 'mdi:trash-can'],
      ['Food Waste', 2, 'mdi:food-apple']
    ]
  );
  assert.deepEqual(
    binsThisWeek({state: 'Garden waste in 3 days', attributes: {}}, now).map((b) => b.type),
    ['Garden waste']
  );
  assert.deepEqual(binsThisWeek({state: 'unavailable', attributes: {}}, now), []);
});

test('transportChip shows the next time, and a line without one is not running', async () => {
  const {transportChip} = await import('../../src/overviews/home/model.js');
  const states = {
    'sensor.a': {state: '10:19', attributes: {friendly_name: 'Piccadilly'}},
    'sensor.b': {state: 'None', attributes: {}}
  };
  const of = (id) => states[id];
  assert.deepEqual(transportChip({entity: 'sensor.a', label: 'Work', icon: 'mdi:train'}, of), {
    entity: 'sensor.a',
    label: 'Work',
    icon: 'mdi:train',
    time: '10:19',
    running: true
  });
  assert.equal(transportChip({entity: 'sensor.b'}, of).running, false);
  assert.equal(transportChip({entity: 'sensor.missing'}, of).running, false);
});
