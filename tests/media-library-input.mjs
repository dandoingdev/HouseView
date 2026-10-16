/* global document, window, PointerEvent */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer} from '../tools/serve.mjs';
import {CHROME} from '../tools/run-tests.mjs';

const server = await startServer({
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  port: 0
});
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox']
});
try {
  const page = await browser.newPage();
  await page.setViewport({width: 1280, height: 800, hasTouch: true});
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${server.url}/tests/media-library.html?preview`);
  await page.waitForFunction(() =>
    document.querySelector('#summary').textContent.includes('0 failed')
  );
  await page.waitForSelector('houseview-card >>> .ml-item');
  await page.evaluate(() => {
    window.card = document.querySelector('houseview-card');
    window.swipeCalls = [];
    window.card._hass.callService = async (d, s, data) => window.swipeCalls.push({d, s, data});
  });
  const state = () =>
    page.evaluate(() => ({
      title: window.card.shadowRoot.querySelector('.ml-item strong')?.textContent,
      page: window.card._pageIndex,
      calls: window.swipeCalls.length
    }));
  const grid = await page.evaluate(() => {
    const r = window.card.shadowRoot.querySelector('.ml-content').getBoundingClientRect();
    return {x: r.x + r.width * 0.6, y: r.y + r.height * 0.4};
  });
  const mouseSwipe = async (dx, dy = 0) => {
    await page.mouse.move(grid.x, grid.y);
    await page.mouse.down();
    await page.mouse.move(grid.x + dx, grid.y + dy, {steps: 8});
    await page.mouse.up();
  };
  await mouseSwipe(-150);
  assert.equal((await state()).title, 'Weekend');
  assert.equal((await state()).calls, 0);
  await mouseSwipe(-150);
  assert.equal((await state()).title, 'Weekend', 'last page clamps');
  assert.equal((await state()).calls, 0, 'edge swipe cannot play');
  await mouseSwipe(150);
  assert.equal((await state()).title, 'Kitchen favourites');
  await mouseSwipe(150);
  assert.equal((await state()).title, 'Kitchen favourites', 'first page clamps');
  assert.equal((await state()).calls, 0);
  console.log(
    'PASS mouse swipes page in both directions and clamp at either edge without playback'
  );

  const client = await page.createCDPSession();
  const touchSwipe = async (dx, dy = 0) => {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{x: grid.x, y: grid.y}]
    });
    for (let i = 1; i <= 8; i++)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{x: grid.x + (dx * i) / 8, y: grid.y + (dy * i) / 8}]
      });
    await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  };
  await touchSwipe(-160);
  assert.equal((await state()).title, 'Weekend');
  await touchSwipe(160);
  assert.equal((await state()).title, 'Kitchen favourites');
  await touchSwipe(10, 140);
  assert.equal((await state()).title, 'Kitchen favourites', 'vertical motion does not turn pages');
  assert.equal((await state()).calls, 0);
  assert.equal((await state()).page, 0, 'dashboard underneath stays on its original page');
  console.log(
    'PASS real touch swipes; vertical scrolling does not page or play; dashboard underneath stays put'
  );

  // Cancellation cannot leave a gesture armed for the next pointerup.
  await page.evaluate(() => {
    const content = window.card.shadowRoot.querySelector('.ml-content');
    for (const [type, x] of [
      ['pointerdown', 300],
      ['pointercancel', 300],
      ['pointerup', 100]
    ]) {
      content.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 55,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: 100
        })
      );
    }
  });
  assert.equal((await state()).title, 'Kitchen favourites');
  await new Promise((resolve) => setTimeout(resolve, 450));
  const tile = await page.evaluate(() => {
    const r = window.card.shadowRoot.querySelector('.ml-item').getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2};
  });
  await page.touchscreen.tap(tile.x, tile.y);
  const calls = await page.evaluate(() => window.swipeCalls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].s, 'play_media');
  assert.equal(calls[0].data.media_content_id, 'FV:0');
  assert.equal(calls[0].data.entity_id, 'media_player.test');
  await page.waitForFunction(() => !window.card.shadowRoot.querySelector('.media-library'));
  assert.ok(await page.evaluate(() => !!window.card.shadowRoot.querySelector('.music-panel')));
  assert.deepEqual(errors, []);
  console.log(
    'PASS cancelled gestures do not page; a deliberate tap after swiping still plays exactly the selected favourite'
  );
} finally {
  await browser.close();
  await server.close();
}
