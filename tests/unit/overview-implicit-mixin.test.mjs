// Automatic displays and the priority model in the screensaver mixin: a timer widget implies an event overlay, a
// media_player widget an idle entry that only wins while it is eligible. Fake clock, the real shared ticker, idle
// manager and timer overview, a fake shell (screensaver-env.mjs); cover_art is a stub (overview-implicit-stubs.mjs).
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {registerOverview} from '../../src/core/overview-registry.js';
import timer from '../../src/overviews/timer/index.js';
import {demo} from './_demo-overview.mjs';
import {boom, counts, cover, plain, tenA, tenB} from './overview-implicit-stubs.mjs';
import {fire, setup, states} from './screensaver-env.mjs';

for (const overview of [timer, demo, cover, plain, tenA, tenB, boom]) registerOverview(overview);

const TIMER = 'timer.kitchen';
const SPEAKER = 'media_player.living';
const FINISH = '2026-10-15T10:24:00+01:00'; // 15 minutes after the fake clock's start
const timerWidget = (entity = TIMER) => ({type: 'timer', entity});
const speakerWidget = (entity = SPEAKER) => ({type: 'media_player', entity});

const timerState = (state = 'active', id = TIMER) => ({
  [id]: {
    state,
    attributes: {
      friendly_name: 'Kitchen',
      duration: '0:15:00',
      ...(state === 'active' ? {finishes_at: FINISH} : {})
    }
  }
});
const speakerState = (state, attrs = {}, id = SPEAKER) => ({
  [id]: {
    state,
    attributes: {
      friendly_name: 'Living',
      media_title: 'Song',
      entity_picture: '/api/media_player_proxy/media_player.living?token=abc',
      ...attrs
    }
  }
});
const withStates = (...extra) => ({states: Object.assign(states(), ...extra)});

/** A dashboard: `widgets` and extra card keys, configured then connected. */
function dashboard(t, {widgets = [], hass = withStates(), screensaver, ...extra} = {}) {
  const env = setup(t, {screensaver, hass, connect: false});
  Object.assign(env.config, {widgets, ...extra});
  env.configure();
  env.connect();
  return env;
}
const update = (env, ...extra) => {
  env.host._hass = withStates(...extra);
  env.host._screensaverHass();
};
const sceneOf = (env) => env.layer?.ov.innerHTML.replace(/<[^>]*>/g, '') ?? null;
const kindOf = (env) => /data-screensaver="(\w+)"/.exec(env.layer?.html ?? '')?.[1] ?? null;
const dismiss = (env) => {
  fire(env.layer, 'keydown', {key: 'Escape'});
  env.wait(400);
};
const weather = (patch = {}) => ({type: 'demo', entity: 'sensor.a', idle_timeout: 10, ...patch});
const inEdit = {localName: 'hui-card-options', parentElement: null};

// ---------------------------------------------------------------------------------------------------------------
// zero impact

test('no screensaver block and no timer or media_player widget: nothing is allocated, listened to or rendered', (t) => {
  const env = dashboard(t, {
    widgets: [{type: 'light', entity: 'light.a'}],
    hass: withStates(timerState())
  });
  assert.equal(env.host._screensaver, null);
  assert.equal(env.shadowRoot.listeners.length, 0);
  assert.equal(env.documentListeners.length, 0);
  env.second(600);
  assert.equal(env.layer, null);
  assert.equal(env.shell.children.length, 0);
});

test('a timer_display: false dashboard with a timer widget allocates nothing either', (t) => {
  const env = dashboard(t, {
    widgets: [timerWidget()],
    timer_display: false,
    hass: withStates(timerState())
  });
  assert.equal(env.host._screensaver, null);
  assert.equal(env.shadowRoot.listeners.length, 0);
  env.second(30);
  assert.equal(env.layer, null);
});

test('music_screensaver: false with only media players allocates nothing', (t) => {
  const env = dashboard(t, {widgets: [speakerWidget()], music_screensaver: false});
  assert.equal(env.host._screensaver, null);
});

// ---------------------------------------------------------------------------------------------------------------
// the timer: an automatic override, with no screensaver block at all

test('a timer widget alone: the display comes up when the timer runs, and never by idle time', (t) => {
  const env = dashboard(t, {widgets: [timerWidget()], hass: withStates(timerState('idle'))});
  const ss = env.host._screensaver;
  assert.ok(ss, 'armed');
  assert.deepEqual(
    ss.entries.map((e) => [e.type, e.implicit, e.event]),
    [['timer', true, true]]
  );
  env.second(600);
  assert.equal(env.layer, null, 'idle time never starts it');
  assert.equal(env.host._screensaver.idle.active, false);
  update(env, timerState('active'));
  assert.equal(env.state, 'on');
  assert.equal(kindOf(env), 'timer');
});

test('a timer that is already running when the page loads shows at once', (t) => {
  const env = dashboard(t, {widgets: [timerWidget()], hass: withStates(timerState('active'))});
  assert.equal(kindOf(env), 'timer');
});

test('it goes by itself when the timer ends, a tap dismisses it and the dismissal sticks', (t) => {
  const env = dashboard(t, {widgets: [timerWidget()], hass: withStates(timerState('idle'))});
  update(env, timerState('active'));
  assert.equal(kindOf(env), 'timer');
  dismiss(env);
  assert.equal(env.layer, null);
  update(env, timerState('active'));
  env.second(30);
  assert.equal(env.layer, null, 'dismissed while it keeps running');
  update(env, timerState('idle'));
  env.second(2);
  update(env, timerState('active'));
  assert.equal(kindOf(env), 'timer', 'the next timer shows again');
  update(env, timerState('idle'));
  assert.equal(env.state, 'leaving', 'autoWake: the timer is over');
});

test('every timer widget gets its own display', (t) => {
  const env = dashboard(t, {
    widgets: [timerWidget('timer.a'), timerWidget('timer.b')],
    hass: withStates(timerState('idle', 'timer.a'), timerState('idle', 'timer.b'))
  });
  update(env, timerState('idle', 'timer.a'), timerState('active', 'timer.b'));
  assert.equal(kindOf(env), 'timer');
  assert.equal(env.host._screensaver.active.entry.options.entity, 'timer.b');
});

test('the timer replaces whatever screensaver is on screen and control returns afterwards', (t) => {
  const env = dashboard(t, {
    widgets: [timerWidget()],
    screensaver: weather(),
    hass: withStates(timerState('idle'))
  });
  env.second(10);
  assert.equal(sceneOf(env), 'A|screensaver');
  const old = env.layer;
  update(env, timerState('active'));
  assert.equal(old.parentNode, null, 'the idle layer is gone at once');
  assert.equal(kindOf(env), 'timer');
  assert.equal(env.shell.children.length, 1);
  update(env, timerState('idle'));
  assert.equal(env.state, 'leaving');
  env.wait(400);
  assert.equal(env.layer, null);
  env.second(9);
  assert.equal(env.layer, null, 'the idle timer restarted from the end of the timer display');
  env.second(1);
  assert.equal(sceneOf(env), 'A|screensaver', 'and the screensaver is back');
});

test('the timer replaces an on-screen cover art; idle time brings the music back afterwards', (t) => {
  const env = dashboard(t, {
    widgets: [timerWidget(), speakerWidget()],
    hass: withStates(timerState('idle'), speakerState('playing'))
  });
  env.second(120);
  assert.equal(kindOf(env), 'cover_art');
  update(env, timerState('active'), speakerState('playing'));
  assert.equal(kindOf(env), 'timer');
  update(env, timerState('idle'), speakerState('playing'));
  env.wait(400);
  env.second(120);
  assert.equal(kindOf(env), 'cover_art');
});

test('an explicit timer entry for the same entity wins over the implicit one', (t) => {
  const env = dashboard(t, {
    widgets: [timerWidget()],
    screensaver: {type: 'timer', entity: TIMER, start_in_edit_mode: true},
    hass: withStates(timerState('idle'))
  });
  const entries = env.host._screensaver.entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].implicit, false);
  assert.equal(entries[0].startInEditMode, true);
  env.host.parentElement = inEdit;
  update(env, timerState('active'));
  assert.equal(kindOf(env), 'timer', 'the explicit entry settings apply');
});

test('a disabled explicit timer entry switches that timer off, the others stay', (t) => {
  const env = dashboard(t, {
    widgets: [timerWidget('timer.a'), timerWidget('timer.b')],
    screensaver: {type: 'timer', entity: 'timer.a', enabled: false},
    hass: withStates(timerState('idle', 'timer.a'), timerState('idle', 'timer.b'))
  });
  update(env, timerState('active', 'timer.a'), timerState('idle', 'timer.b'));
  assert.equal(env.layer, null);
  update(env, timerState('idle', 'timer.a'), timerState('active', 'timer.b'));
  assert.equal(kindOf(env), 'timer');
});

test('timer_display as a list replaces the widget-derived list', (t) => {
  const env = dashboard(t, {
    widgets: [timerWidget('timer.a')],
    timer_display: ['timer.b'],
    hass: withStates(timerState('idle', 'timer.a'), timerState('idle', 'timer.b'))
  });
  update(env, timerState('active', 'timer.a'), timerState('idle', 'timer.b'));
  assert.equal(env.layer, null, 'the widget timer is not in the list');
  update(env, timerState('idle', 'timer.a'), timerState('active', 'timer.b'));
  assert.equal(kindOf(env), 'timer');
});

test('a dismissed implicit timer display stays dismissed across a config reload', (t) => {
  const env = dashboard(t, {widgets: [timerWidget()], hass: withStates(timerState('idle'))});
  update(env, timerState('active'));
  dismiss(env);
  env.configure();
  env.second(10);
  assert.equal(env.layer, null);
});

// ---------------------------------------------------------------------------------------------------------------
// cover art: an idle entry with priority 10 that only wins while eligible

test('cover art only wins while a speaker plays with a picture; weather stays the default', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget()],
    screensaver: weather(),
    hass: withStates(speakerState('idle'))
  });
  assert.deepEqual(
    env.host._screensaver.entries.map((e) => [e.type, e.implicit]),
    [
      ['demo', false],
      ['cover_art', true]
    ]
  );
  env.second(10);
  assert.equal(kindOf(env), 'demo', 'nothing playing: the screensaver the user chose');
  dismiss(env);
  update(env, speakerState('playing'));
  env.second(10);
  assert.equal(kindOf(env), 'cover_art', 'playing: the cover wins');
  assert.equal(sceneOf(env), 'Living|Song');
});

test('paused, a missing picture and an unavailable speaker are not eligible', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget()],
    screensaver: weather(),
    hass: withStates(speakerState('paused'))
  });
  const attempts = [
    speakerState('paused'),
    speakerState('playing', {entity_picture: undefined}),
    speakerState('unavailable'),
    speakerState('off'),
    speakerState('buffering')
  ];
  for (const speaker of attempts) {
    update(env, speaker);
    env.second(10);
    assert.equal(kindOf(env), 'demo', JSON.stringify(speaker));
    dismiss(env);
  }
  update(env, speakerState('playing'));
  env.second(10);
  assert.equal(kindOf(env), 'cover_art');
});

test('the idle timeout is the first explicit idle entry, never the implicit entry', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget()],
    screensaver: weather({idle_timeout: 300}),
    hass: withStates(speakerState('playing'))
  });
  env.second(299);
  assert.equal(env.layer, null, 'not after the default 120 s');
  env.second(1);
  assert.equal(kindOf(env), 'cover_art', 'at the weather timeout, and the cover wins');
});

test('idle_timeout: 0 on the explicit entry means no idle start at all, cover art included', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget()],
    screensaver: weather({idle_timeout: 0}),
    hass: withStates(speakerState('playing'))
  });
  env.second(3000);
  assert.equal(env.layer, null);
});

test('with no explicit screensaver the default 120 s applies', (t) => {
  const env = dashboard(t, {widgets: [speakerWidget()], hass: withStates(speakerState('playing'))});
  env.second(119);
  assert.equal(env.layer, null);
  env.second(1);
  assert.equal(kindOf(env), 'cover_art');
});

test('nothing eligible and nothing else: nothing shows, the idle timeout starts over', (t) => {
  const env = dashboard(t, {widgets: [speakerWidget()], hass: withStates(speakerState('idle'))});
  env.second(120);
  assert.equal(env.layer, null);
  assert.equal(env.host._screensaver.idle.active, false, 'the idle manager woke again');
  update(env, speakerState('playing'));
  env.second(119);
  assert.equal(env.layer, null, 'a full timeout from the failed attempt, not sooner');
  env.second(1);
  assert.equal(kindOf(env), 'cover_art');
});

test('eligibility is evaluated at activation only, not on every tick', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget()],
    screensaver: weather(),
    hass: withStates(speakerState('playing'))
  });
  const before = counts.eligible;
  env.second(9);
  update(env, speakerState('playing'));
  assert.equal(counts.eligible, before, 'not while waiting');
  env.second(1);
  assert.equal(counts.eligible, before + 1, 'once, when idle activation picks an entry');
});

test('cover art goes when the speaker stops, stays when paused, and follows the track live', (t) => {
  const env = dashboard(t, {widgets: [speakerWidget()], hass: withStates(speakerState('playing'))});
  env.second(120);
  assert.equal(sceneOf(env), 'Living|Song');
  update(env, speakerState('playing', {media_title: 'Next song'}));
  assert.equal(sceneOf(env), 'Living|Next song', 'the text follows the track');
  update(env, speakerState('paused', {media_title: 'Next song'}));
  assert.equal(env.state, 'on', 'paused keeps it');
  update(env, speakerState('idle'));
  assert.equal(env.state, 'leaving');
  assert.equal(env.host._suppressClickUntil, undefined, 'autoWake swallows nothing');
});

test('equal priorities take turns, across activations; lower priorities wait', (t) => {
  const env = dashboard(t, {
    screensaver: [
      {type: 'ten_a', entity: 'sensor.a', idle_timeout: 10},
      {type: 'ten_b', entity: 'sensor.b', idle_timeout: 10},
      {type: 'plain', entity: 'sensor.a', idle_timeout: 10}
    ]
  });
  const seen = [];
  for (let i = 0; i < 4; i++) {
    env.second(10);
    seen.push(kindOf(env));
    dismiss(env);
  }
  assert.deepEqual(seen, ['ten_a', 'ten_b', 'ten_a', 'ten_b']);
});

test('priority 0 entries still rotate when no priority is set (the plain round robin)', (t) => {
  const env = dashboard(t, {
    screensaver: [
      {type: 'plain', entity: 'sensor.a', idle_timeout: 10},
      {type: 'demo', entity: 'sensor.b', idle_timeout: 10}
    ]
  });
  const seen = [];
  for (let i = 0; i < 4; i++) {
    env.second(10);
    seen.push(kindOf(env));
    dismiss(env);
  }
  assert.deepEqual(seen, ['plain', 'demo', 'plain', 'demo']);
});

test('an explicit cover_art entry takes part with the same rules and the implicit one steps aside', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget()],
    screensaver: [weather(), {type: 'cover_art', entity: SPEAKER, idle_timeout: 10}],
    hass: withStates(speakerState('playing'))
  });
  assert.equal(env.host._screensaver.entries.length, 2, 'no implicit duplicate');
  env.second(10);
  assert.equal(kindOf(env), 'cover_art');
});

test('music_screensaver: false removes the implicit cover art', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget()],
    screensaver: weather(),
    music_screensaver: false,
    hass: withStates(speakerState('playing'))
  });
  env.second(10);
  assert.equal(kindOf(env), 'demo');
});

test('music_screensaver as a list replaces the widget-derived list', (t) => {
  const other = 'media_player.kitchen';
  const env = dashboard(t, {
    widgets: [speakerWidget()],
    screensaver: weather(),
    music_screensaver: [other],
    hass: withStates(speakerState('playing'), speakerState('idle', {}, other))
  });
  env.second(10);
  assert.equal(kindOf(env), 'demo', 'the widget speaker plays but is not in the list');
  dismiss(env);
  update(env, speakerState('idle'), speakerState('playing', {}, other));
  env.second(10);
  assert.equal(kindOf(env), 'cover_art');
});

test('with two speakers the one that plays wins', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget('media_player.a'), speakerWidget('media_player.b')],
    hass: withStates(
      speakerState('idle', {}, 'media_player.a'),
      speakerState('playing', {friendly_name: 'B'}, 'media_player.b')
    )
  });
  env.second(120);
  assert.equal(sceneOf(env), 'B|Song');
});

test('an eligible rule that throws counts as not eligible and never breaks the card', (t) => {
  const log = mock.method(console, 'error', () => {});
  t.after(() => log.mock.restore());
  const before = counts.boom;
  const env = dashboard(t, {
    screensaver: [weather(), {type: 'boom', entity: 'sensor.a', idle_timeout: 10}]
  });
  env.second(10);
  assert.equal(counts.boom, before + 1);
  assert.equal(kindOf(env), 'demo', 'the next one in line shows');
  assert.equal(log.mock.callCount(), 1);
});

test('the whole stack: the timer beats cover art, cover art beats weather', (t) => {
  const env = dashboard(t, {
    widgets: [timerWidget(), speakerWidget()],
    screensaver: weather(),
    hass: withStates(timerState('idle'), speakerState('playing'))
  });
  env.second(10);
  assert.equal(kindOf(env), 'cover_art');
  update(env, timerState('active'), speakerState('playing'));
  assert.equal(kindOf(env), 'timer');
  update(env, timerState('idle'), speakerState('idle'));
  env.wait(400);
  env.second(10);
  assert.equal(kindOf(env), 'demo');
});

// ---------------------------------------------------------------------------------------------------------------
// preview, edit mode and manual open next to an implicit entry

test('an explicit preview still shows at connect, although an implicit entry outranks it', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget()],
    screensaver: weather({preview: true}),
    hass: withStates(speakerState('idle'))
  });
  assert.equal(kindOf(env), 'demo');
});

test('a preview entry ignores eligible and autoWake: an idle speaker is still shown, and stays', (t) => {
  const env = dashboard(t, {
    widgets: [],
    screensaver: {type: 'cover_art', entity: SPEAKER, preview: true},
    hass: withStates(speakerState('idle'))
  });
  assert.equal(kindOf(env), 'cover_art', 'not eligible, shown anyway');
  env.second(3);
  update(env, speakerState('off'));
  env.second(2);
  assert.equal(kindOf(env), 'cover_art');
  assert.notEqual(env.state, 'leaving', 'autoWake does not dismiss a preview');
});

test('in edit mode an implicit entry stays away, and an explicit start_in_edit_mode entry still shows', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget()],
    screensaver: weather({start_in_edit_mode: true}),
    hass: withStates(speakerState('playing'))
  });
  env.host.parentElement = inEdit;
  env.second(10);
  assert.equal(
    kindOf(env),
    'demo',
    'cover art does not run while editing, the explicit entry does'
  );
  dismiss(env);
  env.host.parentElement = null;
  env.second(10);
  assert.equal(kindOf(env), 'cover_art');
});

test('edit mode switched on under a cover art layer wakes it, although the explicit entry may run while editing', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget()],
    screensaver: weather({start_in_edit_mode: true}),
    hass: withStates(speakerState('playing'))
  });
  env.second(10);
  assert.equal(kindOf(env), 'cover_art');
  env.host.parentElement = inEdit;
  env.second(1);
  assert.equal(env.state, 'leaving', 'the entry on screen decides, not the lead entry');
});

test('opening an overview card by hand shows that overview, even with cover art playing', (t) => {
  const env = dashboard(t, {
    widgets: [speakerWidget(), {type: 'demo_overview', entity: 'sensor.a'}],
    hass: withStates(speakerState('playing'))
  });
  env.host._screensaverOpen('sensor.a');
  assert.equal(kindOf(env), 'demo');
  assert.equal(sceneOf(env), 'A|screensaver');
});

test('the cover art layer is dismissed by a tap like any layer, and restarts the idle timer', (t) => {
  const env = dashboard(t, {widgets: [speakerWidget()], hass: withStates(speakerState('playing'))});
  env.second(120);
  fire(env.layer, 'pointerup');
  assert.equal(env.state, 'leaving');
  env.wait(400);
  env.second(119);
  assert.equal(env.layer, null);
  env.second(1);
  assert.equal(kindOf(env), 'cover_art');
});
