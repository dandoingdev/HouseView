#!/usr/bin/env node
/* global window, document */
// Real touch and mouse long presses on dashboard tiles, against the built app. A hold opens the widget's next
// screen while the finger is still down, on every part of the tile and in every entity state, and the release
// never presses what opened under it.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer} from '../tools/serve.mjs';
import {CHROME} from '../tools/run-tests.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await startServer({
  root,
  port: 0,
  target: process.argv.includes('--min') ? 'dist-min' : 'dist'
});
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox']
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({width: 800, height: 600, hasTouch: true});
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${server.url}/tests/overviews/input.html`);
  await page.waitForFunction('window.ready === true');

  const mount = async (state, widgets = [{type: 'light', entity: 'light.test'}]) => {
    await page.evaluate(
      (entityState, list) => {
        window.card?.remove();
        const card = document.createElement('houseview-card');
        card.style.cssText = 'display:block;height:100vh';
        window.card = card;
        window.holdCalls = [];
        window.holdInfos = [];
        const on = entityState === 'on';
        card.setConfig({widgets: list});
        card.hass = {
          states: {
            'light.test': {
              state: entityState,
              attributes: {
                friendly_name: 'Living room',
                supported_color_modes: ['hs', 'color_temp'],
                ...(on ? {brightness: 82, color_mode: 'hs', hs_color: [30, 60]} : {})
              }
            },
            'switch.test': {state: entityState, attributes: {friendly_name: 'Kettle'}}
          },
          locale: {language: 'en'},
          callService: async (d, s) => {
            window.holdCalls.push(`${d}.${s}`);
          }
        };
        card.addEventListener('hass-more-info', (e) => window.holdInfos.push(e.detail?.entityId));
        document.body.replaceChildren(card);
      },
      state,
      widgets
    );
    await sleep(80);
  };
  const centre = (selector) =>
    page.evaluate((s) => {
      const r = window.card.shadowRoot.querySelector(s).getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, selector);
  const probe = () =>
    page.evaluate(() => ({
      view: !!window.card.shadowRoot.querySelector('.ov-light-scene'),
      calls: window.holdCalls,
      infos: window.holdInfos
    }));
  // The fake clock of the host page stands still: move it with the real time that passed.
  const wait = async (ms) => {
    await sleep(ms);
    await page.evaluate((n) => {
      window.fake.now += n;
    }, ms);
  };
  const press = async (input, at) => {
    if (input === 'touch') return page.touchscreen.touchStart(at.x, at.y);
    await page.mouse.move(at.x, at.y);
    return page.mouse.down();
  };
  const lift = (input) => (input === 'touch' ? page.touchscreen.touchEnd() : page.mouse.up());
  /** Press `at`, keep it down for `held` ms, report what is showing before and after the release. */
  const hold = async (input, at, held) => {
    await press(input, at);
    await wait(held);
    const during = await probe();
    await lift(input);
    await wait(150);
    return {during, after: await probe()};
  };

  // Where the keys of the light view appear, to hold the tile exactly there.
  await mount('on');
  await page.evaluate(() => window.card._act('light-view', 'light.test'));
  await sleep(200);
  const closeKey = await centre('.ov-panel-close');
  const infoKey = await centre('.ov-panel-info');

  for (const state of ['on', 'off']) {
    for (const input of ['touch', 'mouse']) {
      const spots = {
        'the tile': '.control > span',
        'the brightness key': '.control-icon'
      };
      for (const [where, selector] of Object.entries(spots)) {
        for (const held of [650, 1500]) {
          await mount(state);
          const {during, after} = await hold(input, await centre(selector), held);
          const label = `light ${state}: ${input} hold on ${where} for ${held} ms`;
          assert.ok(during.view, `${label} opens the light view before the release`);
          assert.ok(after.view, `${label} keeps the light view after the release`);
          assert.deepEqual(after.calls, [], `${label} calls no service`);
          assert.deepEqual(after.infos, [], `${label} opens nothing else`);
        }
      }
      // The view's own keys appear under the finger. The release must not press them.
      for (const [name, at] of [
        ['close', closeKey],
        ['details', infoKey]
      ]) {
        for (const held of [650, 1500]) {
          await mount(state);
          const {during, after} = await hold(input, at, held);
          const label = `light ${state}: ${input} hold for ${held} ms under the ${name} key`;
          assert.ok(during.view, `${label} opens the light view`);
          assert.ok(after.view, `${label}: the release does not close the view`);
          assert.deepEqual(after.infos, [], `${label}: the release does not press the key`);
          assert.deepEqual(after.calls, [], `${label} calls no service`);
        }
      }
      // After the release the view answers the next press as usual.
      await wait(500);
      if (input === 'touch') await page.touchscreen.tap(closeKey.x, closeKey.y);
      else await page.mouse.click(closeKey.x, closeKey.y);
      await wait(500);
      assert.equal((await probe()).view, false, `light ${state}: ${input} close key still closes`);

      // Short presses are unchanged: the tile toggles, the brightness key opens the view.
      await mount(state);
      let at = await centre('.control > span');
      if (input === 'touch') await page.touchscreen.tap(at.x, at.y);
      else await page.mouse.click(at.x, at.y);
      await wait(150);
      let now = await probe();
      assert.deepEqual(now.calls, ['light.toggle'], `light ${state}: ${input} tap toggles once`);
      assert.equal(now.view, false, `light ${state}: ${input} tap opens no view`);
      await mount(state);
      at = await centre('.control-icon');
      if (input === 'touch') await page.touchscreen.tap(at.x, at.y);
      else await page.mouse.click(at.x, at.y);
      await wait(150);
      now = await probe();
      assert.ok(now.view, `light ${state}: ${input} tap on the brightness key opens the view`);
      assert.deepEqual(now.calls, [], `light ${state}: ${input} tap on the key calls no service`);
      console.log(
        `PASS light ${state}, ${input}: holds open the light view on the tile and its key, releases press nothing, taps unchanged`
      );

      // A switch: the hold opens Home Assistant's dialog once, from the tile and from the details key.
      for (const selector of ['.control > span', '.control-icon']) {
        await mount(state, [{type: 'switch', entity: 'switch.test'}]);
        const {during, after} = await hold(input, await centre(selector), 900);
        const label = `switch ${state}: ${input} hold on ${selector}`;
        assert.deepEqual(
          during.infos,
          ['switch.test'],
          `${label} opens more-info before the release`
        );
        assert.deepEqual(after.infos, ['switch.test'], `${label} opens more-info once`);
        assert.deepEqual(after.calls, [], `${label} does not toggle`);
      }
      console.log(`PASS switch ${state}, ${input}: holds open more-info once and never toggle`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
