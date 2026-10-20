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
  // A finger rarely starts perfectly horizontally: don't reject an ambiguous first few pixels.
  for (const [type, x, y] of [
    ['touchStart', 320, 445],
    ['touchMove', 308, 454],
    ['touchMove', 200, 457],
    ['touchEnd', 200, 457]
  ]) {
    await client.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{x, y}]
    });
    await page.evaluate(() => new Promise(window.requestAnimationFrame));
  }
  await page.waitForFunction('!window.card._pageAnimations?.length');
  assert.equal(await index(), 1, 'a diagonal start can resolve into a horizontal touch swipe');
  await swipe('.page-nav', 100);
  console.log('PASS a natural diagonal start resolves into horizontal paging');

  const gesture = async (points) => {
    await page.evaluate(() => window.card._setPage(0));
    await page.waitForFunction('!window.card._pageAnimations?.length');
    for (const [type, x, y] of points) {
      await client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{x, y}]
      });
      await page.evaluate(() => new Promise(window.requestAnimationFrame));
    }
    await page.waitForFunction('!window.card._pageAnimations?.length');
  };
  await gesture([
    ['touchStart', 320, 240],
    ['touchMove', 285, 265],
    ['touchMove', 250, 290]
  ]);
  const diagonal = await page.evaluate(() => {
    const face = window.card.shadowRoot.querySelector('.face').getBoundingClientRect();
    return {dragging: !!window.card._gesture?.dragging, x: face.x, page: window.card._pageIndex};
  });
  assert.equal(diagonal.page, 0, 'the page changes on release, not at the first diagonal sample');
  assert.equal(diagonal.dragging, true, 'a diagonal drag follows the finger');
  assert.ok(diagonal.x < -60, 'the current page tracks the diagonal travel');
  await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await page.waitForFunction('!window.card._pageAnimations?.length');
  assert.equal(await index(), 1, 'a diagonal swipe turns the page');
  await gesture([
    ['touchStart', 320, 240],
    ['touchMove', 310, 256],
    ['touchMove', 160, 270],
    ['touchEnd', 160, 270]
  ]);
  assert.equal(await index(), 1, 'a short downward start does not cancel the sideways swipe');
  await page.evaluate(() => window.card._setPage(0));
  await page.waitForFunction('!window.card._pageAnimations?.length');
  console.log('PASS diagonal travel and a dipped start still page');

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
        neighbour: (() => {
          const el = window.card._swipePreview?.element || root.querySelector('.page-outgoing');
          const r = el?.getBoundingClientRect();
          return r ? {x: r.x, y: r.y, w: r.width, h: r.height} : null;
        })(),
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
  await touch('touchStart', 160);
  await touch('touchMove', 280);
  const reducedDrag = await dragState();
  assert.equal(reducedDrag.page, 1, 'reduced motion waits for release before changing pages');
  assert.equal(reducedDrag.face.x, 120, 'reduced motion still follows the finger');
  assert.equal(reducedDrag.neighbour.x, -360);
  assert.equal(reducedDrag.neighbour.y, before.face.y);
  await touch('touchEnd');
  assert.equal(await index(), 0, 'reduced motion still permits swipe navigation');
  assert.equal(await page.evaluate(() => window.card._pageAnimations.length), 0);
  assert.equal((await dragState()).face.x, 0);
  assert.equal((await dragState()).neighbour, null);
  await page.emulateMediaFeatures([]);
  assert.deepEqual(await page.evaluate(() => window.calls()), []);
  console.log(
    'PASS button glide has no upward jump; reduced motion tracks the finger and settles immediately'
  );

  // Page renders replace the shell class. Forcing layout in that window must not collapse the header:
  // that is the upward jump on slow panels, where the flush happens before the header is synced.
  const headerDuringRender = async (label) => {
    const sample = await page.evaluate(() => {
      const card = window.card;
      const shell = card.shadowRoot.querySelector('.shell');
      const face = card.shadowRoot.querySelector('.face');
      const box = (element) => {
        const r = element.getBoundingClientRect();
        return {y: r.y, h: r.height};
      };
      const before = box(face);
      const orig = card._syncDashboardHeader;
      let mid = null;
      card._syncDashboardHeader = function (...args) {
        const header = shell.querySelector('.dashboard-header');
        mid = {
          has: shell.classList.contains('has-header'),
          inline: shell.style.getPropertyValue('--hv-header-height'),
          headerH: header ? header.getBoundingClientRect().height : 0,
          ...box(face)
        };
        return orig.apply(this, args);
      };
      try {
        card._setPage(card._pageIndex === 0 ? 1 : 0);
      } finally {
        card._syncDashboardHeader = orig;
      }
      shell.classList.remove('has-header');
      const stripped = {
        ...box(face),
        headerH: shell.querySelector('.dashboard-header').getBoundingClientRect().height
      };
      return {before, mid, after: box(face), stripped};
    });
    assert.equal(sample.mid.has, true, `${label}: header class survives the shell class rewrite`);
    assert.equal(sample.mid.inline, '44px', `${label}: header height stays pinned`);
    assert.equal(sample.mid.headerH, 44, `${label}: header box stays 44px while rendering`);
    assert.equal(sample.mid.y, sample.before.y, `${label}: page does not jump during render`);
    assert.equal(sample.mid.h, sample.before.h, `${label}: page height stays put during render`);
    assert.equal(
      sample.stripped.y,
      sample.before.y,
      `${label}: losing the class cannot collapse the header`
    );
    assert.equal(
      sample.stripped.headerH,
      44,
      `${label}: pinned height does not depend on the class`
    );
    assert.equal(sample.after.y, sample.before.y, `${label}: page is back in place`);
    console.log(`PASS header stays pinned during page render (${label})`);
  };
  await headerDuringRender('tablet');
  await page.setViewport({width: 390, height: 640, hasTouch: true});
  await page.evaluate(() => {
    window.card.setConfig({...window.card._config, tablet_mode: false, performance: 'lite'});
    window.card.hass = window.mock.hass;
  });
  await page.waitForFunction(
    () =>
      window.card.shadowRoot.querySelector('.dashboard-header')?.getBoundingClientRect().height ===
      44
  );
  await headerDuringRender('small dashboard');
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.evaluate(() => {
    window.card.setConfig({
      ...window.card._config,
      tablet_mode: true,
      home_overview: true,
      show_header: true,
      performance: 'lite'
    });
    window.card.hass = window.mock.hass;
    window.card._setPage(0);
  });
  await page.waitForFunction(
    () =>
      window.card.shadowRoot.querySelector('.home-button') &&
      window.card.shadowRoot.querySelector('.dashboard-header')?.getBoundingClientRect().height ===
        44
  );
  const pull = async (x, y, dy) => {
    await page.evaluate(() => {
      window.fake.now += 1000;
      window.resetCalls();
    });
    await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
    for (let i = 1; i <= 8; i++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{x, y: y + (dy * i) / 8}]
      });
    }
    await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await page.evaluate(() => new Promise(window.requestAnimationFrame));
  };
  const homeState = () =>
    page.evaluate(() => {
      const shell = window.card.shadowRoot.querySelector('.shell').getBoundingClientRect();
      return {
        page: window.card._pageIndex,
        home: window.card._screensaver?.active?.entry?.type || null,
        calls: window.calls(),
        shellTop: shell.top,
        shellHeight: shell.height,
        edge: window.card._gesture?.homeEdge ?? null
      };
    });
  const spots = await page.evaluate(() => {
    const shell = window.card.shadowRoot.querySelector('.shell').getBoundingClientRect();
    const widget = window.card.shadowRoot.querySelector('.widget').getBoundingClientRect();
    return {
      x: shell.left + shell.width / 2,
      top: shell.top + 60,
      widgetX: widget.left + widget.width / 2,
      widgetY: widget.top + widget.height / 2
    };
  });
  await pull(spots.widgetX, spots.widgetY, 90);
  const fromWidget = await homeState();
  assert.equal(
    fromWidget.home,
    null,
    `a pull from the middle of a tile must not open home (${JSON.stringify(fromWidget)})`
  );
  assert.equal(
    fromWidget.page,
    0,
    `a pull from a tile must not turn the page (${JSON.stringify(fromWidget)})`
  );
  assert.deepEqual(
    fromWidget.calls,
    [],
    `a pull must not toggle a light (${JSON.stringify(fromWidget)})`
  );
  await pull(spots.x, spots.top, 100);
  const fromTop = await homeState();
  assert.equal(
    fromTop.home,
    'home',
    `a downward swipe from the top of a 480px display opens the home summary (${JSON.stringify(fromTop)})`
  );
  assert.equal(fromTop.page, 0, `opening home must not turn the page (${JSON.stringify(fromTop)})`);
  assert.deepEqual(
    fromTop.calls,
    [],
    `opening home must not call a service (${JSON.stringify(fromTop)})`
  );
  await page.evaluate(() => window.card._screensaver?.idle?.wake('api'));
  await page.waitForFunction(() => !window.card.shadowRoot.querySelector('.hv-screensaver'));
  await swipe('.dashboard-header', -100);
  assert.equal(await index(), 1, 'a sideways swipe from the header still turns the page');
  console.log(
    'PASS a downward swipe from the top of a 480px display opens home and does not page or toggle'
  );
  await page.screenshot({path: '/tmp/houseview-dashboard-swipe.png'});
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
