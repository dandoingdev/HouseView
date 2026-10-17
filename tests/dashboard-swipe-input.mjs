/* global window */
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
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.goto(`${server.url}/tests/overviews/input.html`);
  await page.waitForFunction('window.ready === true');
  await page.evaluate(async () => {
    await window.mount(undefined);
    window.card.setConfig({
      tablet_mode: true,
      show_header: true,
      performance: 'lite',
      pages: [{name: 'Home'}, {name: 'More'}, {name: 'Last'}],
      widgets: [
        {type: 'light', entity: 'light.a', page: 'Home', action: 'toggle'},
        {type: 'light', entity: 'light.b', page: 'More', action: 'toggle'},
        {type: 'clock', page: 'Last'}
      ]
    });
    window.card.hass = window.mock.hass;
    window.resetCalls();
  });
  const client = await page.createCDPSession();
  const swipe = async (selector, dx, dy = 0) => {
    await page.evaluate(() => {
      window.fake.now += 1000;
    });
    const point = await page.evaluate((selector) => {
      const r = window.card.shadowRoot.querySelector(selector).getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, selector);
    await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [point]});
    for (let i = 1; i <= 8; i++)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{x: point.x + (dx * i) / 8, y: point.y + (dy * i) / 8}]
      });
    await page.evaluate(() => new Promise(window.requestAnimationFrame));
    const geometry = await page.evaluate(() => {
      const face = window.card.shadowRoot.querySelector('.face').getBoundingClientRect();
      const neighbour = window.card._swipePreview?.element.getBoundingClientRect();
      return neighbour ? {dy: neighbour.y - face.y, dh: neighbour.height - face.height} : null;
    });
    if (geometry) {
      assert.ok(Math.abs(geometry.dy) <= 1, 'page tops remain aligned during every drag');
      assert.ok(Math.abs(geometry.dh) <= 1, 'page heights remain equal during every drag');
    }
    await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await page.waitForFunction('!window.card._pageAnimations?.length');
  };
  const index = () => page.evaluate(() => window.card._pageIndex);
  for (const [width, height] of [
    [480, 480],
    [360, 640],
    [800, 1280],
    [1280, 800]
  ]) {
    await page.setViewport({width, height, hasTouch: true});
    await swipe('.page-nav', -100);
    assert.equal(await index(), 1, `navigation swipe at ${width}x${height}`);
    await swipe('.widget', 85);
    assert.equal(await index(), 0, 'widget swipe returns to previous page');
    await swipe('.dashboard-header', -100);
    assert.equal(await index(), 1, 'header swipe advances');
    await swipe('.page-nav', 100);
    assert.equal(await index(), 0);
    await swipe('.widget', 0, 70);
    assert.equal(await index(), 0, 'vertical movement does not page');
    await swipe('.page-nav', 100);
    assert.equal(await index(), 0, 'first page clamps');
    await swipe('.page-nav', -100);
    await swipe('.page-nav', -100);
    await swipe('.page-nav', -100);
    assert.equal(await index(), 2, 'last page clamps');
    await swipe('.page-nav', 100);
    await swipe('.page-nav', 100);
    assert.deepEqual(await page.evaluate(() => window.calls()), [], 'swipes never toggle lights');
    console.log(`PASS real touch paging on widgets, header and navigation at ${width}x${height}`);
  }
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  const touch = async (type, x = 320, y = 445) => {
    await client.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{x, y}]
    });
    await page.evaluate(() => new Promise(window.requestAnimationFrame));
  };
  const settled = () => page.waitForFunction('!window.card._pageAnimations?.length');
  const dragState = () =>
    page.evaluate(() => {
      const root = window.card.shadowRoot;
      const rect = (selector) => {
        const r = root.querySelector(selector)?.getBoundingClientRect();
        return r ? {x: r.x, y: r.y, w: r.width, h: r.height} : null;
      };
      return {
        page: window.card._pageIndex,
        face: rect('.face'),
        neighbour: rect('.page-outgoing'),
        header: rect('.dashboard-header'),
        nav: rect('.page-nav')
      };
    });
  const before = await dragState();
  await touch('touchStart');
  await touch('touchMove', 200);
  const during = await dragState();
  assert.equal(during.page, 0, 'page selection stays on the original while dragging');
  assert.equal(during.face.x, -120, 'the current page follows the finger exactly');
  assert.equal(during.neighbour.x, 360, 'the next page enters from one screen width away');
  assert.equal(during.face.y, before.face.y);
  assert.equal(during.neighbour.y, before.face.y, 'neighbour stays below the header');
  assert.equal(during.neighbour.h, before.face.h);
  assert.deepEqual(during.header, before.header);
  assert.deepEqual(during.nav, before.nav);
  await page.evaluate(() => {
    window.swipePreviewTile = window.card._swipePreview.element.querySelector('[data-widget]');
    const neighbour = window.mock.hass.states['light.b'];
    window.mock.replaceState('light.b', {...neighbour, state: 'on'});
    window.card.hass = {...window.mock.hass};
    window.fake.now += 3000; // deliberate slow drag still settles by distance
  });
  await page.screenshot({path: '/tmp/houseview-dashboard-dragging.png'});
  await touch('touchEnd');
  assert.equal(await index(), 1);
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.face [data-widget]') === window.swipePreviewTile
    ),
    true,
    'release promotes the actual preview tile instead of rebuilding it'
  );
  assert.match(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.face').textContent),
    /on/i
  );
  const releasing = await dragState();
  assert.equal(releasing.face.y, before.face.y);
  assert.equal(releasing.neighbour.y, before.face.y, 'outgoing page has no upward jump');
  await settled();
  assert.equal((await dragState()).face.x, 0);
  assert.equal((await dragState()).neighbour, null);
  await swipe('.page-nav', 100);
  console.log(
    'PASS finger tracking, adjacent page, slow release, DOM reuse and fixed vertical geometry'
  );

  for (const cancel of [false, true]) {
    await touch('touchStart');
    await touch('touchMove', cancel ? 200 : 285);
    await touch(cancel ? 'touchCancel' : 'touchEnd');
    await settled();
    assert.equal(await index(), 0, 'short and cancelled gestures return to the original page');
    assert.equal((await dragState()).face.x, 0);
    assert.equal((await dragState()).neighbour, null);
  }
  await touch('touchStart');
  await touch('touchMove', 200);
  await touch('touchMove', 355);
  assert.equal(
    (await dragState()).face.x,
    8.75,
    'reversing past the first page applies edge resistance'
  );
  await touch('touchEnd');
  await settled();
  assert.equal(await index(), 0);
  console.log('PASS short drags spring back, cancellation cleans up, reversal and edge resistance');

  await touch('touchStart');
  await touch('touchMove', 200);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      {x: 200, y: 445, id: 0},
      {x: 250, y: 445, id: 1}
    ]
  });
  await touch('touchCancel');
  await settled();
  assert.equal(await index(), 0, 'a second finger cancels page selection');
  assert.equal((await dragState()).neighbour, null);
  await touch('touchStart');
  await touch('touchMove', 200);
  await page.setViewport({width: 360, height: 640, hasTouch: true});
  await page.waitForFunction('!window.card._swipePreview && !window.card._gesture');
  await touch('touchCancel');
  assert.equal(await index(), 0, 'rotation/resize cancels the drag');
  assert.equal((await dragState()).face.x, 0);
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.waitForFunction('window.card.shadowRoot.querySelector(".face").offsetWidth === 480');
  console.log('PASS multi-touch and resize discard the preview without changing pages');

  await page.evaluate(() => {
    window.card._perf = 'full';
    window.card._setPage(1);
  });
  const buttonGlide = await dragState();
  assert.equal(
    buttonGlide.neighbour.y,
    before.face.y,
    'button navigation also preserves header offset'
  );
  await settled();
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await swipe('.page-nav', 100);
  assert.equal(await index(), 0, 'reduced motion still permits swipe navigation');
  assert.equal((await dragState()).face.x, 0);
  assert.equal((await dragState()).neighbour, null);
  await page.emulateMediaFeatures([]);
  assert.deepEqual(await page.evaluate(() => window.calls()), []);
  console.log('PASS button glide has no upward jump; reduced motion remains immediate');
  await page.screenshot({path: '/tmp/houseview-dashboard-swipe.png'});
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
