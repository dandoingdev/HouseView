// Automatic displays and the priority model in core/define-overview.js and core/overview-registry.js:
// defineOverview(priority, eligible), the option validation, the implicit entries and pickEntry.
// cover_art is NOT registered here (see overview-implicit-mixin.test.mjs): the test of "not in the bundle" needs it absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import {defineOverview} from '../../src/core/define-overview.js';
import {
  AUTOMATIC_DISPLAYS,
  normalizeScreensaver,
  pickEntry,
  registerOverview,
  validateScreensaver
} from '../../src/core/overview-registry.js';
import timer from '../../src/overviews/timer/index.js';
import {demo} from './_demo-overview.mjs';

registerOverview(timer);
registerOverview(demo);

const strings = (type) => ({
  en: {[`${type}_overview.label`]: `${type} label`, [`${type}_overview.description`]: type}
});
const base = (type, extra = {}) => ({
  type,
  label: `${type} overview`,
  order: 700,
  domains: ['sensor'],
  strings: strings(type),
  render: () => '<div class="ov-scene"></div>',
  ...extra
});

// ---- defineOverview: priority and eligible ----

test('priority defaults to 0 and is kept; eligible is optional', () => {
  assert.equal(defineOverview(base('p_none')).priority, 0);
  assert.equal(defineOverview(base('p_ten', {priority: 10})).priority, 10);
  assert.equal(defineOverview(base('p_neg', {priority: -5})).priority, -5);
  const eligible = () => true;
  assert.equal(defineOverview(base('p_el', {eligible})).eligible, eligible);
  assert.equal(defineOverview(base('p_noel')).eligible, undefined);
  assert.equal(Object.isFrozen(defineOverview(base('p_frozen', {priority: 3}))), true);
});

test('priority must be an integer, eligible a function', () => {
  for (const priority of [1.5, '10', null, NaN, Infinity]) {
    assert.throws(
      () => defineOverview(base('p_bad', {priority})),
      /^Error: Overview p_bad: priority must be an integer\.$/,
      String(priority)
    );
  }
  assert.throws(
    () => defineOverview(base('p_bad', {eligible: true})),
    /^Error: Overview p_bad: eligible must be a function\.$/
  );
});

test('an event overview is above every idle entry: priority and eligible are refused on it', () => {
  const event = {activation: 'event', autoShow: () => true};
  assert.doesNotThrow(() => defineOverview(base('p_event', event)));
  assert.throws(
    () => defineOverview(base('p_event', {...event, priority: 1})),
    /^Error: Overview p_event: priority and eligible need activation: 'idle'\.$/
  );
  assert.throws(
    () => defineOverview(base('p_event', {...event, eligible: () => true})),
    /^Error: Overview p_event: priority and eligible need activation: 'idle'\.$/
  );
});

// ---- validation of timer_display / music_screensaver ----

const widgets = [{type: 'timer', entity: 'timer.kitchen'}];
const check = (extra) => validateScreensaver({widgets, ...extra});

test('timer_display and music_screensaver accept true, false and a list of the right entities', () => {
  for (const value of [true, false, [], ['timer.a'], ['timer.a', 'timer.b']]) {
    assert.doesNotThrow(() => check({timer_display: value}), JSON.stringify(value));
  }
  for (const value of [true, false, [], ['media_player.a', 'media_player.b']]) {
    assert.doesNotThrow(() => check({music_screensaver: value}), JSON.stringify(value));
  }
  assert.doesNotThrow(() => validateScreensaver({widgets}), 'absent keys are not checked');
  assert.doesNotThrow(() =>
    validateScreensaver({climate: {entity: 'climate.x'}, timer_display: false})
  );
});

test('timer_display: exact message for anything else', () => {
  const message = 'timer_display must be true, false or a list of timer entities.';
  for (const value of [
    'yes',
    1,
    0,
    null,
    {},
    'timer.a',
    ['light.a'],
    ['timer.a', 'sensor.b'],
    [1],
    [null],
    ['timer']
  ]) {
    assert.throws(
      () => check({timer_display: value}),
      (error) => error.message === message,
      JSON.stringify(value)
    );
  }
});

test('music_screensaver: exact message for anything else', () => {
  const message = 'music_screensaver must be true, false or a list of media_player entities.';
  for (const value of [
    'yes',
    1,
    null,
    {},
    'media_player.a',
    ['timer.a'],
    ['media_player.a', 'light.b'],
    [7]
  ]) {
    assert.throws(
      () => check({music_screensaver: value}),
      (error) => error.message === message,
      JSON.stringify(value)
    );
  }
});

test('the options are checked after the screensaver block, so existing messages keep their precedence', () => {
  assert.throws(
    () => check({screensaver: {type: 'nope'}, timer_display: 'x'}),
    /^Error: Unsupported screensaver: nope$/
  );
  assert.throws(
    () => check({timer_display: 'x', music_screensaver: 'y'}),
    /^Error: timer_display must be/,
    'timer_display first'
  );
});

// ---- implicit entries ----

const entity = (e) => e.options.entity;
const cfg = (extra = {}, w = widgets) => ({widgets: w, ...extra});

test('no screensaver block and no timer or media_player widget: no entries at all', () => {
  assert.deepEqual(normalizeScreensaver({widgets: []}), []);
  assert.deepEqual(normalizeScreensaver({widgets: [{type: 'light', entity: 'light.a'}]}), []);
  assert.deepEqual(normalizeScreensaver({climate: {entity: 'climate.x'}}), []);
});

test('every timer widget adds one implicit event entry, in widget order, deduplicated', () => {
  const entries = normalizeScreensaver(
    cfg({}, [
      {type: 'timer', entity: 'timer.b'},
      {type: 'light', entity: 'light.a'},
      {type: 'timer', entity: 'timer.a'},
      {type: 'timer', entity: 'timer.b'}
    ])
  );
  assert.deepEqual(entries.map(entity), ['timer.b', 'timer.a']);
  for (const entry of entries) {
    assert.equal(entry.type, 'timer');
    assert.equal(entry.implicit, true);
    assert.equal(entry.event, true);
    assert.equal(entry.enabled, true);
    assert.equal(entry.preview, false);
    assert.equal(entry.startInEditMode, false);
    assert.equal(entry.overview, timer);
  }
  assert.deepEqual(new Set(entries.map((e) => e.index)).size, 2, 'indexes are unique');
});

test('timer_display: false adds nothing; a list replaces the widget-derived list', () => {
  assert.deepEqual(normalizeScreensaver(cfg({timer_display: false})), []);
  assert.deepEqual(normalizeScreensaver(cfg({timer_display: true})).map(entity), ['timer.kitchen']);
  assert.deepEqual(
    normalizeScreensaver(cfg({timer_display: ['timer.x', 'timer.y', 'timer.x']})).map(entity),
    ['timer.x', 'timer.y'],
    'the widget timer.kitchen is not in the list: it gets no display'
  );
  assert.deepEqual(normalizeScreensaver({widgets: [], timer_display: ['timer.x']}).map(entity), [
    'timer.x'
  ]);
  assert.deepEqual(normalizeScreensaver(cfg({timer_display: []})), []);
});

test('an explicit entry for the same overview and entity wins, enabled or not', () => {
  const explicit = normalizeScreensaver(
    cfg({screensaver: {type: 'timer', entity: 'timer.kitchen', preview: true}})
  );
  assert.equal(explicit.length, 1);
  assert.equal(explicit[0].implicit, false);
  assert.equal(explicit[0].preview, true);
  const off = normalizeScreensaver(
    cfg({screensaver: {type: 'timer', entity: 'timer.kitchen', enabled: false}})
  );
  assert.equal(off.length, 1, 'a disabled explicit entry switches that one timer off');
  assert.equal(off[0].enabled, false);
  assert.equal(off[0].implicit, false);
  const other = normalizeScreensaver(
    cfg({screensaver: {type: 'timer', entity: 'timer.other'}}, [
      {type: 'timer', entity: 'timer.kitchen'}
    ])
  );
  assert.deepEqual(
    other.map((e) => [entity(e), e.implicit]),
    [
      ['timer.other', false],
      ['timer.kitchen', true]
    ]
  );
});

test('implicit entries come after the explicit ones and do not clash with their indexes', () => {
  const entries = normalizeScreensaver(
    cfg({
      screensaver: [
        {type: 'demo', entity: 'sensor.a'},
        {type: 'demo', entity: 'sensor.b'}
      ]
    })
  );
  assert.deepEqual(
    entries.map((e) => [e.type, e.implicit, e.index]),
    [
      ['demo', false, 0],
      ['demo', false, 1],
      ['timer', true, 2]
    ]
  );
});

test('a stand-alone card (single_widget) never gets an automatic display', () => {
  const alone = {
    widgets: [{type: 'timer', entity: 'timer.kitchen'}],
    single_widget: true
  };
  assert.deepEqual(normalizeScreensaver(alone), []);
  assert.deepEqual(normalizeScreensaver({...alone, timer_display: ['timer.x']}), []);
  assert.deepEqual(
    normalizeScreensaver({...alone, screensaver: {type: 'demo', entity: 'sensor.a'}}).map(
      (e) => e.type
    ),
    ['demo'],
    'an explicit entry is still honoured'
  );
});

test('music_screensaver adds nothing while the cover_art overview is not in the bundle', () => {
  const entries = normalizeScreensaver({
    widgets: [{type: 'media_player', entity: 'media_player.a'}],
    music_screensaver: true
  });
  assert.deepEqual(entries, []);
});

test('the automatic displays are exactly timer -> timer_display and media_player -> music_screensaver', () => {
  assert.deepEqual(
    AUTOMATIC_DISPLAYS.map((d) => [d.key, d.overview, d.widget, d.domain]),
    [
      ['timer_display', 'timer', 'timer', 'timer'],
      ['music_screensaver', 'cover_art', 'media_player', 'media_player']
    ]
  );
});

// ---- pickEntry ----

const idle = (type, priority, extra = {}) => ({
  type,
  priority,
  enabled: true,
  event: false,
  ...extra
});

test('without priorities or eligibility pickEntry is the plain round robin', () => {
  const entries = [idle('a', 0), idle('b', 0), idle('c', 0)];
  let cursor = 0;
  const seen = [];
  for (let i = 0; i < 5; i++) {
    const {entry, next} = pickEntry(entries, cursor);
    seen.push(entry.type);
    cursor = next;
  }
  assert.deepEqual(seen, ['a', 'b', 'c', 'a', 'b']);
  assert.equal(pickEntry(entries, 1).entry.type, 'b');
  assert.equal(pickEntry(entries, 2).next, 0, 'wraps');
  assert.deepEqual(pickEntry([], 0), {entry: undefined, next: 0});
});

test('the highest priority wins, wherever the cursor is', () => {
  const entries = [idle('weather', 0), idle('cover', 10), idle('clock', 5)];
  for (const cursor of [0, 1, 2]) {
    assert.equal(pickEntry(entries, cursor).entry.type, 'cover', `cursor ${cursor}`);
  }
  assert.equal(pickEntry(entries, 0).next, 2, 'the cursor moves just past the winner');
});

test('equal priorities take turns by the cursor', () => {
  const entries = [idle('a', 10), idle('w', 0), idle('b', 10)];
  let cursor = 0;
  const seen = [];
  for (let i = 0; i < 5; i++) {
    const {entry, next} = pickEntry(entries, cursor);
    seen.push(entry.type);
    cursor = next;
  }
  assert.deepEqual(seen, ['a', 'b', 'a', 'b', 'a']);
});

test('an ineligible entry is out of the running; the next priority takes over; none = undefined', () => {
  const entries = [idle('weather', 0), idle('cover', 10)];
  const ok = new Set(['weather', 'cover']);
  const eligible = (e) => ok.has(e.type);
  assert.equal(pickEntry(entries, 0, {eligible}).entry.type, 'cover');
  ok.delete('cover');
  assert.equal(pickEntry(entries, 0, {eligible}).entry.type, 'weather');
  ok.delete('weather');
  assert.deepEqual(pickEntry(entries, 1, {eligible}), {entry: undefined, next: 1});
});

test('eligibility is asked only about an entry that could still win', () => {
  const entries = [idle('w', 0), idle('c', 10), idle('x', 5)];
  const asked = [];
  pickEntry(entries, 0, {
    eligible: (e) => {
      asked.push(e.type);
      return true;
    }
  });
  assert.deepEqual(asked, ['w', 'c'], 'x cannot beat c and is never asked');
  const none = [];
  pickEntry([idle('a', 0, {enabled: false}), idle('b', 0, {event: true})], 0, {
    eligible: (e) => none.push(e.type)
  });
  assert.deepEqual(none, [], 'disabled and event entries are never asked');
});

test('disabled and event entries are never picked, whatever their priority', () => {
  const entries = [idle('off', 99, {enabled: false}), idle('ev', 99, {event: true}), idle('w', 0)];
  assert.equal(pickEntry(entries, 0).entry.type, 'w');
});

test('an entry priority beats the overview priority; the overview priority is the fallback', () => {
  const entries = [
    {type: 'a', enabled: true, overview: {priority: 7}},
    {type: 'b', enabled: true, priority: 8, overview: {priority: 1}},
    {type: 'c', enabled: true}
  ];
  assert.equal(pickEntry(entries, 0).entry.type, 'b');
  assert.equal(pickEntry(entries.slice(0, 1).concat(entries.slice(2)), 1).entry.type, 'a');
});

test('explicitOnly leaves implicit entries out', () => {
  const entries = [idle('cover', 10, {implicit: true}), idle('weather', 0)];
  assert.equal(pickEntry(entries, 0).entry.type, 'cover');
  assert.equal(pickEntry(entries, 0, {explicitOnly: true}).entry.type, 'weather');
  assert.equal(pickEntry([entries[0]], 0, {explicitOnly: true}).entry, undefined);
});
