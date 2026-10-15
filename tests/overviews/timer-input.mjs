#!/usr/bin/env node
/* global document, window, getComputedStyle, card, mount */
// Real-input behaviour of the timer display (an event overview, docs/overview-api.md): the dist
// bundle in a real browser, a mock hass that records service calls, a fake clock for the shared 1 s ticker and a
// real mouse and keyboard through puppeteer. Run it with:
//
//   npm run build:dev && npm run test:overviews:timer          [--page=tests/overviews/timer-input.html] [--timeout=ms]
//
// The host page (timer-input.html) mounts <houseview-card> with two light widgets, a timer widget and the config under
// test. Nothing here contacts Home Assistant.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer} from '../../tools/serve.mjs';
import {CHROME} from '../../tools/run-tests.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const option = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const pagePath = option('page', 'tests/overviews/timer-input.html');

const server = await startServer({root, port: 0});
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox']
});
let ok = 0;
let failed = 0;
let browserErrors = 0;
const check = (name, condition, detail = '') => {
  console.log(condition ? 'PASS' : 'FAIL', name, condition ? '' : detail);
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
  const setTimer = (state, o) => page.evaluate((s, x) => window.setTimer(s, x), state, o);
  const layer = () => page.evaluate(() => window.probe.layer());
  const layerState = async () => (await layer())?.state ?? null;
  const calls = () => page.evaluate(() => window.calls());
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const probe = (name) => page.evaluate((n) => window.probe[n](), name);
  /** m:ss (or h:mm:ss) to seconds. */
  const seconds = (text) => text.split(':').reduce((n, part) => n * 60 + Number(part), 0);
  const lightTile = () =>
    page.evaluate(() => {
      const r = card.shadowRoot
        .querySelector('button[data-action="light"][data-entity="light.a"]')
        .getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    });
  const clickLight = async () => {
    const {x, y} = await lightTile();
    await page.mouse.click(x, y);
  };
  /** The page underneath: which page, which screen, what the tiles look like. */
  const underneath = () =>
    page.evaluate(() => ({
      index: card._pageIndex,
      key: card._screenKey,
      html: card.shadowRoot
        .querySelector('.face')
        .outerHTML.replace(/(data-timer="[^"]*">)[^<]*/g, '$1#'), // the covered tile catches up on wake
      countdown: card.shadowRoot.querySelector('[data-timer]')?.textContent
    }));

  const both = [
    {type: 'weather', entity: 'weather.test', idle_timeout: 600},
    {type: 'timer', entity: 'timer.kitchen'}
  ];

  // (a) the timer is idle: nothing is shown and nothing is added to the page
  await page.evaluate((c) => mount(c), both);
  await advance(30);
  await sleep(100);
  check('(a) timer idle: no layer', (await layer()) === null);
  check(
    '(a) timer idle: no layer element, no stray overview node',
    await page.evaluate(
      () => !card.shadowRoot.querySelector('.hv-screensaver, .ov-timer-scene, .ov-scene')
    )
  );

  // (b) the timer starts: a NEW state object, as in Home Assistant
  await setTimer('active', {left: 900, total: 900});
  await sleep(80);
  const shown = await layer();
  check(
    '(b) the display is up as soon as hass says active, over the page',
    shown?.state === 'on' && shown.timer && !shown.weather
  );
  check('(b) exactly one layer', (await probe('layers')) === 1);
  check(
    '(b) the layer is a modal dialog covering the shell',
    await page.evaluate(() => {
      const l = card.shadowRoot.querySelector('.hv-screensaver');
      return (
        l.getAttribute('role') === 'dialog' &&
        l.getAttribute('aria-modal') === 'true' &&
        l === l.parentNode.lastElementChild
      );
    })
  );
  const sceneBg = await probe('background');
  check(
    `(b) the display is pure black (${sceneBg}) and covers the whole layer`,
    /^rgb\(0, 0, 0\)$|^rgba\(0, 0, 0, 1\)$/.test(sceneBg) &&
      (await page.evaluate(() => {
        const l = card.shadowRoot.querySelector('.hv-screensaver').getBoundingClientRect();
        const s = card.shadowRoot.querySelector('.ov-timer-scene').getBoundingClientRect();
        return l.width === s.width && l.height === s.height;
      }))
  );
  check('(b) the ring has 60 ticks', (await probe('ticks')) === 60);
  await advance(1);
  const t1 = await probe('time');
  const lit1 = await probe('lit');
  check(`(b) the countdown shows 14:59 after one second (${t1})`, t1 === '14:59');
  check(
    `(b) caption says 15 MIN (${await probe('caption')})`,
    (await probe('caption')) === '15 MIN'
  );
  check(`(b) lit ticks = ceil(60 * 899 / 900) = 60 (${lit1})`, lit1 === 60);
  await advance(3);
  const t2 = await probe('time');
  check(`(b) the countdown moves every second (${t1} -> ${t2})`, seconds(t1) - seconds(t2) === 3);
  await advance(446); // 450 s used of 900
  check(
    `(b) halfway: ${await probe('time')} left, ${await probe('lit')} of 60 ticks lit`,
    (await probe('time')) === '7:30' && (await probe('lit')) === 30
  );
  await advance(450 - 5);
  check(
    `(b) five seconds from the end: ${await probe('time')}, ${await probe('lit')} tick(s) lit`,
    (await probe('time')) === '0:05' && (await probe('lit')) === 1
  );
  // put it back at ten minutes to carry on
  await setTimer('active', {left: 656, total: 900});
  await advance(1);
  check(
    `(b) the reference picture: 10:55 and 44 ticks (${await probe('time')}, ${await probe('lit')})`,
    (await probe('time')) === '10:55' && (await probe('lit')) === 44
  );

  // (c) a tap dismisses it and presses nothing
  const before = await underneath();
  await page.evaluate(() => window.resetCalls());
  await clickLight();
  check('(c) the first tap: no service call', (await calls()).length === 0);
  check('(c) the layer is leaving (still catching taps)', (await layerState()) === 'leaving');
  await clickLight();
  check('(c) a tap during the fade is swallowed too', (await calls()).length === 0);
  await sleep(450);
  check('(c) the layer is gone after the fade', (await layer()) === null);
  const after = await underneath();
  const firstDifference = (a, b) => {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return `index ${before.index}->${after.index}, key ${before.key}->${after.key}, first markup difference at ${i}: ${JSON.stringify(a.slice(Math.max(0, i - 60), i + 80))} vs ${JSON.stringify(b.slice(Math.max(0, i - 60), i + 80))}`;
  };
  check(
    '(c) the dashboard underneath is unchanged (page, screen, markup)',
    after.index === before.index && after.key === before.key && after.html === before.html,
    firstDifference(before.html, after.html)
  );
  check(
    `(c) the covered timer tile caught up with the clock on wake (${before.countdown} -> ${after.countdown})`,
    after.countdown === '10:55'
  );
  check('(c) no service call was made at all', (await calls()).length === 0);
  check(
    '(c) the timer keeps running',
    await page.evaluate(() => window.mock.hass.states['timer.kitchen'].state === 'active')
  );

  // (d) still running: it does not come back, however long we wait and however many updates arrive
  for (let i = 0; i < 5; i++) {
    await advance(6);
    await page.evaluate(() => {
      card.hass = {...window.mock.hass};
    });
  }
  await sleep(100);
  check('(d) it stays away for 30 s of ticks and hass updates', (await layer()) === null);
  await setTimer('active', {left: 600, total: 900}); // a changed state object, still running
  await sleep(100);
  check('(d) a new state object while running does not bring it back', (await layer()) === null);

  // (e) idle, then active again: it comes back (and Escape dismisses and returns focus)
  await setTimer('idle');
  await advance(2);
  await sleep(100);
  check('(e) idle: nothing', (await layer()) === null);
  await page.evaluate(() =>
    card.shadowRoot.querySelector('button[data-action="light"][data-entity="light.b"]').focus()
  );
  await setTimer('active', {left: 300, total: 300});
  await sleep(120);
  check('(e) it comes back when the timer starts again', (await layerState()) === 'on');
  check('(e) a five minute timer says 5 MIN', (await probe('caption')) === '5 MIN');
  check(
    '(e) focus moved to the dismiss button',
    await page.evaluate(() => card.shadowRoot.activeElement?.classList.contains('ov-dismiss'))
  );
  await page.keyboard.press('Escape');
  await sleep(450);
  check(
    '(e) Escape dismisses it and focus returns to the tile',
    (await layer()) === null &&
      (await page.evaluate(() => card.shadowRoot.activeElement?.dataset.entity)) === 'light.b'
  );
  check('(e) Escape pressed nothing', (await calls()).length === 0);

  // (f) pause: it stays up and says PAUSED
  await setTimer('idle');
  await advance(1);
  await setTimer('active', {left: 656, total: 900});
  await sleep(120);
  check('(f) running again: the display is back', (await layerState()) === 'on');
  await advance(2);
  await setTimer('paused', {left: 654, total: 900});
  await advance(1);
  await sleep(50);
  check('(f) paused: the display stays', (await layerState()) === 'on');
  check(
    `(f) paused: caption says PAUSED (${await probe('caption')})`,
    /PAUSED/.test(await probe('caption')) && /15 MIN/.test(await probe('caption'))
  );
  check(
    `(f) paused: the time is frozen at ${await probe('time')}`,
    (await probe('time')) === '10:54'
  );
  await advance(20);
  check('(f) paused: it does not count down', (await probe('time')) === '10:54');
  await setTimer('active', {left: 654, total: 900});
  await advance(1);
  check(
    `(f) resumed: counting again (${await probe('time')}), no PAUSED`,
    (await probe('time')) === '10:53' && !/PAUSED/.test(await probe('caption'))
  );

  // (g) finishing: the display leaves by itself and the existing alarm still works
  await setTimer('active', {left: 3, total: 900});
  await advance(3);
  await page.evaluate(() => {
    // what Home Assistant does at the end: idle, no finishes_at
    window.mock.replaceState('timer.kitchen', {
      state: 'idle',
      attributes: {friendly_name: 'Kitchen timer', duration: '0:15:00'}
    });
    card.hass = {...window.mock.hass};
  });
  await sleep(500);
  check('(g) the display leaves by itself when the timer finishes', (await layer()) === null);
  check(
    '(g) the existing alarm banner is up',
    await page.evaluate(
      () => card._alarm === true && !!card.shadowRoot.querySelector('.timer-alarm')
    )
  );
  await page.evaluate(() => card.shadowRoot.querySelector('.timer-alarm').click());
  check(
    '(g) tapping the banner dismisses the alarm',
    await page.evaluate(
      () => card._alarm === false && !card.shadowRoot.querySelector('.timer-alarm')
    )
  );
  await setTimer('active', {left: 600, total: 600});
  await sleep(120);
  check('(g) a new run after the alarm shows the display again', (await layerState()) === 'on');
  // cancelled while shown
  await setTimer('idle');
  await sleep(500);
  check('(g) cancelling a running timer removes the display', (await layer()) === null);
  check('(g) no alarm for a cancel', await page.evaluate(() => card._alarm === false));
  // the timer disappears altogether
  await setTimer('active', {left: 600, total: 600});
  await sleep(120);
  check('(g) running again: shown', (await layerState()) === 'on');
  await page.evaluate(() => {
    window.mock.replaceState('timer.kitchen', {state: 'unavailable', attributes: {}});
    card.hass = {...window.mock.hass};
  });
  await sleep(500);
  check('(g) the timer going unavailable removes the display', (await layer()) === null);

  // (h) an idle screensaver is on screen when the timer starts: the timer replaces it
  await page.evaluate(() =>
    mount([
      {type: 'weather', entity: 'weather.test', idle_timeout: 10},
      {type: 'timer', entity: 'timer.kitchen'}
    ])
  );
  await advance(10);
  await sleep(100);
  const idleLayer = await layer();
  check(
    '(h) the weather screensaver is up after the idle timeout',
    idleLayer?.state === 'on' && idleLayer.weather
  );
  await setTimer('active', {left: 900, total: 900});
  await sleep(120);
  const replaced = await layer();
  check('(h) starting the timer replaces it', replaced?.timer === true && !replaced.weather);
  check('(h) there is only one layer', (await probe('layers')) === 1);
  await page.mouse.click(400, 300);
  await sleep(450);
  check(
    '(h) a tap dismisses it and presses nothing',
    (await layer()) === null && (await calls()).length === 0
  );
  await sleep(300);
  await advance(1);
  await clickLight();
  check(
    '(h) the next tap reaches the tile',
    JSON.stringify(await calls()) === '["light:toggle:light.a"]',
    JSON.stringify(await calls())
  );

  // (i) blockers: gallery, alarm; a pending service call does not block
  await page.evaluate((c) => mount(c), both);
  await page.evaluate(() => {
    card._galleryOpen = true;
  });
  await setTimer('active', {left: 900, total: 900});
  await advance(5);
  await sleep(100);
  check('(i) camera gallery open: the display does not show', (await layer()) === null);
  await page.evaluate(() => {
    card._galleryOpen = false;
  });
  await advance(1);
  await sleep(120);
  check(
    '(i) it shows as soon as the gallery closes (the timer is still running)',
    (await layerState()) === 'on'
  );
  await page.evaluate((c) => mount(c), both);
  await page.evaluate(() => {
    card._alarm = true;
  });
  await setTimer('active', {left: 900, total: 900});
  await advance(3);
  await sleep(100);
  check('(i) timer alarm up: the display does not show', (await layer()) === null);
  await page.evaluate((c) => mount(c), both);
  await page.evaluate(() => card._pending.add('light.a'));
  await setTimer('active', {left: 900, total: 900});
  await sleep(120);
  check('(i) a pending service call does not hold it back', (await layerState()) === 'on');
  await page.evaluate(() => card._pending.delete('light.a'));
  await page.evaluate((c) => mount(c, {editMode: true}), both);
  await setTimer('active', {left: 900, total: 900});
  await advance(3);
  await sleep(100);
  check('(i) edit mode: the display does not show', (await layer()) === null);

  // (j) only the timer entry: idle time never starts it
  await page.evaluate(() => mount({type: 'timer', entity: 'timer.kitchen', idle_timeout: 5}));
  await advance(600);
  await sleep(100);
  check(
    '(j) timer-only config, timer idle: ten minutes of idle time show nothing',
    (await layer()) === null
  );
  check(
    '(j) it is armed, with one event entry',
    await page.evaluate(
      () => card._screensaver?.entries.length === 1 && card._screensaver.entries[0].event === true
    )
  );
  await setTimer('active', {left: 900, total: 900});
  await sleep(120);
  check('(j) timer-only config: shows when the timer runs', (await layerState()) === 'on');
  await page.mouse.click(400, 300);
  await sleep(450);
  await advance(600);
  await sleep(100);
  check('(j) dismissed: ten more minutes of ticks do not bring it back', (await layer()) === null);

  // reduced motion: still swallowed, still dismissed
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await page.evaluate((c) => mount(c), both);
  await setTimer('active', {left: 900, total: 900});
  await sleep(100);
  await page.mouse.click(400, 300);
  await sleep(30);
  check(
    'reduced motion: the first tap is swallowed, nothing is pressed',
    (await calls()).length === 0
  );
  await sleep(300);
  check('reduced motion: removed after the guard', (await layer()) === null);
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'no-preference'}]);

  // viewport shapes: the face is up and inside the screen
  for (const [w, h] of [
    [1280, 800],
    [800, 1280],
    [390, 844]
  ]) {
    await page.setViewport({width: w, height: h});
    await page.evaluate((c) => mount(c), both);
    await setTimer('active', {left: 656, total: 900});
    await sleep(120);
    const fit = await page.evaluate(() => {
      const l = card.shadowRoot.querySelector('.hv-screensaver');
      const r = (sel) => l.querySelector(sel).getBoundingClientRect();
      const stage = r('.ov-timer-stage');
      const time = r('[data-ov="time"]');
      const cap = r('[data-ov="caption"]');
      const view = l.getBoundingClientRect();
      return {
        square: Math.abs(stage.width - stage.height) < 1.5,
        inside:
          stage.left >= view.left - 1 &&
          stage.right <= view.right + 1 &&
          stage.top >= view.top - 1 &&
          stage.bottom <= view.bottom + 1,
        timeInStage: time.left >= stage.left && time.right <= stage.right,
        capBelow: cap.top >= time.bottom - 4,
        centred: Math.abs((time.left + time.right) / 2 - (view.left + view.right) / 2) < 3,
        noScroll: document.documentElement.scrollWidth <= window.innerWidth
      };
    });
    check(
      `${w}x${h}: square stage inside the screen, time centred, caption below, no horizontal scroll (${JSON.stringify(fit)})`,
      Object.values(fit).every(Boolean)
    );
  }
  await page.setViewport({width: 800, height: 600});

  // (l) regressions from the review (D1 to D5)
  const hidden = (h) => page.evaluate((x) => window.setHidden(x), h);
  const jump = (s) => page.evaluate((x) => window.jumpClock(x), s);
  const timerOnly = {type: 'timer', entity: 'timer.kitchen'};
  const dismissLayer = async () => {
    await page.evaluate(() => card.shadowRoot.querySelector('.hv-screensaver .ov-dismiss').click());
    await sleep(450);
  };

  // D1: an 'active' timer whose finishes_at has passed is over: no display for it, not at load, not after a sleep
  await page.evaluate((c) => mount(c), timerOnly);
  await setTimer('active', {left: -600, total: 900});
  await advance(3);
  await sleep(100);
  check('(l1) active but finished 10 min ago (stale hass): no display', (await layer()) === null);
  await setTimer('active', {left: 600, total: 900}); // a genuinely new run
  await sleep(120);
  check('(l1) a new run after that shows it', (await layerState()) === 'on');
  await dismissLayer();
  await page.evaluate((c) => mount(c), timerOnly);
  await setTimer('active', {left: 300, total: 300});
  await sleep(120);
  check('(l1) a running timer shows it (control)', (await layerState()) === 'on');
  await hidden(true);
  check('(l1) the page is hidden: the layer is removed', (await layer()) === null);
  await jump(20 * 60); // the tablet sleeps for 20 minutes; hass is stale (the websocket slept too)
  await hidden(false);
  await advance(3);
  await sleep(120);
  check(
    '(l1) back from sleep with a stale hass: it does not pop up again for the finished timer',
    (await layer()) === null
  );
  await setTimer('idle'); // Home Assistant catches up
  await advance(2);
  check('(l1) then idle arrives: still nothing', (await layer()) === null);
  await page.evaluate((c) => mount(c), timerOnly);
  await setTimer('active', {left: 300, total: 300});
  await sleep(120);
  await hidden(true);
  await hidden(false);
  await advance(2);
  await sleep(120);
  check(
    '(l1) a short hidden spell, the timer still running: the display comes back',
    (await layerState()) === 'on'
  );

  // D2: two timers: the one that was replaced comes back when the replacing one is gone
  const two = [timerOnly, {type: 'timer', entity: 'timer.second'}];
  await page.evaluate((c) => mount(c), two);
  await setTimer('active', {left: 600, total: 900});
  await sleep(120);
  check(
    '(l2) the first timer shows',
    (await layerState()) === 'on' && /^Kitchen timer/.test(await probe('name'))
  );
  await setTimer('active', {left: 120, total: 300, id: 'timer.second'});
  await sleep(120);
  check(
    '(l2) the second timer replaces it',
    (await probe('layers')) === 1 && /^Second timer/.test(await probe('name'))
  );
  await advance(2);
  await setTimer('idle', {total: 300, id: 'timer.second'}); // cancelled
  await advance(1);
  await sleep(150);
  check(
    `(l2) cancelled: the first timer, still running, is back (${await probe('name')})`,
    (await layerState()) === 'on' && /^Kitchen timer/.test(await probe('name'))
  );
  await advance(5);
  await sleep(100);
  check(
    '(l2) and it stays',
    (await probe('layers')) === 1 && /^Kitchen timer/.test(await probe('name'))
  );
  await dismissLayer();
  await advance(5);
  check('(l2) dismissed, it stays away', (await layer()) === null);

  // D2: both start in one hass update: one shows now, the other is not lost
  await page.evaluate((c) => mount(c), two);
  await setTimer('active', {left: 600, total: 900, push: false});
  await setTimer('active', {left: 120, total: 300, id: 'timer.second', push: false});
  await page.evaluate(() => window.pushHass());
  await sleep(120);
  check(
    '(l2) both started in one update: exactly one layer',
    (await probe('layers')) === 1 && (await layerState()) === 'on'
  );
  const firstName = (await probe('name')).split(',')[0];
  const otherName = firstName === 'Kitchen timer' ? 'Second timer' : 'Kitchen timer';
  await setTimer('idle', {
    total: 300,
    id: firstName === 'Kitchen timer' ? 'timer.kitchen' : 'timer.second'
  });
  await advance(1);
  await sleep(150);
  check(
    `(l2) the one shown ends: the other (${otherName}) comes up (${await probe('name')})`,
    (await layerState()) === 'on' && (await probe('name'))?.startsWith(otherName)
  );
  // a tap on the replacing display asks for the page: the replaced one is not forced on the user straight away
  await page.evaluate((c) => mount(c), two);
  await setTimer('active', {left: 600, total: 900});
  await sleep(120);
  await setTimer('active', {left: 120, total: 300, id: 'timer.second'});
  await sleep(120);
  await dismissLayer();
  await advance(3);
  await sleep(100);
  check(
    '(l2) a tap dismisses: the display does not jump to the other timer',
    (await layer()) === null
  );

  // D3: setConfig again with the same config does not undo a dismissal
  await page.evaluate((c) => mount(c), timerOnly);
  await setTimer('active', {left: 900, total: 900});
  await sleep(120);
  await dismissLayer();
  await page.evaluate(() => window.reconfigure());
  await advance(3);
  await sleep(120);
  check(
    '(l3) dismissed, then setConfig with the same config: it stays dismissed',
    (await layer()) === null
  );
  await page.evaluate(() => {
    card.hass = {...window.mock.hass};
  });
  await sleep(100);
  check('(l3) ... and after a hass update', (await layer()) === null);
  await setTimer('idle');
  await advance(1);
  await setTimer('active', {left: 300, total: 300});
  await sleep(120);
  check('(l3) a new run after that shows it again', (await layerState()) === 'on');
  await page.evaluate(() => window.reconfigure());
  await advance(2);
  await sleep(120);
  check(
    '(l3) showing and not dismissed, setConfig with the same config: it is still up',
    (await layerState()) === 'on'
  );
  await page.evaluate(() => window.reconfigure());
  await dismissLayer();
  await page.evaluate(() => window.reconfigure());
  await advance(2);
  await sleep(100);
  check(
    '(l3) a different config (another timer) starts fresh',
    await (async () => {
      await page.evaluate(() =>
        card.setConfig({...window.lastConfig, screensaver: {type: 'timer', entity: 'timer.second'}})
      );
      await setTimer('active', {left: 200, total: 300, id: 'timer.second'});
      await sleep(120);
      return (await layerState()) === 'on' && /^Second timer/.test(await probe('name'));
    })()
  );

  // D5: the card is taken out of the page and put back (a view switch): an undismissed display comes back
  await page.evaluate((c) => mount(c), timerOnly);
  await setTimer('active', {left: 900, total: 900});
  await sleep(120);
  check('(l5) up', (await layerState()) === 'on');
  await page.evaluate(() => window.reattach());
  await advance(3);
  await sleep(150);
  check(
    '(l5) away and back, never dismissed, timer still running: the display is back',
    (await layerState()) === 'on' && (await probe('layers')) === 1
  );
  await dismissLayer();
  await page.evaluate(() => window.reattach());
  await advance(3);
  await sleep(150);
  check('(l5) dismissed, then away and back: it stays dismissed', (await layer()) === null);

  // D4: right to left dashboards: the caption keeps its order ("15 MIN", not "MIN 15")
  await page.evaluate(() => {
    document.documentElement.dir = 'rtl';
  });
  await page.evaluate((c) => mount(c), timerOnly);
  await setTimer('active', {left: 5400, total: 5400});
  await sleep(120);
  const rtl = await page.evaluate(() => {
    const caption = card.shadowRoot.querySelector('.hv-screensaver [data-ov="caption"]');
    const text = caption.firstChild;
    const at = (i) => {
      const range = document.createRange();
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      return range.getBoundingClientRect().left;
    };
    return {
      text: caption.textContent,
      direction: getComputedStyle(caption).direction,
      leftToRight: at(0) < at(text.length - 1)
    };
  });
  check(
    `(l4) RTL page: the caption "${rtl.text}" is laid out left to right (${rtl.direction})`,
    rtl.text === '1 H 30 MIN' && rtl.direction === 'ltr' && rtl.leftToRight
  );
  await page.evaluate(() => {
    document.documentElement.dir = '';
  });
  await hidden(false);

  // (k) 200 create / remove cycles leak nothing
  const baseline = await page.evaluate(() => window.leaks());
  const cycles = await page.evaluate((c) => window.cycle(c, 200), both);
  await sleep(2600); // the subscription grace period is a real 2 s timer
  const leaks = await page.evaluate(() => window.leaks());
  check(`(k) 200 cycles: no fake intervals left (${leaks.intervals})`, leaks.intervals === 0);
  check(
    `(k) 200 cycles: window/document listeners are flat (${cycles.listenersAfterWarmup} after 5 -> ${cycles.listeners} after 200)`,
    cycles.listeners <= cycles.listenersAfterWarmup
  );
  check(
    `(k) 200 cycles: subscriptions all closed (${leaks.subscriptions} open, baseline ${baseline.subscriptions})`,
    leaks.subscriptions === 0
  );
  check(
    `(k) 200 cycles: no timeouts left pending (${leaks.timeouts})`,
    leaks.timeouts === 0,
    JSON.stringify(leaks)
  );
  check(
    '(k) the page itself is empty',
    await page.evaluate(() => document.body.childElementCount === 0)
  );

  check('no console errors or uncaught exceptions during the whole run', browserErrors === 0);
} finally {
  console.log(`\n${ok} checks, ${failed} failed`);
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
