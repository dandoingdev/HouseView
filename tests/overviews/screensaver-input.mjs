#!/usr/bin/env node
/* global document, window, Event, card, mount */
// Real-input behaviour of the screensaver (docs/overview-api.md): a real mouse and keyboard through
// puppeteer, the dist bundle, and a fake clock for the idle timer. Run it with:
//
//   npm run build:dev && npm run test:overviews:input          [--page=tests/overviews/input.html] [--timeout=ms]
//
// The host page (input.html) mounts <houseview-card> with two light widgets and a mock hass. This script holds the
// scenarios and the assertions, which are the contract; everything it needs to know about the scene itself comes
// from the page's `probe`. Nothing here contacts Home Assistant.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer} from '../../tools/serve.mjs';
import {CHROME} from '../../tools/run-tests.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const option = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const pagePath = option('page', 'tests/overviews/input.html');

const server = await startServer({root, port: 0});
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox']
});
let ok = 0;
let failed = 0;
let browserErrors = 0;
const check = (name, condition) => {
  console.log(condition ? 'PASS' : 'FAIL', name);
  ok++;
  if (!condition) failed++;
};

try {
  const page = await browser.newPage();
  await page.setViewport({width: 800, height: 600});
  page.on('console', (m) => {
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) {
      console.log('[console.error]', m.text());
      browserErrors++;
      failed++;
    }
  });
  page.on('pageerror', (e) => {
    console.log('[pageerror]', e.message);
    browserErrors++;
    failed++;
  });
  await page.goto(`${server.url}/${pagePath}`);
  await page.waitForFunction('window.ready === true', {timeout: Number(option('timeout', 30000))});

  const advance = (seconds) => page.evaluate((s) => window.advance(s), seconds);
  const layerState = () =>
    page.evaluate(() => card.shadowRoot.querySelector('.hv-screensaver')?.dataset.state ?? null);
  const calls = () => page.evaluate(() => window.calls());
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const probe = (name, ...args) => page.evaluate((n, a) => window.probe[n](...a), name, args);
  /** Centre of the first light widget, in page coordinates. */
  const tile = () =>
    page.evaluate(() => {
      const r = card.shadowRoot
        .querySelector('button[data-action="light"][data-entity="light.a"]')
        .getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    });
  const click = async () => {
    const {x, y} = await tile();
    await page.mouse.click(x, y);
  };
  const config = {type: 'weather', entity: 'weather.test', idle_timeout: 10};

  // 1 default: no config -> nothing at all
  await page.evaluate(() => mount(undefined));
  check(
    'no screensaver config: no state, no sessions, no layer',
    await page.evaluate(
      () =>
        card._screensaver === null &&
        !card._overviewSessions &&
        !card.shadowRoot.querySelector('.hv-screensaver')
    )
  );
  const stripped = (html) => html.replace(/blob:[^"']+/g, 'blob:');
  const baseline = stripped(await page.evaluate(() => card.shadowRoot.innerHTML));
  await page.evaluate((c) => mount([{...c, enabled: false}]), config);
  check(
    'a disabled screensaver changes nothing: shadow root HTML identical, no state',
    stripped(await page.evaluate(() => card.shadowRoot.innerHTML)) === baseline &&
      (await page.evaluate(() => card._screensaver === null))
  );

  // 2 activation at exactly the timeout, then the swallowed first tap
  await page.evaluate((c) => mount(c), config);
  await advance(9);
  check('not active at 9 s', (await layerState()) === null);
  await advance(1);
  await sleep(80);
  check('active at 10 s, fades in', (await layerState()) === 'on');
  check(
    'layer is the last child of the shell, a modal dialog with a dismiss button',
    await page.evaluate(() => {
      const l = card.shadowRoot.querySelector('.hv-screensaver');
      return (
        l.parentNode.classList.contains('shell') &&
        l === l.parentNode.lastElementChild &&
        l.getAttribute('role') === 'dialog' &&
        l.getAttribute('aria-modal') === 'true' &&
        l.querySelector('.ov-dismiss').getAttribute('aria-label') === 'Dismiss screensaver'
      );
    })
  );
  check('the scene is populated', await probe('sceneReady'));
  check(
    'the layer, not a tile, is under the finger',
    await (async () => {
      const {x, y} = await tile();
      return page.evaluate(
        ([px, py]) => card.shadowRoot.elementFromPoint(px, py)?.classList.contains('ov-dismiss'),
        [x, y]
      );
    })()
  );

  // 2b a hass update patches the scene in place, and the clock ticks without a re-render
  const humidity = await probe('bumpHumidity');
  check(
    'a hass update patches the scene in place',
    humidity === '55%' && (await probe('sameSceneNode'))
  );
  await probe('followClock');
  await advance(1);
  const t0 = await probe('timeText');
  await advance(40);
  const t1 = await probe('timeText');
  check(
    `the tick hook advances the clock (${t0} -> ${t1})`,
    t0.startsWith('10:09') && t1.startsWith('10:10')
  );

  const faceBefore = await page.evaluate(() => card.shadowRoot.querySelector('.face').outerHTML);
  await click();
  check('first tap: no action under the layer', (await calls()).length === 0);
  check('layer is leaving (still catching taps)', (await layerState()) === 'leaving');
  check(
    'the layer still covers the tile during the fade',
    await (async () => {
      const {x, y} = await tile();
      return page.evaluate(
        ([px, py]) => card.shadowRoot.elementFromPoint(px, py)?.classList.contains('ov-dismiss'),
        [x, y]
      );
    })()
  );
  await click();
  check('a tap during the fade is swallowed too', (await calls()).length === 0);
  await sleep(450);
  check('layer removed after the fade', (await layerState()) === null);
  check(
    'the page under it is untouched',
    (await page.evaluate(() => card.shadowRoot.querySelector('.face').outerHTML)) === faceBefore
  );
  await sleep(300);
  await advance(1); // past the click-suppress window
  await click();
  check('the second tap reaches the tile', JSON.stringify(await calls()) === '["light:light.a"]');

  // 2c the page underneath is where it was: dismissal never navigates
  await page.evaluate((c) => mount(c), config);
  await page.evaluate(() => card._setPage(1));
  await sleep(380);
  const pageTwo = await page.evaluate(() => ({index: card._pageIndex, key: card._screenKey}));
  const pageTwoFace = await page.evaluate(() => card.shadowRoot.querySelector('.face').outerHTML);
  await advance(10);
  await sleep(100);
  check('the screensaver also covers a page other than the first', (await layerState()) === 'on');
  await page.mouse.click(400, 300);
  await sleep(450);
  check(
    'page index unchanged after dismissal',
    (await layerState()) === null &&
      (await page.evaluate(() => card._pageIndex)) === pageTwo.index &&
      (await page.evaluate(() => card._screenKey)) === pageTwo.key &&
      (await page.evaluate(() => card.shadowRoot.querySelector('.face').outerHTML)) ===
        pageTwoFace &&
      (await calls()).length === 0
  );

  // 3 a swipe on the layer wakes it and never turns pages
  await page.evaluate((c) => mount(c), config);
  await advance(10);
  await sleep(400);
  const pageBefore = await page.evaluate(() => card._pageIndex);
  await page.mouse.move(100, 300);
  await page.mouse.down();
  await page.mouse.move(300, 300, {steps: 5});
  await page.mouse.up();
  check(
    'swipe wakes but never reaches the controller',
    (await calls()).length === 0 &&
      (await layerState()) === 'leaving' &&
      (await page.evaluate(() => card._pageIndex)) === pageBefore
  );

  // 4 keyboard and focus
  await page.evaluate((c) => {
    mount(c);
  }, config);
  await page.evaluate(() => card.shadowRoot.querySelector('button[data-action="light"]').focus());
  await advance(10);
  await sleep(400);
  check(
    'focus moved to the dismiss button',
    await page.evaluate(() => card.shadowRoot.activeElement?.classList.contains('ov-dismiss'))
  );
  await page.keyboard.press('ArrowRight');
  check(
    'arrow keys do not turn the page under the layer',
    (await calls()).length === 0 && (await page.evaluate(() => card._pageIndex)) === pageBefore
  );
  await page.keyboard.press('Tab');
  check(
    'Tab keeps focus on the dismiss button',
    await page.evaluate(() => card.shadowRoot.activeElement?.classList.contains('ov-dismiss'))
  );
  await page.keyboard.press('Escape');
  await sleep(450);
  check(
    'Escape dismisses and focus returns to the tile',
    (await layerState()) === null &&
      (await page.evaluate(() => card.shadowRoot.activeElement?.dataset.entity)) === 'light.a'
  );
  await advance(10);
  await sleep(400);
  await page.keyboard.press('Space');
  await sleep(450);
  check(
    'Space dismisses too and fires no action',
    (await layerState()) === null && (await calls()).length === 0
  );

  // 5 blockers: gallery, pending service call, alarm, edit mode, card preview, the editor
  await page.evaluate((c) => mount(c), config);
  await page.evaluate(() => card._pending.add('light.a'));
  await advance(60);
  check('a service call in flight: never activates', (await layerState()) === null);
  await page.evaluate(() => card._pending.delete('light.a'));
  await advance(9);
  check('the timeout restarts when the call has finished', (await layerState()) === null);
  await advance(1);
  await sleep(80);
  check('then it activates after a pending call', (await layerState()) === 'on');
  await page.evaluate((c) => mount(c), config);
  await page.evaluate(() => {
    card._galleryOpen = true;
  });
  await advance(60);
  check('gallery open: never activates', (await layerState()) === null);
  await page.evaluate(() => {
    card._galleryOpen = false;
  });
  await advance(9);
  check('the timeout restarts after the blocker clears', (await layerState()) === null);
  await advance(1);
  await sleep(80);
  check('then it activates', (await layerState()) === 'on');
  await page.evaluate(() => {
    card._alarm = true;
  });
  await advance(1);
  await sleep(300);
  check('the alarm wakes an active layer', (await layerState()) !== 'on');
  await page.evaluate((c) => mount(c, {editMode: true}), config);
  await advance(60);
  check('edit mode (hui-card-options ancestor): never activates', (await layerState()) === null);
  await page.evaluate((c) => mount(c, {editMode: true, editHost: 'hui-card-preview'}), config);
  await advance(60);
  check('card preview (hui-card-preview ancestor): never activates', (await layerState()) === null);
  check(
    'the editor: the carousel editor with a screensaver config never creates a layer',
    await (async () => {
      await page.evaluate(async (c) => {
        await mount(undefined);
        const editor = await card.constructor.getConfigElement();
        editor.hass = window.mock.hass;
        editor.setConfig({type: 'custom:houseview-card', cards: [], screensaver: c});
        document.body.append(editor);
      }, config);
      await advance(60);
      return page.evaluate(
        () =>
          !document
            .querySelector('houseview-editor')
            ?.shadowRoot?.querySelector('.hv-screensaver') &&
          !card.shadowRoot.querySelector('.hv-screensaver')
      );
    })()
  );
  check(
    'the editor: a list of two screensavers says so, with the number filled in',
    await page.evaluate(async (c) => {
      await mount(undefined);
      const editor = await card.constructor.getConfigElement();
      editor.hass = window.mock.hass;
      editor.setConfig({type: 'custom:houseview-card', cards: [], screensaver: [c, c]});
      document.body.append(editor);
      const note = [...editor.shadowRoot.querySelectorAll('*')].find((e) =>
        e.textContent.startsWith('This card has')
      );
      return /^This card has 2 screensavers\./.test(note?.textContent ?? '');
    }, config)
  );
  await page.evaluate((c) => mount(c, {editMode: true}), config);
  await page.evaluate(() => {
    card._screensaver.entries[0].startInEditMode = true;
  });
  await advance(10);
  await sleep(80);
  check('start_in_edit_mode overrides', (await layerState()) === 'on');

  // 6 a hidden page removes the layer at once
  await page.evaluate((c) => mount(c), config);
  await advance(10);
  await sleep(300);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  check('a hidden page removes the layer at once', (await layerState()) === null);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => false});
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // 7 rotation and preview
  await page.evaluate(() =>
    mount([
      {type: 'weather', entity: 'weather.test', idle_timeout: 10},
      {type: 'weather', entity: 'weather.test', idle_timeout: 10, details: ['wind']}
    ])
  );
  await advance(10);
  await sleep(300);
  const first = await probe('detailCount');
  await click();
  await sleep(450);
  await advance(10);
  await sleep(300);
  const second = await probe('detailCount');
  check(
    `rotation shows the next entry (${first} details, then ${second})`,
    second === 1 && first > 1
  );
  await page.evaluate((c) => mount({...c, preview: true}), config);
  await sleep(100);
  check('preview: shows immediately', (await layerState()) === 'on');

  // 8 reduced motion: no fade, but the guard still swallows the tap
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await page.evaluate((c) => mount(c), config);
  await advance(10);
  await sleep(50);
  await click();
  await sleep(40);
  check(
    'reduced motion: still swallowed during the guard',
    (await layerState()) === 'leaving' && (await calls()).length === 0
  );
  await sleep(250);
  check('reduced motion: removed after the guard', (await layerState()) === null);
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'no-preference'}]);

  // 9 dispose: the layer is gone and the shared ticker has nobody left
  await page.evaluate((c) => mount(c), config);
  await advance(10);
  await page.evaluate(() => card.remove());
  check(
    'disconnect: layer gone, ticker unsubscribed',
    await page.evaluate(() => window.intervals.size === 0)
  );
  check('no console errors or uncaught exceptions during the whole run', browserErrors === 0);
} finally {
  console.log(`\n${ok} checks, ${failed} failed`);
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
