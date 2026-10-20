#!/usr/bin/env node
/* global window, document, getComputedStyle */
// Real mouse capture, touch dragging, native range keyboard input and live HA updates against the built app.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer} from '../../tools/serve.mjs';
import {CHROME} from '../../tools/run-tests.mjs';
import {clientYForPercent} from '../../src/overviews/_shared/vertical-level.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = await startServer({root, port: 0});
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox']
});
try {
  const page = await browser.newPage();
  await page.setViewport({width: 800, height: 600, hasTouch: true});
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${server.url}/tests/overviews/input.html`);
  await page.waitForFunction('window.ready === true');
  await page.evaluate(() => {
    window.card?.remove();
    const card = document.createElement('houseview-card');
    window.card = card;
    window.lightCalls = [];
    window.lightHass = {
      states: {
        'light.test': {
          state: 'on',
          attributes: {
            friendly_name: 'Living room',
            brightness: 82,
            supported_color_modes: ['brightness']
          }
        }
      },
      locale: {language: 'en'},
      callService: async (d, s, data) => {
        window.lightCalls.push({d, s, data});
      }
    };
    card.setConfig({widgets: [{type: 'light', entity: 'light.test'}]});
    card.hass = window.lightHass;
    document.body.replaceChildren(card);
  });
  const centre = async (selector) =>
    page.evaluate((s) => {
      const r = window.card.shadowRoot.querySelector(s).getBoundingClientRect();
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        top: r.top,
        bottom: r.bottom,
        height: r.height
      };
    }, selector);
  const label = await centre('.control > span');
  await page.mouse.click(label.x, label.y);
  assert.equal(await page.evaluate(() => window.lightCalls[0]?.s), 'toggle');
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.hv-screensaver')),
    false
  );
  await page.evaluate(() => {
    window.lightCalls.length = 0;
  });
  console.log('PASS clicking the tile label toggles without opening the dimmer');
  const tile = await centre('[data-action="light"]');
  await page.evaluate(() => {
    window.fake.now += 1000;
  });
  // Movement cancels the hold and preserves swiping.
  await page.mouse.move(tile.x, tile.y);
  await page.mouse.down();
  await page.mouse.move(tile.x + 80, tile.y, {steps: 4});
  await new Promise((resolve) => setTimeout(resolve, 600));
  await page.mouse.up();
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.hv-screensaver')),
    false
  );
  assert.equal(await page.evaluate(() => window.lightCalls.length), 0);
  await page.evaluate(() => {
    window.fake.now += 1000;
  });
  await page.mouse.move(tile.x, tile.y);
  await page.mouse.down();
  await new Promise((resolve) => setTimeout(resolve, 1050));
  await page.evaluate(() => {
    window.fake.now += 1500;
  });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.lightCalls.length), 0);
  console.log('PASS long hold opens controls once; release does not toggle; swiping cancels holds');
  await page.waitForSelector('houseview-card >>> .ov-light-input');
  const input = await centre('.ov-light-input');
  const probe = () =>
    page.evaluate(() => ({
      value: window.card.shadowRoot.querySelector('.ov-light-value')?.textContent,
      fill: window.card.shadowRoot
        .querySelector('.ov-light-control')
        ?.style.getPropertyValue('--brightness'),
      calls: window.lightCalls,
      open: !!window.card.shadowRoot.querySelector('.hv-screensaver')
    }));
  await page.mouse.move(input.x, clientYForPercent(input, 32));
  await page.mouse.down();
  await page.mouse.move(input.x, clientYForPercent(input, 80), {steps: 8});
  let state = await probe();
  assert.equal(state.value, '80');
  assert.equal(state.fill, '80%');
  assert.equal(state.calls.length, 0);
  // An authoritative brightness update during the drag must not steal the pointer or move the fill.
  await page.evaluate(() => {
    const state = window.lightHass.states['light.test'];
    window.lightHass.states['light.test'] = {
      ...state,
      attributes: {...state.attributes, brightness: 25}
    };
    window.card.hass = window.lightHass;
  });
  assert.equal((await probe()).value, '80');
  await page.mouse.move(input.x, input.top - 30);
  await page.mouse.up();
  state = await probe();
  assert.equal(state.value, '100');
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].data.brightness_pct, 100);
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(window.card.shadowRoot.querySelector('.ov-light-control')).outlineStyle
    ),
    'none'
  );
  assert.ok(state.open);
  console.log(
    'PASS real mouse capture, drag outside bounds, immediate UI, HA update during drag, final service'
  );

  await page.keyboard.press('Home');
  await page.waitForFunction('window.lightCalls.length === 2');
  assert.equal((await probe()).value, '0');
  assert.equal((await probe()).calls[1].s, 'turn_off');
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction('window.lightCalls.length === 3');
  assert.equal((await probe()).value, '1');
  assert.equal((await probe()).calls[2].data.brightness_pct, 1);
  console.log('PASS native keyboard Home and ArrowUp update UI and services');

  const touchInput = await centre('.ov-light-input');
  const cdp = await page.createCDPSession();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: touchInput.x, y: clientYForPercent(touchInput, 20)}]
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{x: touchInput.x, y: clientYForPercent(touchInput, 70)}]
  });
  const touchValue = Number((await probe()).value);
  assert.ok(Math.abs(touchValue - 70) <= 1); // CDP touch coordinates are quantised to CSS pixels.
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await page.screenshot({path: '/tmp/houseview-light-detail.png'});
  await page.waitForFunction('window.lightCalls.length === 4');
  assert.equal((await probe()).calls[3].data.brightness_pct, touchValue);
  console.log('PASS real touch drag commits final brightness');
  await page.screenshot({path: '/tmp/houseview-light-detail.png'});

  await page.evaluate(() => {
    const state = window.lightHass.states['light.test'];
    window.lightHass.states['light.test'] = {
      ...state,
      attributes: {...state.attributes, brightness: 128}
    };
    window.card.hass = window.lightHass;
  });
  assert.equal((await probe()).value, '50');
  await page.keyboard.press('Escape');
  await page.waitForFunction('!window.card.shadowRoot.querySelector(".hv-screensaver")');
  await new Promise((resolve) => setTimeout(resolve, 400));
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.evaluate(() => {
    const state = window.lightHass.states['light.test'];
    window.lightHass.states['light.test'] = {
      ...state,
      attributes: {
        ...state.attributes,
        supported_color_modes: ['xy', 'color_temp'],
        hs_color: [240, 60],
        min_color_temp_kelvin: 2200,
        max_color_temp_kelvin: 6000
      }
    };
    window.card.hass = window.lightHass;
    window.lightCalls.length = 0;
  });
  const click = async (selector) => {
    await page.evaluate(() => {
      window.fake.now += 1000;
    });
    const r = await centre(selector);
    await page.mouse.click(r.x, r.y);
  };
  await page.evaluate(() => {
    window.fake.now += 1000;
  });
  const lightTile = await centre('[data-action="light"]');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: lightTile.x, y: lightTile.y}]
  });
  await new Promise((resolve) => setTimeout(resolve, 1050));
  await page.evaluate(() => {
    window.fake.now += 1500;
  });
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  assert.equal(await page.evaluate(() => window.lightCalls.length), 0);
  console.log('PASS real touch long hold opens the light view without a trailing toggle');
  await page.waitForSelector('houseview-card >>> .ov-light-open-colour');
  const assertIconCentred = async (selector) => {
    const aligned = await page.evaluate((s) => {
      const button = window.card.shadowRoot.querySelector(s);
      const b = button.getBoundingClientRect();
      const i = button.querySelector('ha-icon').getBoundingClientRect();
      return (
        Math.abs(b.x + b.width / 2 - i.x - i.width / 2) < 1 &&
        Math.abs(b.y + b.height / 2 - i.y - i.height / 2) < 1 &&
        b.width >= 64 &&
        b.height >= 64 &&
        Math.abs(b.width - b.height) < 1 &&
        i.width === 28 &&
        i.height === 28
      );
    }, selector);
    assert.ok(aligned, `${selector} icon must be centred in its button`);
  };
  await assertIconCentred('.ov-light-open-colour');
  await click('.ov-light-open-colour');
  await new Promise((resolve) => setTimeout(resolve, 450));
  await assertIconCentred('.ov-light-cancel');
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.ov-light-apply')),
    false
  );
  await assertIconCentred('.ov-light-mode');
  const colour = () =>
    page.evaluate(() => {
      const root = window.card.shadowRoot;
      return {
        open: !root.querySelector('.ov-light-colour').hidden,
        mode: root.querySelector('.ov-light-colour').dataset.mode,
        hue: root.querySelector('.ov-light-hue').value,
        saturation: root.querySelector('.ov-light-saturation').value,
        action: root.querySelector('.ov-light-colour-value').dataset.valueAction,
        calls: window.lightCalls
      };
    });
  assert.equal((await colour()).open, true);
  const field = await centre('.ov-light-spectrum');
  assert.ok(field.height <= 480 && field.height >= 400);
  const touchX = field.x + 200;
  const touchY = field.y;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: field.x, y: field.y}]
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{x: touchX, y: touchY}]
  });
  assert.equal((await colour()).hue, '150');
  assert.equal((await colour()).saturation, '83');
  await page.evaluate(() => {
    const state = window.lightHass.states['light.test'];
    window.lightHass.states['light.test'] = {
      ...state,
      attributes: {...state.attributes, hs_color: [0, 100]}
    };
    window.card.hass = window.lightHass;
  });
  assert.equal((await colour()).hue, '150');
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await page.waitForFunction(() => window.lightCalls.at(-1)?.data.hs_color?.[0] === 150);
  const calls = (await colour()).calls;
  assert.deepEqual(calls.at(-1), {
    d: 'light',
    s: 'turn_on',
    data: {entity_id: 'light.test', hs_color: [150, 83]}
  });
  assert.equal((await colour()).open, true);
  const count = calls.length;
  // Releasing/tapping the same point must not repeat a service call.
  await page.mouse.click(touchX, touchY);
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.equal((await colour()).calls.length, count);
  await page.screenshot({path: '/tmp/houseview-light-colour.png'});
  await click('.ov-light-cancel');
  assert.equal((await colour()).calls.length, count);
  assert.equal((await colour()).open, false);
  await click('.ov-light-open-colour');
  await page.keyboard.press('Escape');
  assert.equal((await colour()).open, false);
  assert.equal((await colour()).calls.length, count);
  assert.ok((await probe()).open);
  console.log(
    'PASS live touch colour, HA updates, unchanged point deduplication, and X/Escape without extra writes'
  );
  await click('.ov-light-open-colour');
  await click('.ov-light-mode');
  assert.equal((await colour()).mode, 'temperature');
  assert.equal((await colour()).calls.length, count);
  await assertIconCentred('.ov-light-mode');
  await page.mouse.click(479, 240);
  await page.waitForFunction(() => window.lightCalls.at(-1)?.data.color_temp_kelvin >= 5990);
  assert.ok((await colour()).calls.at(-1).data.color_temp_kelvin <= 6000);
  await click('.ov-light-mode');
  await page.evaluate(() => window.card.shadowRoot.querySelector('.ov-light-hue').focus());
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.lightCalls.at(-1)?.data.hs_color?.[0] === 1);
  assert.equal((await colour()).hue, '1');
  console.log('PASS centred icons, Kelvin limits and live native keyboard colour selection');
  const beforeSlow = (await colour()).calls.length;
  await page.evaluate(() => {
    let first = true;
    window.lightHass.callService = async (d, s, data) => {
      window.lightCalls.push({d, s, data});
      if (first) {
        first = false;
        await new Promise((resolve) => {
          window.finishColour = resolve;
        });
      }
    };
    const input = window.card.shadowRoot.querySelector('.ov-light-hue');
    input.value = '30';
    input.dispatchEvent(new window.Event('input', {bubbles: true}));
  });
  await page.waitForFunction(() => !!window.finishColour);
  await page.evaluate(() => {
    const input = window.card.shadowRoot.querySelector('.ov-light-hue');
    for (let n = 31; n <= 90; n++) {
      input.value = String(n);
      input.dispatchEvent(new window.Event('input', {bubbles: true}));
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.equal((await colour()).calls.length, beforeSlow + 1);
  await page.evaluate(() => window.finishColour());
  await page.waitForFunction((count) => window.lightCalls.length === count + 2, {}, beforeSlow);
  assert.equal((await colour()).calls.at(-1).data.hs_color[0], 90);
  assert.equal((await colour()).open, true);
  console.log(
    'PASS rapid colour changes coalesce behind a slow service and retain the final selection'
  );
  const beforeInvalid = (await colour()).calls.length;
  await page.evaluate(async () => {
    for (const action of [
      'light-colour-361:50',
      'light-colour-1:101',
      'light-colour-NaN:1',
      'light-temperature-1000'
    ]) {
      await window.card._act(action, 'light.test');
    }
  });
  assert.equal((await colour()).calls.length, beforeInvalid);
  await page.evaluate(() => {
    const state = window.lightHass.states['light.test'];
    window.lightHass.states['light.test'] = {...state, state: 'unavailable'};
    window.card.hass = window.lightHass;
  });
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.ov-light-colour-value').disabled
    ),
    true
  );
  await page.evaluate(async () => window.card._act('light-colour-10:50', 'light.test'));
  assert.equal((await colour()).calls.length, beforeInvalid);
  console.log('PASS invalid and unavailable colour changes send no service');
  assert.deepEqual(errors, []);
  console.log('PASS authoritative updates after release and Escape dismissal; no browser errors');
} finally {
  await browser.close();
  await server.close();
}
