import {test} from 'node:test';
import assert from 'node:assert/strict';
import {colourModes, kelvinRange} from '../../src/core/light.js';

test('colour controls follow supported HA modes, not an RGB white-point attribute', () => {
  for (const mode of ['hs', 'xy', 'rgb', 'rgbw', 'rgbww']) {
    assert.deepEqual(colourModes({supported_color_modes: [mode, 'color_temp']}), {
      colour: true,
      temperature: true
    });
  }
  for (const mode of ['onoff', 'brightness', 'white']) {
    assert.deepEqual(colourModes({supported_color_modes: [mode], rgb_color: [255, 240, 200]}), {
      colour: false,
      temperature: false
    });
  }
  assert.deepEqual(colourModes({supported_color_modes: ['color_temp']}), {
    colour: false,
    temperature: true
  });
});

test('temperature range respects Kelvin and legacy mired limits', () => {
  assert.deepEqual(
    kelvinRange({min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6000}),
    [2200, 6000]
  );
  assert.deepEqual(kelvinRange({min_mireds: 153, max_mireds: 500}), [2000, 6536]);
});
