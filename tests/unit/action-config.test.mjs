// HA-standard tap/hold/double_tap actions, the confirm seam, and the gesture detector.
import {afterEach, beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createHost} from '../fixtures/card-host.mjs';
import {installWindow} from '../fixtures/node-env.mjs';
import {
  actionConfigFor,
  hasActionConfig,
  needsGestures,
  runActionConfig,
  validateActionConfigs
} from '../../src/core/action-config.js';
import {confirmMode, isThenable, requestConfirmation} from '../../src/core/confirm.js';
import {defineWidget} from '../../src/core/define-widget.js';
import {
  DOUBLE_TAP_MS,
  HOLD_MS,
  MOVE_TOLERANCE_PX,
  createGestureDetector
} from '../../src/core/gesture.js';
import {_resetRegistry, registerWidget} from '../../src/core/registry.js';

let restoreWindow;
let win;
beforeEach(() => {
  _resetRegistry();
  registerWidget(defineWidget({type: 'light', label: 'Light', order: 60, render: () => ''}));
  restoreWindow = installWindow();
  win = globalThis.window;
  win.history = {
    pushed: [],
    replaced: [],
    state: null,
    pushState: (...args) => win.history.pushed.push(args),
    replaceState: (...args) => win.history.replaced.push(args)
  };
  win.opened = [];
  win.open = (...args) => win.opened.push(args);
  win.dispatched = [];
  win.dispatchEvent = (event) => win.dispatched.push(event);
  win.confirmed = [];
  win.confirmAnswer = true;
  win.confirm = (message) => {
    win.confirmed.push(message);
    return win.confirmAnswer;
  };
});
afterEach(() => restoreWindow());

const widget = (extra = {}) => ({type: 'light', entity: 'light.a', ...extra});
const hostFor = (w, config = {}) =>
  createHost({states: {'light.a': {state: 'on'}}, config: {...config, widgets: [w]}});

describe('config helpers', () => {
  it('hasActionConfig and needsGestures', () => {
    assert.equal(hasActionConfig(widget()), false);
    assert.equal(hasActionConfig(widget({tap_action: {action: 'toggle'}})), true);
    assert.equal(hasActionConfig(widget({hold_action: null})), false);
    assert.equal(needsGestures(widget({tap_action: {action: 'toggle'}})), false);
    assert.equal(needsGestures(widget({hold_action: {action: 'none'}})), true);
    assert.equal(needsGestures(widget({double_tap_action: {action: 'none'}})), true);
  });

  it('actionConfigFor: null when absent, defaults per gesture when the action is omitted', () => {
    assert.equal(actionConfigFor(widget(), 'tap_action'), null);
    assert.equal(actionConfigFor(widget({tap_action: {}}), 'tap_action').action, 'more-info');
    assert.equal(actionConfigFor(widget({hold_action: {}}), 'hold_action').action, 'more-info');
    assert.equal(
      actionConfigFor(widget({double_tap_action: {}}), 'double_tap_action').action,
      'none'
    );
    const config = actionConfigFor(
      widget({tap_action: {action: 'toggle', entity: 'light.b'}}),
      'tap_action'
    );
    assert.deepEqual(config, {action: 'toggle', entity: 'light.b'});
  });

  it('validateActionConfigs accepts good configs and rejects bad ones with a sentence', () => {
    const good = [
      {tap_action: {action: 'more-info'}},
      {tap_action: {action: 'toggle'}},
      {tap_action: {action: 'perform-action', perform_action: 'light.turn_on', data: {}}},
      {tap_action: {action: 'call-service', service: 'light.turn_on'}},
      {tap_action: {action: 'navigate', navigation_path: '/lovelace/2'}},
      {tap_action: {action: 'url', url_path: 'https://example.net'}},
      {tap_action: {action: 'url', url_path: '/local/x.html'}},
      {hold_action: {action: 'none'}},
      {tap_action: {}},
      {}
    ];
    for (const extra of good)
      assert.doesNotThrow(() => validateActionConfigs(widget(extra)), JSON.stringify(extra));
    const bad = [
      [{tap_action: 'toggle'}, /Tap action must be an object/],
      [{tap_action: [{}]}, /Tap action must be an object/],
      [
        {hold_action: {action: 'assist'}},
        /Hold action must be one of more-info, toggle, perform-action, navigate, url, none\./
      ],
      [{tap_action: {action: 'perform-action', perform_action: 'nodot'}}, /domain\.service/],
      [{tap_action: {action: 'perform-action', perform_action: 'light.'}}, /domain\.service/],
      [{tap_action: {action: 'perform-action', perform_action: '.x'}}, /domain\.service/],
      [{tap_action: {action: 'navigate'}}, /navigation_path/],
      [{double_tap_action: {action: 'url'}}, /Double tap action needs a url_path/],
      [{tap_action: {action: 'url', url_path: 'javascript:alert(1)'}}, /url_path/],
      [{tap_action: {action: 'url', url_path: 'data:text/html,x'}}, /url_path/]
    ];
    for (const [extra, pattern] of bad) {
      assert.throws(() => validateActionConfigs(widget(extra)), pattern, JSON.stringify(extra));
    }
  });
});

describe('runActionConfig', () => {
  it('returns false and does nothing when the gesture is not configured', async () => {
    const w = widget();
    const card = hostFor(w);
    assert.equal(await runActionConfig(card, w, 'tap_action'), false);
    assert.deepEqual(card.calls, []);
  });

  it('more-info opens the widget entity, or the entity the action names', async () => {
    const w = widget({
      tap_action: {action: 'more-info'},
      hold_action: {action: 'more-info', entity: 'sensor.x'}
    });
    const card = hostFor(w);
    assert.equal(await runActionConfig(card, w, 'tap_action'), true);
    await runActionConfig(card, w, 'hold_action');
    assert.deepEqual(card.infos, ['light.a', 'sensor.x']);
    assert.deepEqual(card.calls, []);
  });

  it('toggle goes through the dispatcher (availability, pending, homeassistant.toggle)', async () => {
    const w = widget({tap_action: {action: 'toggle'}});
    const card = hostFor(w);
    await runActionConfig(card, w, 'tap_action');
    assert.deepEqual(card.calls, [{d: 'homeassistant', s: 'toggle', data: {entity_id: 'light.a'}}]);
    assert.equal(card.refreshes, 2);

    const offline = createHost({
      states: {'light.a': {state: 'unavailable'}},
      config: {widgets: [w]}
    });
    await runActionConfig(offline, w, 'tap_action');
    assert.deepEqual(offline.calls, []);
  });

  it('perform-action calls domain.service with data and target merged, under pending', async () => {
    const w = widget({
      tap_action: {
        action: 'perform-action',
        perform_action: 'light.turn_on',
        data: {brightness_pct: 40},
        target: {entity_id: 'light.hall'}
      }
    });
    const card = hostFor(w);
    card.mock.deferAll();
    const running = runActionConfig(card, w, 'tap_action');
    await Promise.resolve();
    assert.equal(
      card._pending.has('light.a'),
      true,
      'the widget entity is pending during the call'
    );
    assert.deepEqual(card.calls, [
      {d: 'light', s: 'turn_on', data: {brightness_pct: 40, entity_id: 'light.hall'}}
    ]);
    await card.mock.flush();
    await running;
    assert.equal(card._pending.size, 0);
  });

  it('call-service is accepted as the older spelling', async () => {
    const w = widget({
      tap_action: {action: 'call-service', service: 'script.turn_on', data: {entity_id: 'script.a'}}
    });
    const card = hostFor(w);
    await runActionConfig(card, w, 'tap_action');
    assert.deepEqual(card.calls, [{d: 'script', s: 'turn_on', data: {entity_id: 'script.a'}}]);
  });

  it('a failing perform-action shows the feedback message', async () => {
    const w = widget({tap_action: {action: 'perform-action', perform_action: 'light.turn_on'}});
    const card = hostFor(w);
    card.mock.rejectWith('Denied');
    await runActionConfig(card, w, 'tap_action');
    assert.equal(card._message, 'Could not complete action: Denied');
    assert.equal(card._pending.size, 0);
  });

  it('perform-action ignores a press while the entity is pending', async () => {
    const w = widget({tap_action: {action: 'perform-action', perform_action: 'light.turn_on'}});
    const card = createHost({
      states: {'light.a': {state: 'on'}},
      config: {widgets: [w]},
      pending: ['light.a']
    });
    await runActionConfig(card, w, 'tap_action');
    assert.deepEqual(card.calls, []);
  });

  it('navigate pushes (or replaces) history and fires location-changed', async () => {
    const w = widget({
      tap_action: {action: 'navigate', navigation_path: '/lovelace/kitchen'},
      hold_action: {
        action: 'navigate',
        navigation_path: '/lovelace/other',
        navigation_replace: true
      }
    });
    const card = hostFor(w);
    await runActionConfig(card, w, 'tap_action');
    await runActionConfig(card, w, 'hold_action');
    assert.deepEqual(win.history.pushed, [[null, '', '/lovelace/kitchen']]);
    assert.deepEqual(win.history.replaced, [[null, '', '/lovelace/other']]);
    assert.deepEqual(
      win.dispatched.map((e) => [e.type, e.detail.replace, e.bubbles, e.composed]),
      [
        ['location-changed', false, true, true],
        ['location-changed', true, true, true]
      ]
    );
  });

  it('url opens a safe address in a new tab without opener; unsafe ones do nothing', async () => {
    const w = widget({
      tap_action: {action: 'url', url_path: 'https://example.net/a'},
      hold_action: {action: 'url', url_path: 'javascript:alert(1)'},
      double_tap_action: {action: 'url', url_path: '/local/page.html'}
    });
    const card = hostFor(w);
    await runActionConfig(card, w, 'tap_action');
    await runActionConfig(card, w, 'hold_action');
    await runActionConfig(card, w, 'double_tap_action');
    assert.deepEqual(win.opened, [
      ['https://example.net/a', '_blank', 'noopener,noreferrer'],
      ['http://127.0.0.1:8123/local/page.html', '_blank', 'noopener,noreferrer']
    ]);
  });

  it('none does nothing but counts as handled', async () => {
    const w = widget({tap_action: {action: 'none'}});
    const card = hostFor(w);
    assert.equal(await runActionConfig(card, w, 'tap_action'), true);
    assert.deepEqual([card.calls, card.infos, win.opened], [[], [], []]);
  });

  describe('confirmation', () => {
    const confirming = (confirmation) =>
      widget({
        tap_action: {action: 'perform-action', perform_action: 'light.turn_on', confirmation}
      });

    it('true asks the default question; no cancels', async () => {
      const w = confirming(true);
      const card = hostFor(w);
      win.confirmAnswer = false;
      assert.equal(await runActionConfig(card, w, 'tap_action'), true);
      assert.deepEqual(win.confirmed, ['Are you sure?']);
      assert.deepEqual(card.calls, []);
      win.confirmAnswer = true;
      await runActionConfig(card, w, 'tap_action');
      assert.equal(card.calls.length, 1);
    });

    it('custom text', async () => {
      const w = confirming({text: 'Turn on the hall?'});
      await runActionConfig(hostFor(w), w, 'tap_action');
      assert.deepEqual(win.confirmed, ['Turn on the hall?']);
    });

    it('exempt users are not asked', async () => {
      const w = confirming({exemptions: [{user: 'u1'}]});
      const card = hostFor(w);
      card._hass.user = {id: 'u1'};
      await runActionConfig(card, w, 'tap_action');
      assert.deepEqual(win.confirmed, []);
      assert.equal(card.calls.length, 1);
      card._hass.user = {id: 'u2'};
      await runActionConfig(card, w, 'tap_action');
      assert.deepEqual(win.confirmed, ['Are you sure?']);
    });

    it('no confirmation key means no question', async () => {
      const w = widget({tap_action: {action: 'perform-action', perform_action: 'light.turn_on'}});
      await runActionConfig(hostFor(w), w, 'tap_action');
      assert.deepEqual(win.confirmed, []);
    });
  });
});

describe('confirm seam', () => {
  it('native uses window.confirm looked up at call time', () => {
    const card = hostFor(widget());
    assert.equal(confirmMode(card), 'native');
    assert.equal(requestConfirmation(card, 'Sure?'), true);
    win.confirm = () => undefined;
    assert.equal(requestConfirmation(card, 'Sure?'), false);
    assert.deepEqual(win.confirmed, ['Sure?']);
  });

  it('inline without a shadow root falls back to native', () => {
    const card = hostFor(widget(), {confirm_mode: 'inline'});
    assert.equal(confirmMode(card), 'inline');
    assert.equal(requestConfirmation(card, 'Sure?'), true);
  });

  it('isThenable', () => {
    assert.equal(isThenable(Promise.resolve()), true);
    assert.equal(isThenable({then() {}}), true);
    assert.equal(isThenable(true), false);
    assert.equal(isThenable(null), false);
  });
});

describe('gesture detector', () => {
  /** Manual timers and clock. */
  function harness(options) {
    const timers = new Map();
    let id = 0;
    let time = 0;
    const events = [];
    const detector = createGestureDetector({
      onTap: () => events.push('tap'),
      onHold: () => events.push('hold'),
      onDoubleTap: () => events.push('double'),
      suppressClick: (until) => events.push(`suppress:${until - time}`),
      now: () => time,
      setTimer: (fn, ms) => {
        timers.set(++id, {fn, at: time + ms});
        return id;
      },
      clearTimer: (h) => timers.delete(h),
      ...options
    });
    const advance = (ms) => {
      const end = time + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        time = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      time = end;
    };
    return {detector, events, advance, timers};
  }
  const press = (x = 5, y = 5) => ({clientX: x, clientY: y, pointerType: 'touch'});

  it('only tap_action configured: a tap fires at once and suppresses the click', () => {
    const {detector, events} = harness({});
    detector.down(press());
    detector.up(press());
    assert.deepEqual(events, ['suppress:400', 'tap']);
  });

  it('hold fires after 500 ms and the release is not a tap', () => {
    const {detector, events, advance} = harness({hold: true});
    detector.down(press());
    advance(HOLD_MS - 1);
    assert.deepEqual(events, []);
    advance(1);
    assert.deepEqual(events, ['suppress:400', 'hold']);
    detector.up(press());
    assert.deepEqual(events, ['suppress:400', 'hold']);
  });

  it('a release before the hold time cancels the hold timer', () => {
    const {detector, events, advance, timers} = harness({hold: true});
    detector.down(press());
    advance(100);
    detector.up(press());
    assert.equal(timers.size, 0);
    advance(HOLD_MS * 2);
    assert.deepEqual(events, ['suppress:400', 'tap']);
  });

  it('moving more than 10 px cancels everything (a swipe or scroll is not a gesture)', () => {
    const {detector, events, advance} = harness({hold: true});
    detector.down(press(0, 0));
    detector.move(press(MOVE_TOLERANCE_PX, 0));
    advance(HOLD_MS + 10);
    assert.deepEqual(events, ['suppress:400', 'hold'], 'exactly 10 px is still a press');

    const second = harness({hold: true});
    second.detector.down(press(0, 0));
    second.detector.move(press(7, 8)); // 10.6 px
    second.advance(HOLD_MS + 10);
    second.detector.up(press(7, 8));
    assert.deepEqual(second.events, []);
  });

  it('double tap: two taps inside the window fire onDoubleTap only', () => {
    const {detector, events, advance} = harness({doubleTap: true});
    detector.down(press());
    detector.up(press());
    advance(100);
    detector.down(press());
    detector.up(press());
    advance(DOUBLE_TAP_MS * 2);
    assert.deepEqual(events, ['suppress:400', 'suppress:400', 'double']);
  });

  it('double tap configured: a single tap waits for the window, then fires onTap', () => {
    const {detector, events, advance} = harness({doubleTap: true});
    detector.down(press());
    detector.up(press());
    advance(DOUBLE_TAP_MS - 1);
    assert.ok(!events.includes('tap'));
    advance(1);
    assert.deepEqual(events, ['suppress:400', 'tap']);
  });

  it('two taps further apart than the window are two single taps', () => {
    const {detector, events, advance} = harness({doubleTap: true});
    detector.down(press());
    detector.up(press());
    advance(DOUBLE_TAP_MS + 50);
    detector.down(press());
    detector.up(press());
    advance(DOUBLE_TAP_MS + 50);
    assert.deepEqual(
      events.filter((e) => !e.startsWith('suppress')),
      ['tap', 'tap']
    );
  });

  it('a hold that follows a tap: the tap fires when its window ends, then the hold', () => {
    const {detector, events, advance} = harness({hold: true, doubleTap: true});
    detector.down(press());
    detector.up(press());
    advance(50);
    detector.down(press());
    advance(HOLD_MS + 10);
    detector.up(press());
    advance(DOUBLE_TAP_MS * 2);
    assert.deepEqual(
      events.filter((e) => !e.startsWith('suppress')),
      ['tap', 'hold']
    );
  });

  it('ignores non-primary mouse buttons, up without down, and cancel', () => {
    const {detector, events, advance} = harness({hold: true});
    detector.down({clientX: 0, clientY: 0, pointerType: 'mouse', button: 2});
    detector.up(press());
    advance(HOLD_MS + 10);
    assert.deepEqual(events, []);
    detector.down(press());
    detector.cancel();
    advance(HOLD_MS + 10);
    detector.up(press());
    assert.deepEqual(events, []);
  });

  it('dispose forgets a pending tap', () => {
    const {detector, events, advance} = harness({doubleTap: true});
    detector.down(press());
    detector.up(press());
    detector.dispose();
    advance(DOUBLE_TAP_MS * 2);
    assert.deepEqual(events, ['suppress:400']);
  });

  it('works with the real timers and clock when none are injected', () => {
    const detector = createGestureDetector({onTap: () => {}});
    assert.doesNotThrow(() => {
      detector.down(press());
      detector.up(press());
      detector.dispose();
    });
  });
});
