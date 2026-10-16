#!/usr/bin/env node
/* global window, document, getComputedStyle */
// Real mouse capture, touch dragging, native range keyboard input and live HA updates against the built app.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer} from '../../tools/serve.mjs';
import {CHROME} from '../../tools/run-tests.mjs';

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
  const tile = await centre('[data-action="light-view"]');
  await page.mouse.click(tile.x, tile.y);
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
  await page.mouse.move(input.x, input.bottom - input.height * 0.32);
  await page.mouse.down();
  await page.mouse.move(input.x, input.bottom - input.height * 0.8, {steps: 8});
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
    touchPoints: [{x: touchInput.x, y: touchInput.bottom - touchInput.height * 0.2}]
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{x: touchInput.x, y: touchInput.bottom - touchInput.height * 0.7}]
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
  assert.deepEqual(errors, []);
  console.log('PASS authoritative updates after release and Escape dismissal; no browser errors');
} finally {
  await browser.close();
  await server.close();
}
