#!/usr/bin/env node
/* global document, window, location, card, mount */
// End to end behaviour of the automatic displays and the priority model (docs/overview-api.md): the dist bundle
// in a real browser with a mock hass that records service calls, Home Assistant's update semantics (a NEW state object,
// a NEW hass object that keeps the connection), a fake clock for the shared 1 s ticker and a real mouse. Run it with:
//
//   npm run build:dev && npm run test:overviews:automatic          [--page=tests/overviews/automatic-input.html] [--timeout=ms]
//
// Scenarios: (a) weather by idle time, (b) cover art by priority, (c) the timer over everything, (d) the opt-outs,
// (e) no `screensaver` block at all, (f) a dashboard without the widgets allocates nothing, (g) 200 create/remove cycles.
// Nothing here contacts Home Assistant.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer} from '../../tools/serve.mjs';
import {CHROME} from '../../tools/run-tests.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const option = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const pagePath = option('page', 'tests/overviews/automatic-input.html');

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
    // the mock media proxy has no pictures: the <img> request 404s, which is not under test
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

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const advance = async (seconds) => {
    await page.evaluate((s) => window.advance(s), seconds);
    await sleep(60);
  };
  const open = (opts) => page.evaluate((o) => mount(o), opts);
  const setTimer = async (state, o) => {
    await page.evaluate((s, x) => window.setTimer(s, x), state, o);
    await sleep(100);
  };
  const setPlayer = async (state, attributes) => {
    await page.evaluate((s, a) => window.setPlayer(s, a), state, attributes);
    await sleep(100);
  };
  const layer = () => page.evaluate(() => window.probe.layer());
  const kind = async () => (await layer())?.kind ?? null;
  const layers = () => page.evaluate(() => window.probe.layers());
  const calls = () => page.evaluate(() => window.calls());
  const tap = async () => {
    await page.mouse.click(400, 300);
    await sleep(450); // the fade is real time
  };
  const underneath = () =>
    page.evaluate(() => ({
      index: card._pageIndex,
      html: card.shadowRoot
        .querySelector('.face')
        .outerHTML.replace(/(data-timer="[^"]*">)[^<]*/g, '$1#')
    }));

  const weather = {type: 'weather', entity: 'weather.home', idle_timeout: 5};
  const both = ['timer', 'music'];

  // ---- (a) idle for 5 s with nothing playing: weather ----
  await open({cards: both, screensaver: weather, player: 'idle'});
  check(
    'dashboard entries: the weather block plus the two implicit ones, in that order',
    JSON.stringify(await page.evaluate(() => window.probe.entries())) ===
      '["weather","timer*","cover_art*"]'
  );
  await advance(4);
  check('(a) 4 s idle: nothing', (await layer()) === null);
  await advance(2);
  check('(a) 5 s idle with nothing playing: weather', (await kind()) === 'weather');
  const before = await underneath();
  await tap();
  check(
    '(a) a tap dismisses it and presses nothing',
    (await layer()) === null && (await calls()).length === 0
  );
  const after = await underneath();
  check(
    '(a) the dashboard underneath is unchanged',
    after.index === before.index && after.html === before.html
  );

  // ---- (b) music with artwork wins by priority ----
  await open({cards: both, screensaver: weather, player: 'playing'});
  await advance(4);
  check('(b) playing: nothing before the idle time is up', (await layer()) === null);
  await advance(2);
  const cover = await layer();
  check(
    '(b) after idle the cover art is shown instead of weather (priority)',
    cover?.kind === 'cover_art'
  );
  check(
    '(b) it shows the track and the proxied artwork',
    cover?.title === 'Questions' &&
      (await page.evaluate(
        (src) => src && new URL(src).pathname + new URL(src).search === window.ART,
        cover?.img
      ))
  );
  check('(b) exactly one layer', (await layers()) === 1);
  await tap();
  check(
    '(b) a tap returns to the dashboard, nothing pressed',
    (await layer()) === null && (await calls()).length === 0
  );
  await advance(4);
  check('(b) it does not come straight back', (await layer()) === null);
  await advance(2);
  check('(b) after the next idle it returns', (await kind()) === 'cover_art');

  await setPlayer('paused');
  await advance(2);
  check('(b) pause keeps it', (await kind()) === 'cover_art');
  await setPlayer('playing');
  await page.evaluate(() => {
    window.imgBefore = card.shadowRoot.querySelector('.hv-screensaver .ov-cover_art-img');
  });
  await setPlayer('playing', {
    media_title: 'Better Place',
    media_artist: 'Gracie Abrams',
    entity_picture: await page.evaluate(() => window.ART_NEXT)
  });
  const next = await layer();
  check('(b) a track change updates the title', next?.title === 'Better Place');
  check(
    '(b) in place: same <img> element, new source, one layer',
    await page.evaluate(
      () =>
        card.shadowRoot.querySelector('.hv-screensaver .ov-cover_art-img') === window.imgBefore &&
        new URL(window.imgBefore.src).search === new URL(window.ART_NEXT, location.href).search
    )
  );
  check('(b) still one layer after the track change', (await layers()) === 1);
  await setPlayer('buffering');
  await advance(1);
  check('(b) the gap between two tracks (buffering) keeps it', (await kind()) === 'cover_art');
  await setPlayer('idle');
  await sleep(450);
  check('(b) stopping the speaker (idle) dismisses it', (await layer()) === null);
  await advance(6);
  check('(b) and the next idle falls back to weather', (await kind()) === 'weather');
  await tap();

  // ---- (c) the timer over weather and over cover art ----
  for (const [name, player, expected] of [
    ['weather', 'idle', 'weather'],
    ['cover art', 'playing', 'cover_art']
  ]) {
    await open({cards: both, screensaver: weather, player});
    await advance(6);
    check(`(c) ${name} is showing`, (await kind()) === expected);
    await setTimer('active', {left: 900, total: 900});
    check(
      `(c) starting the timer while ${name} shows replaces it with the timer display`,
      (await kind()) === 'timer'
    );
    check('(c) one layer only', (await layers()) === 1);
    await page.evaluate(() => window.resetCalls());
    await tap();
    check(
      '(c) a tap returns to the dashboard and presses nothing',
      (await layer()) === null && (await calls()).length === 0
    );
    check(
      '(c) the timer keeps running',
      await page.evaluate(() => window.mock.hass.states['timer.kitchen'].state === 'active')
    );
    await advance(3);
    await setTimer('active', {left: 900, total: 900});
    check('(c) the dismissal sticks while the timer runs', (await layer()) === null);
    await advance(6);
    check(
      `(c) the next idle time still brings the idle screensaver (${expected}) while the timer runs`,
      (await kind()) === expected
    );
    await setTimer('idle');
    await advance(1);
    await setTimer('active', {left: 600, total: 900});
    check('(c) a new run brings the timer display over it', (await kind()) === 'timer');
    await setTimer('idle');
    await sleep(450);
    check('(c) cancelling dismisses the timer display', (await layer()) === null);
    await setTimer('active', {left: 3, total: 900});
    check('(c) running again: shown', (await kind()) === 'timer');
    await advance(3);
    await page.evaluate(() => {
      window.mock.replaceState('timer.kitchen', {
        state: 'idle',
        attributes: {friendly_name: 'Kitchen timer', duration: '0:15:00'}
      }); // what Home Assistant does at the end
      card.hass = {...window.mock.hass};
    });
    await sleep(450);
    check('(c) finishing dismisses it (the alarm banner takes over)', (await layer()) === null);
  }

  // ---- (d) the opt-outs ----
  await open({
    cards: both,
    screensaver: weather,
    player: 'playing',
    config: {timer_display: false}
  });
  await setTimer('active', {left: 900, total: 900});
  check('(d) timer_display: false, timer running: no timer display', (await layer()) === null);
  await advance(6);
  check('(d) the music screensaver still works beside it', (await kind()) === 'cover_art');
  await open({
    cards: both,
    screensaver: weather,
    player: 'playing',
    config: {music_screensaver: false}
  });
  await advance(6);
  check(
    '(d) music_screensaver: false, speaker playing: weather instead',
    (await kind()) === 'weather'
  );
  await tap();
  await setTimer('active', {left: 900, total: 900});
  check('(d) and the timer display still works beside it', (await kind()) === 'timer');
  await open({
    cards: both,
    player: 'playing',
    config: {timer_display: false, music_screensaver: false}
  });
  check(
    '(d) both opt-outs and no screensaver block: nothing allocated',
    !(await page.evaluate(() => window.probe.hasScreensaver()))
  );
  await advance(300);
  await setTimer('active', {left: 900, total: 900});
  check('(d) and nothing ever shows', (await layer()) === null);

  // ---- (e) no screensaver block ----
  await open({cards: ['timer']});
  check(
    '(e) a timer tile and no screensaver block: one implicit entry',
    JSON.stringify(await page.evaluate(() => window.probe.entries())) === '["timer*"]'
  );
  await advance(600);
  check('(e) ten minutes of idle time show nothing', (await layer()) === null);
  await setTimer('active', {left: 900, total: 900});
  check('(e) the timer display comes up when the timer runs', (await kind()) === 'timer');
  await page.evaluate(() => window.resetCalls());
  await tap();
  check(
    '(e) a tap dismisses it and presses nothing',
    (await layer()) === null && (await calls()).length === 0
  );
  await advance(600);
  check('(e) it stays away', (await layer()) === null);
  await open({cards: ['music'], player: 'playing'});
  check(
    '(e) a music card and no screensaver block: one implicit idle entry',
    JSON.stringify(await page.evaluate(() => window.probe.entries())) === '["cover_art*"]'
  );
  await advance(4);
  check('(e) 4 s: nothing yet', (await layer()) === null);
  await advance(2);
  check(
    '(e) the music widget is on the visible page: the cover art after 5 s',
    (await kind()) === 'cover_art'
  );
  await tap();
  check('(e) a tap returns to the dashboard', (await layer()) === null);
  await open({cards: ['music'], player: 'paused'});
  await advance(130);
  check(
    '(e) a paused speaker: nothing shows (not eligible, no other entry)',
    (await layer()) === null
  );
  await setPlayer('playing');
  await advance(130);
  check('(e) playing, after the idle time: the cover art', (await kind()) === 'cover_art');

  // ---- (f) no timer or media widgets and no screensaver allocates nothing ----
  await page.evaluate(() => mount({cards: []}));
  const baseline = await page.evaluate(() => window.leaks());
  check(
    '(f) lights only: no screensaver state',
    !(await page.evaluate(() => window.probe.hasScreensaver()))
  );
  const shellBefore = await page.evaluate(() => window.probe.shellChildren());
  await advance(900);
  check(
    '(f) 15 minutes later: no layer, no stray node in the shell',
    (await layer()) === null &&
      (await page.evaluate(() => window.probe.shellChildren())) === shellBefore
  );
  const dashboard = await page.evaluate(() => ({
    layers: card.shadowRoot.querySelectorAll('.hv-screensaver').length,
    overviews: card.shadowRoot.querySelectorAll('.ov-scene').length
  }));
  check('(f) not a single overview node', dashboard.layers === 0 && dashboard.overviews === 0);
  await page.evaluate(() =>
    mount({cards: ['timer', 'music'], config: {timer_display: false, music_screensaver: false}})
  );
  const optedOut = await page.evaluate(() => window.leaks());
  check(
    `(f) the opted-out timer and music dashboard registers no more intervals than lights only (${baseline.intervals} / ${optedOut.intervals})`,
    optedOut.intervals <= baseline.intervals
  );
  await page.evaluate(() => document.body.replaceChildren());
  await sleep(200);

  // ---- (g) 200 create / remove cycles ----
  const base = await page.evaluate(() => window.leaks());
  const cycle = await page.evaluate((c) => window.cycle(200, c), {
    cards: both,
    screensaver: weather
  });
  await sleep(2400); // the subscription grace period
  const end = await page.evaluate(() => window.leaks());
  check(
    `(g) 200 cycles: no fake intervals left (${end.intervals}, baseline ${base.intervals})`,
    end.intervals === base.intervals
  );
  check(
    `(g) 200 cycles: window/document listeners are flat (${cycle.listenersAfterWarmup} after 5 -> ${cycle.listeners} after 200)`,
    cycle.listeners <= cycle.listenersAfterWarmup && cycle.listeners === base.listeners
  );
  check(
    `(g) 200 cycles: no timeouts left pending (${end.timeouts})`,
    end.timeouts === base.timeouts
  );
  check(
    `(g) 200 cycles: every subscription closed (${end.subscriptions} open)`,
    end.subscriptions === 0
  );
  check(
    '(g) the page itself is empty',
    await page.evaluate(() => document.body.children.length === 0)
  );
  const cycleNoSaver = await page.evaluate((c) => window.cycle(200, c), {cards: both});
  await sleep(2400);
  const end2 = await page.evaluate(() => window.leaks());
  check(
    `(g) 200 cycles without a screensaver block (implicit entries only): flat (${end2.intervals} intervals, ${end2.listeners} listeners, ${end2.timeouts} timeouts, ${end2.subscriptions} subscriptions)`,
    end2.intervals === base.intervals &&
      end2.listeners === base.listeners &&
      end2.timeouts === base.timeouts &&
      end2.subscriptions === 0 &&
      cycleNoSaver.listeners <= cycleNoSaver.listenersAfterWarmup
  );

  check('no console errors or uncaught exceptions during the whole run', browserErrors === 0);
} finally {
  await browser.close();
  await server.close?.();
}

console.log(`\n${ok} checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
