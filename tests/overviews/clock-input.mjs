#!/usr/bin/env node
/* global window, document, getComputedStyle, CSS */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {startServer} from '../../tools/serve.mjs';
import {CHROME} from '../../tools/run-tests.mjs';
const server = await startServer({root: process.cwd(), port: 0});
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox']
});
try {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.goto(`${server.url}/tests/overviews/input.html`);
  await page.waitForFunction('window.ready === true');
  await page.mouse.click(1, 1);
  await page.evaluate(() => {
    window.card?.remove();
    window.clockCalls = [];
    const card = document.createElement('houseview-card');
    window.card = card;
    window.clockHass = {
      states: {'light.test': {state: 'off', attributes: {friendly_name: 'Light'}}},
      locale: {language: 'en-GB', time_zone: 'server', time_format: '24'},
      config: {time_zone: 'Europe/London'},
      callService: async (...args) => window.clockCalls.push(args)
    };
    window.clockConfig = {
      tablet_mode: true,
      performance: 'lite',
      preview_time: '2025-10-01T09:09:30Z',
      widgets: [{type: 'light', entity: 'light.test'}],
      screensaver: {type: 'clock', preview: true, face: 'bold'}
    };
    card.setConfig(window.clockConfig);
    card.hass = window.clockHass;
    document.body.replaceChildren(card);
  });
  await page.waitForSelector('houseview-card >>> .ov-clock-board');
  await new Promise((r) => setTimeout(r, 450));
  const probe = () =>
    page.evaluate(() => {
      const r = window.card.shadowRoot,
        b = r.querySelector('.ov-clock-board'),
        box = (e) => {
          const x = e.getBoundingClientRect();
          return {x: x.x, y: x.y, w: x.width, h: x.height, b: x.bottom, right: x.right};
        };
      return {
        board: box(b),
        scene: box(r.querySelector('.ov-clock-scene')),
        date: r.querySelector('.ov-clock-date').textContent,
        label: b.getAttribute('aria-label'),
        hour: r.querySelector('.ov-clock-hour').style.transform,
        minute: r.querySelector('.ov-clock-minute').style.transform,
        second: r.querySelector('.ov-clock-second').style.transform,
        sweep: r.querySelector('.ov-clock-second').hasAttribute('data-sweep'),
        delay: r.querySelector('.ov-clock-second').style.getPropertyValue('--clock-second-delay'),
        background: getComputedStyle(r.querySelector('.ov-clock-backdrop')).backgroundColor
      };
    });
  let s = await probe();
  assert.equal(s.board.w, 480);
  assert.equal(s.board.h, 480);
  assert.equal(s.date, 'WED 1');
  assert.equal(s.hour, 'rotate(304.75deg)');
  assert.equal(s.minute, 'rotate(57deg)');
  assert.equal(s.sweep, true);
  assert.equal(s.second, '');
  assert.equal(s.delay, '-30s');
  for (const [wallpaper, expected] of [
    ['teal', 'rgb(12, 85, 85)'],
    ['silver', 'rgb(129, 133, 132)'],
    ['champagne', 'rgb(150, 125, 104)']
  ]) {
    await page.evaluate((wallpaper) => {
      window.card.setConfig({...window.clockConfig, wallpaper});
      window.advance(1);
    }, wallpaper);
    assert.equal((await probe()).background, expected);
  }
  await page.evaluate(() => {
    window.card.setConfig({
      ...window.clockConfig,
      wallpaper: 'teal',
      screensaver: {...window.clockConfig.screensaver, background_color: [224, 188, 185]}
    });
    window.advance(1);
  });
  assert.equal((await probe()).background, 'rgb(224, 188, 185)');
  await page.evaluate(() => {
    window.card.setConfig({
      ...window.clockConfig,
      wallpaper: 'teal',
      screensaver: {
        ...window.clockConfig.screensaver,
        background_color: '#fff',
        use_dashboard_background: true
      }
    });
    window.advance(1);
  });
  assert.equal((await probe()).background, 'rgb(12, 85, 85)');
  await page.evaluate(() => {
    window.card.setConfig(window.clockConfig);
    window.advance(1);
  });
  console.log(
    'PASS dashboard surface inheritance, native RGB override, and returning to dashboard colour'
  );
  await page.evaluate(() => window.card.shadowRoot.activeElement?.blur());
  await page.screenshot({path: '/tmp/houseview-clock-bold-480.png'});
  console.log('PASS reference clock at 480px, local time, fractional hands and weekday/date');
  for (const [width, height] of [
    [1280, 800],
    [800, 1280],
    [480, 440],
    [480, 480]
  ]) {
    await page.setViewport({width, height, hasTouch: true});
    await page.evaluate(() => window.advance(1));
    await new Promise((r) => setTimeout(r, 100));
    s = await probe();
    assert.equal(s.scene.w, width);
    assert.equal(s.scene.h, height);
    assert.equal(s.board.w, Math.min(width, height));
    assert.equal(s.board.h, Math.min(width, height));
    assert.equal(s.board.x, (width - s.board.w) / 2);
    assert.equal(s.board.y, (height - s.board.h) / 2);
  }
  console.log(
    'PASS square dial and full-screen background across tablet rotation and panel resize'
  );
  await page.evaluate(() => {
    const original = CSS.supports.bind(CSS);
    CSS.supports = (...args) =>
      args[0] === 'width' && args[1] === '1cqmin' ? false : original(...args);
    const sheet = window.card.shadowRoot.querySelector('link[rel=stylesheet]').sheet;
    for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
      const rule = sheet.cssRules[i];
      if (rule.conditionText?.replace(/\s/g, '') === '(width:1cqmin)') sheet.deleteRule(i);
    }
    window.advance(1);
  });
  assert.equal((await probe()).board.w, 480);
  await page.setViewport({width: 480, height: 440, hasTouch: true});
  await page.evaluate(() => window.advance(1));
  assert.equal((await probe()).board.w, 440);
  assert.equal((await probe()).board.h, 440);
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.evaluate(() => window.advance(1));
  console.log('PASS legacy panel sizing without container units');
  await page.evaluate(() => {
    window.card.setConfig({
      ...window.clockConfig,
      screensaver: {
        type: 'clock',
        preview: true,
        face: 'sculpted',
        background_color: '#e0bcb9',
        second_color: '#ee4eb9',
        show_date: false
      }
    });
    window.card.hass = window.clockHass;
  });
  await new Promise((r) => setTimeout(r, 450));
  assert.equal((await probe()).background, 'rgb(224, 188, 185)');
  await page.evaluate(() => window.card.shadowRoot.activeElement?.blur());
  await page.screenshot({path: '/tmp/houseview-clock-sculpted-480.png'});
  for (const face of ['digital', 'digital_stacked']) {
    await page.setViewport({width: 480, height: 480, hasTouch: true});
    await page.evaluate((style) => {
      window.card.setConfig({
        ...window.clockConfig,
        screensaver: {
          type: 'clock',
          preview: true,
          face: style,
          background_color: style === 'digital' ? '#202725' : '#e0bcb9',
          second_color: style === 'digital' ? '#b9edc7' : '#8d3e54'
        }
      });
      window.card.hass = window.clockHass;
    }, face);
    await page.waitForSelector('houseview-card >>> .ov-clock-digital-time');
    await new Promise((resolve) => setTimeout(resolve, 350));
    const digits = () =>
      page.evaluate(() => {
        const root = window.card.shadowRoot;
        return {
          hour: root.querySelector('.ov-clock-digital-hour').textContent,
          minute: root.querySelector('.ov-clock-digital-minute').textContent,
          second: root.querySelector('.ov-clock-digital-second').textContent,
          label: root.querySelector('.ov-clock-board').getAttribute('aria-label'),
          date: root.querySelector('.ov-clock-date').textContent
        };
      });
    assert.deepEqual(await digits(), {
      hour: '10',
      minute: '09',
      second: '30',
      label: '10:09:30, WED 1',
      date: 'WED 1'
    });
    await page.evaluate(() => window.card.shadowRoot.activeElement?.blur());
    await page.screenshot({path: `/tmp/houseview-clock-${face}-480.png`});
    for (const [width, height] of [
      [480, 480],
      [1280, 800],
      [800, 1280],
      [480, 440]
    ]) {
      await page.setViewport({width, height, hasTouch: true});
      await page.evaluate(() => window.advance(1));
      const geometry = await page.evaluate(() => {
        const root = window.card.shadowRoot;
        const board = root.querySelector('.ov-clock-board').getBoundingClientRect();
        const scene = root.querySelector('.ov-clock-scene').getBoundingClientRect();
        const fits = [
          ...root.querySelectorAll(
            '.ov-clock-digital-hour,.ov-clock-digital-minute,.ov-clock-digital-meta,.ov-clock-date'
          )
        ].every((node) => {
          const r = node.getBoundingClientRect();
          return (
            r.left >= board.left &&
            r.right <= board.right &&
            r.top >= board.top &&
            r.bottom <= board.bottom
          );
        });
        return {
          side: board.width,
          height: board.height,
          sceneWidth: scene.width,
          sceneHeight: scene.height,
          fits
        };
      });
      assert.deepEqual(geometry, {
        side: Math.min(width, height),
        height: Math.min(width, height),
        sceneWidth: width,
        sceneHeight: height,
        fits: true
      });
    }
    await page.evaluate((style) => {
      window.fake.now = Date.parse('2025-12-31T23:59:59Z');
      window.card.setConfig({
        ...window.clockConfig,
        preview_time: undefined,
        screensaver: {type: 'clock', preview: true, face: style}
      });
      window.card.hass = window.clockHass;
    }, face);
    await page.waitForSelector('houseview-card >>> .ov-clock-digital-second');
    await page.evaluate(() => {
      window.savedDigital = window.card.shadowRoot.querySelector('.ov-clock-digital-second');
      window.advance(1);
    });
    const midnight = await digits();
    assert.equal(midnight.hour, '00');
    assert.equal(midnight.minute, '00');
    assert.equal(midnight.second, '00');
    assert.equal(midnight.date, 'THU 1');
    assert.equal(
      await page.evaluate(
        () =>
          window.savedDigital === window.card.shadowRoot.querySelector('.ov-clock-digital-second')
      ),
      true
    );
    await page.touchscreen.tap(240, 220);
    await page.waitForFunction('!window.card.shadowRoot.querySelector(".hv-screensaver")');
    assert.equal(await page.evaluate(() => window.clockCalls.length), 0);
    console.log(
      `PASS ${face}: 480px/tablet/portrait/legacy sizing, stable ticks, midnight rollover and touch wake`
    );
  }
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.evaluate(() => {
    window.clockConfig = {
      ...window.clockConfig,
      preview_time: undefined,
      screensaver: {type: 'clock', idle_timeout: 5}
    };
    window.card.setConfig(window.clockConfig);
    window.card.hass = window.clockHass;
  });
  await page.waitForFunction('!window.card.shadowRoot.querySelector(".hv-screensaver")');
  await page.evaluate(() => window.advance(6));
  await page.waitForSelector('houseview-card >>> .ov-clock-board');
  const before = await page.evaluate(() => {
    window.savedClockHand = window.card.shadowRoot.querySelector('.ov-clock-second');
    return {
      sweep: window.savedClockHand.hasAttribute('data-sweep'),
      delay: window.savedClockHand.style.getPropertyValue('--clock-second-delay')
    };
  });
  assert.equal(before.sweep, true);
  await page.evaluate(() => window.advance(4));
  assert.equal(
    await page.evaluate(
      () => window.savedClockHand === window.card.shadowRoot.querySelector('.ov-clock-second')
    ),
    true
  );
  assert.equal(await page.evaluate(() => window.savedClockHand.hasAttribute('data-sweep')), true);
  assert.equal(
    await page.evaluate(() => window.savedClockHand.style.getPropertyValue('--clock-second-delay')),
    before.delay
  );
  // The compositor sweep owns the angle; shared ticks must not write an inline transform.
  assert.equal(await page.evaluate(() => window.savedClockHand.style.transform), '');
  await page.touchscreen.tap(240, 240);
  await page.waitForFunction('!window.card.shadowRoot.querySelector(".hv-screensaver")');
  assert.equal(await page.evaluate(() => window.clockCalls.length), 0);
  console.log(
    'PASS idle activation, shared ticks without replacing hands, real tap-to-wake with no light action'
  );
  await page.evaluate(() => window.advance(7));
  await page.waitForSelector('houseview-card >>> .ov-clock-board');
  await page.keyboard.press('Escape');
  await page.waitForFunction('!window.card.shadowRoot.querySelector(".hv-screensaver")');
  // Each activation owns its elapsed timer; preview_time must only pin the displayed time.
  const restProbe = () =>
    page.evaluate(() => {
      const root = window.card.shadowRoot;
      const backdrop = root.querySelector('.ov-clock-backdrop');
      const board = root.querySelector('.ov-clock-board');
      const black = getComputedStyle(backdrop, '::before');
      return {
        resting: backdrop.dataset.resting,
        ink: backdrop.dataset.restInk,
        black: black.backgroundColor,
        opacity: Number(black.opacity),
        duration: black.transitionDuration,
        board: getComputedStyle(board).color,
        numeral:
          root.querySelector('.ov-clock-numeral') &&
          getComputedStyle(root.querySelector('.ov-clock-numeral')).color,
        hand:
          root.querySelector('.ov-clock-hour') &&
          getComputedStyle(root.querySelector('.ov-clock-hour')).backgroundColor,
        second: getComputedStyle(
          root.querySelector('.ov-clock-second,.ov-clock-digital-second')
        ).getPropertyValue(root.querySelector('.ov-clock-second') ? 'background-color' : 'color')
      };
    });
  for (const face of ['bold', 'sculpted', 'digital', 'digital_stacked']) {
    await page.evaluate((face) => {
      window.card.setConfig({
        ...window.clockConfig,
        preview_time: '2026-10-15T09:10:00Z',
        screensaver: {
          type: 'clock',
          preview: true,
          face,
          background_color: '#e0bcb9',
          second_color: '#000000'
        }
      });
      window.card.hass = window.clockHass;
      window.savedRestBoard = window.card.shadowRoot.querySelector('.ov-clock-board');
    }, face);
    await page.evaluate(() => window.advance(59));
    assert.equal(
      (await restProbe()).resting,
      'false',
      `${face}: keep selected colour for 59 seconds`
    );
    await page.evaluate(() => {
      window.card.hass = {...window.clockHass};
      window.advance(1);
    });
    const starting = await restProbe();
    assert.equal(starting.resting, 'true', `${face}: begin fading at one minute`);
    assert.equal(starting.duration, '2s');
    await page.waitForFunction(() => {
      const b = window.card.shadowRoot.querySelector('.ov-clock-backdrop');
      const alpha = Number(getComputedStyle(b, '::before').opacity);
      return alpha > 0 && alpha < 1;
    });
    await page.evaluate(() => window.advance(2));
    await page.waitForFunction(
      () =>
        getComputedStyle(window.card.shadowRoot.querySelector('.ov-clock-backdrop'), '::before')
          .opacity === '1'
    );
    const dark = await restProbe();
    assert.equal(dark.black, 'rgb(0, 0, 0)');
    assert.equal(dark.opacity, 1);
    assert.equal(dark.board, 'rgb(198, 198, 198)');
    assert.equal(
      dark.second,
      'rgb(153, 153, 153)',
      'even a configured black seconds colour becomes visible'
    );
    if (dark.numeral)
      assert.equal(dark.numeral, dark.board, `${face}: sculpted numerals stay readable`);
    if (dark.hand) assert.equal(dark.hand, dark.board);
    assert.equal(
      await page.evaluate(
        () => window.savedRestBoard === window.card.shadowRoot.querySelector('.ov-clock-board')
      ),
      true
    );
    await page.screenshot({path: `/tmp/houseview-clock-rest-${face}.png`});
    await page.touchscreen.tap(240, 240);
    await page.waitForFunction('!window.card.shadowRoot.querySelector(".hv-screensaver")');
    await page.evaluate(() => window.advance(6));
    await page.waitForSelector('houseview-card >>> .ov-clock-board');
    assert.equal(
      (await restProbe()).resting,
      'false',
      `${face}: wake/re-entry starts a fresh minute`
    );
    console.log(
      `PASS ${face}: one-minute threshold, opacity fade to black, readable ink, DOM identity and reset`
    );
  }
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await page.evaluate(() => {
    window.card.setConfig({...window.clockConfig, screensaver: {type: 'clock', preview: true}});
    window.card.hass = window.clockHass;
    window.advance(60);
  });
  const reducedRest = await restProbe();
  assert.equal(reducedRest.opacity, 1);
  assert.equal(reducedRest.ink, 'true');
  assert.equal(reducedRest.duration, '0s');
  await page.emulateMediaFeatures([]);
  await page.evaluate(() => {
    window.card.setConfig({
      tablet_mode: true,
      widgets: [{type: 'clock_overview', face: 'digital', background_color: '#e0bcb9'}]
    });
    window.card.hass = window.clockHass;
    window.advance(120);
  });
  const standalone = await restProbe();
  assert.equal(standalone.resting, undefined, 'standalone cards retain their selected appearance');
  assert.equal(standalone.opacity, 0);
  assert.equal(await page.evaluate(() => window.clockCalls.length), 0);
  console.log(
    'PASS reduced motion changes immediately, standalone cards remain coloured, no service calls'
  );
  await page.evaluate(() => window.card.remove());
  assert.equal(await page.evaluate(() => window.intervals.size), 0);
  assert.deepEqual(errors, []);
  console.log('PASS Escape wake and ticker cleanup; no browser errors');
} finally {
  await browser.close();
  await server.close();
}
