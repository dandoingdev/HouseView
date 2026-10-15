// Dispatcher: the action pipeline order, per action, across state x supported_features x pending x confirm result.
// The widgets below are small stand-ins that follow docs/widget-api.md for the actions they own.
import {afterEach, beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createHost} from '../fixtures/card-host.mjs';
import {installWindow} from '../fixtures/node-env.mjs';
import {defineWidget} from '../../src/core/define-widget.js';
import {dispatchAction} from '../../src/core/dispatch.js';
import {_resetRegistry, registerWidget} from '../../src/core/registry.js';

const render = () => '<div></div>';
const def = (type, order, extra = {}) => defineWidget({type, label: type, order, render, ...extra});

// ---- stand-in widgets --------------------------------------------------------------------------------------------

const COVER = {
  'cover-open': [1, 'open_cover'],
  'cover-close': [2, 'close_cover'],
  'cover-stop': [8, 'stop_cover']
};
const cover = def('cover', 90, {
  availability: 'allow-unknown',
  actions: Object.fromEntries(
    Object.entries(COVER).map(([name, [bit, service]]) => [
      name,
      {
        availability: 'allow-unknown',
        guard: (ctx, id) => id.startsWith('cover.') && !!(ctx.attrsOf(id).supported_features & bit),
        run: (ctx, id) => ctx.call('cover', service, {entity_id: id})
      }
    ])
  )
});

const lock = def('lock', 100, {
  actions: {
    lock: {
      guard: (ctx, id) => (['locked', 'unlocked'].includes(ctx.stateOf(id).state) ? true : 'info'),
      confirm: (ctx, id) =>
        ctx.stateOf(id).state === 'locked' ? `Unlock ${ctx.widget?.name || 'this door'}?` : null,
      run: (ctx, id) =>
        ctx.call('lock', ctx.stateOf(id).state === 'locked' ? 'unlock' : 'lock', {entity_id: id})
    }
  }
});

const media = def('media_player', 130, {
  actions: {
    media: {
      guard: (ctx, id) => (['playing', 'paused'].includes(ctx.stateOf(id).state) ? true : 'info'),
      run: (ctx, id) => ctx.call('media_player', 'media_play_pause', {entity_id: id})
    },
    'volume-up': {
      run: (ctx, id) =>
        ctx.call('media_player', 'volume_set', {
          entity_id: id,
          volume_level: Math.max(0, Math.min(1, (ctx.attrsOf(id).volume_level || 0) + 0.05))
        })
    }
  }
});

const timer = def('timer', 150, {
  actions: {
    'timer-start-*': {
      confirm: (ctx, id) =>
        ctx.stateOf(id).state !== 'idle' ? 'Replace the running kitchen timer?' : null,
      run: (ctx, id) =>
        ctx.call('timer', 'start', {entity_id: id, duration: Number(ctx.param) * 60})
    },
    'timer-pause': {run: (ctx, id) => ctx.call('timer', 'pause', {entity_id: id})}
  },
  extension: {actions: {'dismiss-alarm': {immediate: true, run: (ctx) => ctx.render()}}}
});

const climate = def('climate', 50, {
  actions: {
    up: {run: (ctx, id) => step(ctx, id, +1)},
    down: {run: (ctx, id) => step(ctx, id, -1)}
  }
});
function step(ctx, id, direction) {
  const a = ctx.attrsOf(id);
  if (
    !ctx.num(a.temperature) ||
    ctx.stateOf(id).state === 'heat_cool' ||
    !(a.supported_features & 1)
  ) {
    return ctx.info(id);
  }
  const size =
    ctx.num(a.target_temp_step) && a.target_temp_step > 0
      ? a.target_temp_step
      : ctx.unit() === '°F'
        ? 1
        : 0.5;
  const target = Math.min(
    ctx.num(a.max_temp) ? a.max_temp : Infinity,
    Math.max(ctx.num(a.min_temp) ? a.min_temp : -Infinity, a.temperature + direction * size)
  );
  return ctx.call('climate', 'set_temperature', {
    entity_id: id,
    temperature: Math.round(target * 100) / 100
  });
}

const action = def('action', 10, {
  entity: 'custom',
  aliases: ['scene'],
  unknownOkDomains: ['scene', 'button', 'input_button'],
  actions: {
    'run-action': {
      guard: (ctx, id) => {
        const domain = id.split('.')[0];
        return (
          !!ctx.widget &&
          ['scene', 'script', 'button', 'input_button'].includes(domain) &&
          !(domain === 'script' && ctx.stateOf(id).state !== 'off')
        );
      },
      run: (ctx, id) => {
        const domain = id.split('.')[0];
        return ctx.call(domain, ['button', 'input_button'].includes(domain) ? 'press' : 'turn_on', {
          entity_id: id
        });
      }
    }
  }
});

const light = def('light', 60, {
  actions: {
    light: {run: (ctx, id) => ctx.call('light', 'toggle', {entity_id: id})},
    'light-off': {run: (ctx, id) => ctx.call('light', 'turn_off', {entity_id: id})}
  }
});

// ---- helpers -----------------------------------------------------------------------------------------------------

let restoreWindow;
let confirmAnswer;
let confirmed;

beforeEach(() => {
  _resetRegistry();
  for (const widget of [action, light, climate, cover, lock, media, timer]) registerWidget(widget);
  restoreWindow = installWindow();
  confirmed = [];
  confirmAnswer = true;
  globalThis.window.confirm = (message) => {
    confirmed.push(message);
    return confirmAnswer;
  };
});
afterEach(() => restoreWindow());

const host = (states, config = {widgets: []}, options = {}) =>
  createHost({states, config, ...options});
const call = (card, name, id) => dispatchAction(card, name, id);

// ---- tests -------------------------------------------------------------------------------------------------------

describe('step 1: immediate actions skip every gate', () => {
  it('runs although the entity is missing, unavailable or pending', async () => {
    const card = host({}, {widgets: []}, {pending: ['timer.a']});
    let rendered = 0;
    card._render = () => rendered++;
    await call(card, 'dismiss-alarm', 'timer.a');
    await call(card, 'dismiss-alarm', undefined);
    assert.equal(rendered, 2);
    assert.equal(card.refreshes, 0, 'no pending/refresh bookkeeping');
    assert.deepEqual([...card._pending], ['timer.a']);
  });

  it('page features call _setPage and dim toggles', async () => {
    const card = host({});
    const pages = [];
    card._setPage = (n) => pages.push(n);
    card._pageIndex = 2;
    await call(card, 'page-next');
    await call(card, 'page-prev');
    assert.deepEqual(pages, [3, 1]);
    card._toggleDim = () => pages.push('dim');
    await call(card, 'dim');
    assert.equal(pages.at(-1), 'dim');
  });

  it('dim without a controller method flips _dim and the shell class', async () => {
    const card = host({});
    const classes = new Set();
    const attrs = {};
    const button = {
      setAttribute: (k, v) => (attrs[k] = v),
      set innerHTML(v) {
        attrs.html = v;
      }
    };
    card.shadowRoot = {
      querySelector: (selector) =>
        selector === '.shell'
          ? {classList: {toggle: (c, on) => (on ? classes.add(c) : classes.delete(c))}}
          : button
    };
    await call(card, 'dim');
    assert.equal(card._dim, true);
    assert.ok(classes.has('screen-dim'));
    assert.equal(attrs['aria-label'], 'Restore brightness');
    assert.match(attrs.html, /mdi:brightness-6.*<span>Brighter<\/span>/);
    await call(card, 'dim');
    assert.equal(card._dim, false);
    assert.equal(attrs['aria-label'], 'Dim screen');
    assert.match(attrs.html, /mdi:weather-night.*<span>Dim<\/span>/);
  });
});

describe('step 2: info on an unknown entity', () => {
  it('opens more-info without touching pending', async () => {
    const card = host({'sensor.a': {state: 'unknown'}});
    await call(card, 'info', 'sensor.a');
    assert.deepEqual(card.infos, ['sensor.a']);
    assert.equal(card.refreshes, 0);
  });

  it('only the info action does this', async () => {
    const card = host({'light.a': {state: 'unknown'}});
    await call(card, 'light', 'light.a');
    assert.deepEqual(card.infos, []);
    assert.deepEqual(card.calls, []);
  });
});

describe('step 3: pending and availability', () => {
  it('info on an available entity opens more-info, on an unavailable or missing one does nothing', async () => {
    const card = host({'sensor.a': {state: '21'}, 'sensor.b': {state: 'unavailable'}});
    await call(card, 'info', 'sensor.a');
    await call(card, 'info', 'sensor.b');
    await call(card, 'info', 'sensor.missing');
    await call(card, 'info', undefined);
    assert.deepEqual(card.infos, ['sensor.a']);
    assert.equal(card.refreshes, 0);
  });

  it('a call in flight for the same entity blocks a second press, not the neighbour', async () => {
    const card = host({'light.a': {state: 'on'}, 'light.b': {state: 'on'}}, undefined, {
      hass: {}
    });
    card.mock.deferAll();
    const first = call(card, 'light', 'light.a');
    await call(card, 'light', 'light.a');
    const neighbour = call(card, 'light', 'light.b');
    assert.equal(card.calls.length, 2, 'second press on light.a ignored, light.b went through');
    assert.deepEqual(
      card.calls.map((c) => c.data.entity_id),
      ['light.a', 'light.b']
    );
    await card.mock.flush();
    await Promise.all([first, neighbour]);
    assert.equal(card._pending.size, 0);
  });

  it('unavailable, unknown (for most domains) and missing entities are ignored', async () => {
    const card = host({
      'light.a': {state: 'unavailable'},
      'light.b': {state: 'unknown'}
    });
    for (const id of ['light.a', 'light.b', 'light.missing']) await call(card, 'light', id);
    assert.deepEqual(card.calls, []);
    assert.equal(card.refreshes, 0);
  });

  it('an unknown action name on an unavailable entity is ignored too', async () => {
    const card = host({'light.a': {state: 'unavailable'}});
    card._message = 'old';
    await call(card, 'bogus', 'light.a');
    assert.equal(card._message, 'old');
    assert.equal(card.refreshes, 0);
  });

  it('scene/button entities are usable in state unknown (unknownOkDomains)', async () => {
    const card = host(
      {'scene.a': {state: 'unknown'}, 'script.a': {state: 'unknown'}},
      {
        widgets: [
          {type: 'action', entity: 'scene.a'},
          {type: 'action', entity: 'script.a'}
        ]
      }
    );
    await call(card, 'run-action', 'scene.a');
    await call(card, 'run-action', 'script.a');
    assert.deepEqual(card.calls, [{d: 'scene', s: 'turn_on', data: {entity_id: 'scene.a'}}]);
  });
});

describe('cover keys (availability: allow-unknown + guard)', () => {
  const states = (state, supported = 15, id = 'cover.a') => ({
    [id]: {state, attributes: {supported_features: supported}}
  });

  it('call the right service per key', async () => {
    const card = host(states('open'));
    await call(card, 'cover-open', 'cover.a');
    await call(card, 'cover-stop', 'cover.a');
    await call(card, 'cover-close', 'cover.a');
    assert.deepEqual(
      card.calls.map((c) => c.s),
      ['open_cover', 'stop_cover', 'close_cover']
    );
    assert.deepEqual(card.calls[0].data, {entity_id: 'cover.a'});
  });

  it('state unknown stays controllable; unavailable does not', async () => {
    const card = host(states('unknown'));
    await call(card, 'cover-open', 'cover.a');
    assert.equal(card.calls.length, 1);
    const off = host(states('unavailable'));
    await call(off, 'cover-open', 'cover.a');
    assert.equal(off.calls.length, 0);
  });

  it('an unsupported key or a non-cover entity is ignored silently', async () => {
    const card = host({...states('open', 1), ...states('unknown', 15, 'light.x')});
    await call(card, 'cover-close', 'cover.a');
    await call(card, 'cover-open', 'light.x');
    assert.deepEqual(card.calls, []);
    assert.equal(card.refreshes, 0, 'a refused guard sets no pending');
  });
});

describe('step 4: guard verdicts', () => {
  const guarded = (verdict) =>
    def('guarded', 5, {
      actions: {
        'guarded-go': {guard: () => verdict, run: (ctx, id) => ctx.call('x', 'y', {entity_id: id})}
      }
    });

  for (const [verdict, label] of [
    [false, 'false'],
    [undefined, 'undefined (a guard that forgot to return)'],
    [null, 'null'],
    [0, '0']
  ]) {
    it(`${label} ignores the press`, async () => {
      registerWidget(guarded(verdict));
      const card = host({'guarded.a': {state: 'on'}});
      await call(card, 'guarded-go', 'guarded.a');
      assert.deepEqual(card.calls, []);
      assert.deepEqual(card.infos, []);
      assert.equal(card.refreshes, 0);
    });
  }

  it('"info" opens more-info instead and sets no pending', async () => {
    registerWidget(guarded('info'));
    const card = host({'guarded.a': {state: 'on'}});
    await call(card, 'guarded-go', 'guarded.a');
    assert.deepEqual(card.infos, ['guarded.a']);
    assert.deepEqual(card.calls, []);
    assert.equal(card.refreshes, 0);
  });

  it('true proceeds', async () => {
    registerWidget(guarded(true));
    const card = host({'guarded.a': {state: 'on'}});
    await call(card, 'guarded-go', 'guarded.a');
    assert.equal(card.calls.length, 1);
  });
});

describe('lock: guard, then confirm, then run', () => {
  it('locked asks "Unlock this door?" and unlocks on yes', async () => {
    const card = host({'lock.a': {state: 'locked'}});
    await call(card, 'lock', 'lock.a');
    assert.deepEqual(confirmed, ['Unlock this door?']);
    assert.deepEqual(card.calls, [{d: 'lock', s: 'unlock', data: {entity_id: 'lock.a'}}]);
  });

  it("uses the widget's name in the question", async () => {
    const card = host(
      {'lock.a': {state: 'locked'}},
      {widgets: [{type: 'lock', entity: 'lock.a', name: 'Front door'}]}
    );
    await call(card, 'lock', 'lock.a');
    assert.deepEqual(confirmed, ['Unlock Front door?']);
  });

  it('no on the question: nothing is called and nothing is pending', async () => {
    confirmAnswer = false;
    const card = host({'lock.a': {state: 'locked'}});
    await call(card, 'lock', 'lock.a');
    assert.deepEqual(card.calls, []);
    assert.equal(card.refreshes, 0);
    assert.equal(card._pending.size, 0);
  });

  it('a stub that returns undefined counts as no', async () => {
    globalThis.window.confirm = () => undefined;
    const card = host({'lock.a': {state: 'locked'}});
    await call(card, 'lock', 'lock.a');
    assert.deepEqual(card.calls, []);
  });

  it('unlocked locks without asking', async () => {
    const card = host({'lock.a': {state: 'unlocked'}});
    await call(card, 'lock', 'lock.a');
    assert.deepEqual(confirmed, []);
    assert.equal(card.calls[0].s, 'lock');
  });

  it('jammed (neither) opens more-info before any question', async () => {
    const card = host({'lock.a': {state: 'jammed'}});
    await call(card, 'lock', 'lock.a');
    assert.deepEqual(confirmed, []);
    assert.deepEqual(card.infos, ['lock.a']);
    assert.deepEqual(card.calls, []);
  });
});

describe('media and timer', () => {
  it('media toggles play/pause only while playing or paused, else opens more-info', async () => {
    const card = host({'media_player.a': {state: 'playing'}, 'media_player.b': {state: 'idle'}});
    await call(card, 'media', 'media_player.a');
    await call(card, 'media', 'media_player.b');
    assert.deepEqual(card.calls, [
      {d: 'media_player', s: 'media_play_pause', data: {entity_id: 'media_player.a'}}
    ]);
    assert.deepEqual(card.infos, ['media_player.b']);
  });

  it('volume clamps to 0..1 in steps of .05', async () => {
    const card = host({'media_player.a': {state: 'playing', attributes: {volume_level: 0.98}}});
    await call(card, 'volume-up', 'media_player.a');
    assert.equal(card.calls[0].data.volume_level, 1);
  });

  it('timer-start-N: the param is the minutes; an idle timer starts without asking', async () => {
    const card = host({'timer.a': {state: 'idle'}});
    await call(card, 'timer-start-15', 'timer.a');
    assert.deepEqual(confirmed, []);
    assert.deepEqual(card.calls, [
      {d: 'timer', s: 'start', data: {entity_id: 'timer.a', duration: 900}}
    ]);
  });

  it('a running timer asks "Replace the running kitchen timer?"; no leaves it alone', async () => {
    confirmAnswer = false;
    const card = host({'timer.a': {state: 'active'}});
    await call(card, 'timer-start-5', 'timer.a');
    assert.deepEqual(confirmed, ['Replace the running kitchen timer?']);
    assert.deepEqual(card.calls, []);
    confirmAnswer = true;
    await call(card, 'timer-start-5', 'timer.a');
    assert.equal(card.calls[0].data.duration, 300);
  });
});

describe('climate up/down: the decision is made inside run (pending is set and released)', () => {
  const climateState = (attributes, state = 'heat') => ({
    'climate.a': {state, attributes: {supported_features: 1, temperature: 20, ...attributes}}
  });

  it('steps by 0.5 (°C), 1 (°F) or target_temp_step, clamped and rounded', async () => {
    let card = host(climateState({}));
    await call(card, 'up', 'climate.a');
    assert.equal(card.calls[0].data.temperature, 20.5);

    card = host(climateState({}), undefined, {hass: {config: {unit_system: {temperature: '°F'}}}});
    await call(card, 'down', 'climate.a');
    assert.equal(card.calls[0].data.temperature, 19);

    card = host(climateState({target_temp_step: 0.1, temperature: 20.05}));
    await call(card, 'up', 'climate.a');
    assert.equal(card.calls[0].data.temperature, 20.15);

    card = host(climateState({max_temp: 20.2}));
    await call(card, 'up', 'climate.a');
    assert.equal(card.calls[0].data.temperature, 20.2);

    card = host(climateState({min_temp: 19.8}));
    await call(card, 'down', 'climate.a');
    assert.equal(card.calls[0].data.temperature, 19.8);
  });

  it('heat_cool, a missing target or no target feature redirect to more-info', async () => {
    for (const [attributes, state] of [
      [{}, 'heat_cool'],
      [{temperature: undefined}, 'heat'],
      [{supported_features: 0}, 'heat']
    ]) {
      const card = host(climateState(attributes, state));
      await call(card, 'up', 'climate.a');
      assert.deepEqual(card.infos, ['climate.a']);
      assert.deepEqual(card.calls, []);
      assert.equal(card.refreshes, 2, 'pending was set and released around the redirect');
      assert.equal(card._pending.size, 0);
    }
  });
});

describe('run-action: guard needs a configured action widget', () => {
  const widgets = [
    {type: 'action', entity: 'button.a'},
    {type: 'action', entity: 'script.idle'},
    {type: 'action', entity: 'script.busy'},
    {type: 'action', entity: 'input_button.a'}
  ];
  const states = {
    'button.a': {state: 'unknown'},
    'script.idle': {state: 'off'},
    'script.busy': {state: 'on'},
    'input_button.a': {state: 'unknown'},
    'scene.free': {state: 'scening'}
  };

  it('picks press or turn_on by domain', async () => {
    const card = host(states, {widgets});
    for (const id of ['button.a', 'script.idle', 'input_button.a'])
      await call(card, 'run-action', id);
    assert.deepEqual(
      card.calls.map((c) => `${c.d}.${c.s}`),
      ['button.press', 'script.turn_on', 'input_button.press']
    );
  });

  it('ignores a running script and an entity that has no action widget', async () => {
    const card = host(states, {widgets});
    await call(card, 'run-action', 'script.busy');
    await call(card, 'run-action', 'scene.free');
    assert.deepEqual(card.calls, []);
  });

  it('ignores the call when the card has no widgets list (no widgets)', async () => {
    const card = host(states, {climate: {}});
    await call(card, 'run-action', 'button.a');
    assert.deepEqual(card.calls, []);
  });
});

describe('core actions', () => {
  it('toggle calls homeassistant.toggle', async () => {
    const card = host({'switch.a': {state: 'on'}});
    await call(card, 'toggle', 'switch.a');
    assert.deepEqual(card.calls, [
      {d: 'homeassistant', s: 'toggle', data: {entity_id: 'switch.a'}}
    ]);
  });
});

describe('steps 6 to 9: pending, run, failure, finally', () => {
  it('sets pending and the call synchronously, before the first await', () => {
    const card = host({'light.a': {state: 'on'}});
    card.mock.deferAll();
    const promise = call(card, 'light', 'light.a');
    assert.equal(card._pending.has('light.a'), true);
    assert.equal(card.calls.length, 1);
    assert.equal(card.refreshes, 1);
    return card.mock.flush().then(() => promise);
  });

  it('clears the old feedback message and refreshes twice', async () => {
    const card = host({'light.a': {state: 'on'}});
    card._message = 'Could not complete action: old';
    await call(card, 'light', 'light.a');
    assert.equal(card._message, '');
    assert.equal(card.refreshes, 2);
    assert.equal(card._pending.size, 0);
  });

  it('a failing service shows "Could not complete action: <reason>" and releases pending', async () => {
    const card = host({'light.a': {state: 'on'}});
    card.mock.rejectWith('Permission denied');
    await call(card, 'light', 'light.a');
    assert.equal(card._message, 'Could not complete action: Permission denied');
    assert.equal(card._pending.size, 0);
    assert.equal(card.refreshes, 2);
  });

  it('an error without a message says "please try again"', async () => {
    const card = host({'light.a': {state: 'on'}});
    card.mock.rejectWith(new Error(''));
    await call(card, 'light', 'light.a');
    assert.equal(card._message, 'Could not complete action: please try again');
  });

  it('a rejection with a non-Error value does not break the catch', async () => {
    const card = host({'light.a': {state: 'on'}});
    card._hass.callService = () => Promise.reject(null);
    await call(card, 'light', 'light.a');
    assert.equal(card._message, 'Could not complete action: please try again');
  });

  it('an unknown action name still clears the message and refreshes, with no call', async () => {
    const card = host({'light.a': {state: 'on'}});
    card._message = 'stale';
    await call(card, 'does-not-exist', 'light.a');
    assert.equal(card._message, '');
    assert.equal(card.refreshes, 2);
    assert.deepEqual(card.calls, []);
    assert.equal(card._pending.size, 0);
  });
});

describe('confirm seam', () => {
  it('a thenable answer (confirm_mode inline) is awaited; nothing is pending while the sheet is open', async () => {
    const card = host({'lock.a': {state: 'locked'}}, {widgets: [], confirm_mode: 'inline'});
    const asked = [];
    const root = fakeShadowRoot((sheet) => asked.push(sheet));
    card.shadowRoot = root;
    const promise = call(card, 'lock', 'lock.a');
    assert.equal(asked.length, 1);
    assert.equal(card._pending.size, 0, 'not pending while the question is open');
    assert.equal(card.calls.length, 0);
    await asked[0].click('yes');
    await promise;
    assert.deepEqual(card.calls, [{d: 'lock', s: 'unlock', data: {entity_id: 'lock.a'}}]);
  });

  it('the inline sheet answering no cancels', async () => {
    const card = host({'lock.a': {state: 'locked'}}, {widgets: [], confirm_mode: 'inline'});
    const asked = [];
    card.shadowRoot = fakeShadowRoot((sheet) => asked.push(sheet));
    const promise = call(card, 'lock', 'lock.a');
    asked[0].click('no');
    await promise;
    assert.deepEqual(card.calls, []);
    assert.equal(asked[0].removed, true);
  });

  it('a second press that started a call while the sheet was open wins', async () => {
    const card = host({'lock.a': {state: 'locked'}}, {widgets: [], confirm_mode: 'inline'});
    const asked = [];
    card.shadowRoot = fakeShadowRoot((sheet) => asked.push(sheet));
    const promise = call(card, 'lock', 'lock.a');
    card._pending.add('lock.a');
    asked[0].click('yes');
    await promise;
    assert.deepEqual(card.calls, []);
  });
});

describe('extension actions', () => {
  it('run with the extension context (ext state, render)', async () => {
    const card = host({}, {widgets: []});
    let rendered = 0;
    card._render = () => rendered++;
    await call(card, 'dismiss-alarm');
    assert.equal(rendered, 1);
  });
});

/**
 * Just enough DOM for the inline confirm sheet: a root with a .shell host, element creation, and a way to click
 * the sheet's buttons.
 */
function fakeShadowRoot(onSheet) {
  const element = (tag) => {
    const listeners = {};
    const el = {
      tag,
      style: {},
      dataset: {},
      children: [],
      removed: false,
      attrs: {},
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      append(...nodes) {
        this.children.push(...nodes);
      },
      remove() {
        this.removed = true;
      },
      focus() {},
      addEventListener(type, fn) {
        (listeners[type] ||= []).push(fn);
      },
      click(choice) {
        const target = {closest: () => ({dataset: {confirm: choice}})};
        for (const fn of listeners.click || []) fn({target, stopPropagation() {}});
        return Promise.resolve();
      }
    };
    return el;
  };
  const shell = element('shell');
  shell.append = function (sheet) {
    onSheet(sheet);
  };
  const doc = {createElement: element};
  return {ownerDocument: doc, activeElement: null, querySelector: () => shell};
}
