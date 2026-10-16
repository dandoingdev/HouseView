#!/usr/bin/env node
/* global window, document */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {startServer} from '../tools/serve.mjs';
import {CHROME} from '../tools/run-tests.mjs';
const server = await startServer({root: process.cwd(), port: 0});
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox']
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.goto(`${server.url}/tests/overviews/input.html`);
  await page.waitForFunction('window.ready === true');
  for (const [width, height] of [
    [320, 320],
    [420, 320],
    [480, 480],
    [853, 533],
    [1280, 800],
    [800, 1280]
  ]) {
    await page.setViewport({width, height, hasTouch: true});
    for (const type of ['light', 'volume', 'climate']) {
      for (const mode of ['card', 'screensaver']) {
        await page.evaluate(
          async ({type, mode, width, height}) => {
            window.card?.remove();
            const {variants} = await import(`/src/overviews/${type}/fixtures.js`);
            const fixture = variants.ok;
            const card = (window.card = document.createElement('houseview-card'));
            card.style.cssText = `width:${width}px;height:${height}px`;
            const overview = {type, ...fixture.options};
            card.setConfig(
              mode === 'card'
                ? {cards: [{...overview, type: `custom:houseview-${type}-overview-card`}]}
                : {
                    tablet_mode: true,
                    widgets: [{type: 'clock'}],
                    screensaver: {...overview, preview: true}
                  }
            );
            card.hass = {
              states: fixture.states,
              locale: {language: 'en'},
              callService: async () => {}
            };
            document.body.replaceChildren(card);
          },
          {type, mode, width, height}
        );
        await page.waitForSelector('houseview-card >>> .ov-panel-key');
        await new Promise((resolve) => setTimeout(resolve, 100));
        const keys = await page.evaluate(() => {
          const root = window.card.shadowRoot;
          const scene = root.querySelector('.ov-scene').getBoundingClientRect();
          return [...root.querySelectorAll('.ov-panel-key')]
            .filter((b) => b.getBoundingClientRect().width)
            .map((button) => {
              const b = button.getBoundingClientRect(),
                i = button.querySelector('ha-icon').getBoundingClientRect();
              return {
                action: button.dataset.action,
                left: b.left,
                right: b.right,
                top: b.top,
                bottom: b.bottom,
                width: b.width,
                height: b.height,
                dx: Math.abs(b.x + b.width / 2 - i.x - i.width / 2),
                dy: Math.abs(b.y + b.height / 2 - i.y - i.height / 2),
                inside:
                  b.left >= scene.left &&
                  b.right <= scene.right &&
                  b.top >= scene.top &&
                  b.bottom <= scene.bottom
              };
            });
        });
        for (const key of keys) {
          const label = `${type} ${mode} ${width}x${height}: ${JSON.stringify(key)}`;
          assert.ok(
            key.width >= 64 && key.height >= 64 && Math.abs(key.width - key.height) < 1,
            label
          );
          assert.ok(key.dx < 1 && key.dy < 1, label);
          assert.ok(key.inside, label);
        }
        for (let a = 0; a < keys.length; a++) {
          for (const b of keys.slice(a + 1)) {
            const k = keys[a];
            assert.ok(
              k.right <= b.left || b.right <= k.left || k.bottom <= b.top || b.bottom <= k.top,
              `${type} ${mode} ${width}x${height}: ${k.action} overlaps ${b.action}`
            );
          }
        }
        assert.ok(keys.length);
        if (
          process.env.HV_TOUCH_SCREENSHOT &&
          type === 'light' &&
          mode === 'screensaver' &&
          width === 480
        ) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          await page.screenshot({path: process.env.HV_TOUCH_SCREENSHOT});
        }
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS overview button sizes, circles, icon centres and bounds across six sizes in card and full-screen modes'
  );
} finally {
  await browser.close();
  await server.close();
}
