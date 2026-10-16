import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {brightnessOf, canDim, colorOf} from '../../src/core/light.js';
import {bindValueActions} from '../../src/controller/value-actions.js';

describe('light brightness model', () => {
  it('maps Home Assistant brightness and ignores retained brightness while off', () => {
    assert.equal(brightnessOf({state: 'on', attributes: {brightness: 82}}), 32);
    assert.equal(brightnessOf({state: 'off', attributes: {brightness: 255}}), 0);
    assert.equal(brightnessOf({state: 'on', attributes: {brightness: 400}}), 100);
    assert.equal(brightnessOf({state: 'on', attributes: {brightness: -50}}), 0);
    assert.equal(brightnessOf({state: 'on', attributes: {brightness: NaN}}), 100);
  });
  it('honours modern colour modes before legacy feature and brightness attributes', () => {
    assert.equal(canDim({supported_color_modes: ['onoff'], brightness: 255}), false);
    assert.equal(canDim({supported_color_modes: ['color_temp']}), true);
    assert.equal(canDim({supported_features: 1}), true);
    assert.equal(canDim({brightness: 0}), true);
    assert.equal(canDim({}), false);
  });
  it('keeps the yellow fill when a dimming update reports white or colour-temperature RGB', () => {
    assert.equal(colorOf({rgb_color: [255, 255, 255]}), '#f2c200');
    assert.equal(colorOf({color_mode: 'rgb', rgb_color: [255, 250, 240]}), '#f2c200');
    assert.equal(colorOf({color_mode: 'color_temp', rgb_color: [255, 180, 90]}), '#f2c200');
    assert.equal(colorOf({color_mode: 'white', rgb_color: [255, 255, 255]}), '#f2c200');
    assert.equal(colorOf({color_mode: 'rgb', rgb_color: [255, 140, 60]}), 'rgb(255,140,60)');
  });
  it('uses a safe RGB colour or the existing app yellow', () => {
    assert.equal(colorOf({rgb_color: [255, 140, 60]}), 'rgb(255,140,60)');
    assert.equal(colorOf({rgb_color: [-10, 500, 10.8]}), 'rgb(0,255,11)');
    assert.equal(colorOf({rgb_color: ['red', 1, 1]}), '#f2c200');
  });
});

it('value changes serialize service writes and coalesce intermediate values', async () => {
  let change;
  const calls = [];
  const releases = [];
  const card = {
    _act: (action, id) => {
      calls.push({action, id});
      return new Promise((resolve) => releases.push(resolve));
    }
  };
  bindValueActions(card, {
    addEventListener: (_, fn) => {
      change = fn;
    }
  });
  const input = {
    dataset: {entity: 'light.test', valueAction: 'light-brightness-'},
    isConnected: true,
    disabled: false
  };
  const send = (value) => {
    input.value = value;
    change({target: {closest: () => input}});
  };
  send('20');
  send('50');
  send('80');
  assert.deepEqual(calls, [{action: 'light-brightness-20', id: 'light.test'}]);
  releases.shift()();
  await Promise.resolve();
  assert.deepEqual(
    calls.map((c) => c.action),
    ['light-brightness-20', 'light-brightness-80']
  );
  releases.shift()();
  await Promise.resolve();
  input.disabled = true;
  send('10');
  assert.equal(calls.length, 2);
});
