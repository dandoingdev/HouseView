#!/usr/bin/env node
/* global window, document, CSSRule, getComputedStyle */
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
  await page.evaluate(() => {
    window.card?.remove();
    window.card = document.createElement('houseview-card');
    window.panelCalls = [];
    window.panelInfos = [];
    window.addEventListener('hass-more-info', (e) => window.panelInfos.push(e.detail.entityId));
    window.panelHass = {
      states: {
        'media_player.test': {
          state: 'idle',
          attributes: {
            friendly_name: 'Speaker',
            media_title: 'A very long song title that must not overlap the controls',
            media_artist: 'An artist with a long name',
            volume_level: 0.4,
            supported_features: 4 | 16 | 32 | 512 | 131072
          }
        },
        'switch.a': {state: 'off', attributes: {}},
        'switch.b': {state: 'off', attributes: {}},
        'switch.c': {state: 'off', attributes: {}}
      },
      locale: {language: 'en'},
      callService: async (d, s, data) => window.panelCalls.push({d, s, data}),
      callWS: async () => ({
        children: [
          {
            title: 'Playlist',
            media_content_type: 'playlist',
            media_content_id: 'list:1',
            can_play: true
          }
        ]
      })
    };
    window.card.setConfig({
      tablet_mode: true,
      show_header: true,
      performance: 'lite',
      pages: [{name: 'Sound', columns: 2, surface: 'teal'}],
      widgets: [
        {type: 'media_player', entity: 'media_player.test'},
        ...['a', 'b', 'c'].map((id) => ({type: 'switch', entity: `switch.${id}`}))
      ]
    });
    window.card.hass = window.panelHass;
    document.body.replaceChildren(window.card);
  });
  await page.waitForSelector('houseview-card >>> .mc-details');
  await new Promise((r) => setTimeout(r, 100));
  const probe = () =>
    page.evaluate(() => {
      const root = window.card.shadowRoot;
      const rect = (e) => {
        const r = e.getBoundingClientRect();
        return {x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height};
      };
      const tile = root.querySelector('.mc');
      return {
        host: rect(window.card),
        nav: rect(root.querySelector('.page-nav')),
        header: rect(root.querySelector('.dashboard-header')),
        shellScroll: root.querySelector('.shell').scrollHeight,
        tile: rect(tile),
        layout: [...tile.querySelectorAll('.mc-body,.mc-stage,.mc-cover,.mc-meta,.mc-details')].map(
          (e) => ({
            class: e.className,
            ...rect(e),
            grid: getComputedStyle(e).gridTemplateColumns,
            minWidth: getComputedStyle(e).minWidth
          })
        ),
        buttons: [...tile.querySelectorAll('button')]
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => ({action: e.dataset.action, ...rect(e)}))
      };
    });
  const assertLayout = async (w, h) => {
    const s = await probe();
    assert.equal(s.host.w, w);
    assert.equal(s.host.h, h);
    assert.equal(s.nav.bottom, h);
    assert.equal(s.header.y, 0);
    assert.equal(s.shellScroll, h);
    for (let i = 0; i < s.buttons.length; i++)
      for (const b of s.buttons.slice(i + 1)) {
        const a = s.buttons[i];
        assert.ok(
          a.right <= b.x + 0.5 ||
            b.right <= a.x + 0.5 ||
            a.bottom <= b.y + 0.5 ||
            b.bottom <= a.y + 0.5,
          `Music controls overlap at ${w}x${h}: ${JSON.stringify(a)} and ${JSON.stringify(b)} layout ${JSON.stringify(s.layout)}`
        );
      }
    for (const b of s.buttons) {
      assert.ok(
        b.x >= s.tile.x && b.right <= s.tile.right && b.y >= s.tile.y && b.bottom <= s.tile.bottom,
        JSON.stringify(b)
      );
      if (s.tile.w <= 300) assert.ok(b.w >= 44 && b.h >= 44, JSON.stringify(b));
    }
  };
  const click = async (selector) => {
    await page.evaluate(() => {
      window.fake.now += 1000;
    });
    const box = await page.evaluate((s) => {
      const r = window.card.shadowRoot.querySelector(s).getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, selector);
    await page.touchscreen.tap(box.x, box.y);
    await new Promise((resolve) => setTimeout(resolve, 400));
  };
  await assertLayout(480, 480);
  await click('.mc-details');
  assert.deepEqual(await page.evaluate(() => window.panelInfos), []);
  await page.evaluate(() =>
    window.card.shadowRoot
      .querySelector('.mc-details')
      .dispatchEvent(
        new window.KeyboardEvent('keydown', {key: 'F10', shiftKey: true, bubbles: true})
      )
  );
  assert.deepEqual(await page.evaluate(() => window.panelInfos), ['media_player.test']);
  await assertLayout(480, 480);
  await click('.mc-play');
  await page.waitForFunction('window.panelCalls.length === 1');
  assert.equal(await page.evaluate(() => window.panelCalls[0].s), 'media_play');
  await page.evaluate(() => {
    const old = window.panelHass.states['media_player.test'];
    window.panelHass.states['media_player.test'] = {...old, state: 'playing'};
    window.card.hass = window.panelHass;
  });
  await click('.mc-play');
  await page.waitForFunction('window.panelCalls.length === 2');
  assert.equal(await page.evaluate(() => window.panelCalls[1].s), 'media_play_pause');
  console.log('PASS 480px edge-to-edge layout, track settings hold, idle resume and play/pause');
  for (const [w, h] of [
    [480, 440],
    [440, 480],
    [853, 533],
    [1280, 800],
    [800, 1280],
    [480, 480]
  ]) {
    await page.setViewport({width: w, height: h, hasTouch: true});
    await new Promise((r) => setTimeout(r, 100));
    await assertLayout(w, h);
  }
  console.log('PASS viewport resizing preserves the bottom edge and all music tap targets');
  // Simulate a legacy CSS engine: remove container queries/units and activate their @supports fallback.
  await page.evaluate(() => {
    const sheet = window.card.shadowRoot.querySelector('link[rel=stylesheet]').sheet;
    const transform = (rules) =>
      [...rules]
        .map((rule) => {
          if (rule.constructor.name === 'CSSContainerRule') return '';
          if (
            rule.type === CSSRule.SUPPORTS_RULE &&
            rule.conditionText.replace(/\s/g, '') === 'not(container-type:size)'
          )
            return transform(rule.cssRules);
          if (rule.cssRules && !rule.style)
            return (
              rule.cssText.slice(0, rule.cssText.indexOf('{') + 1) + transform(rule.cssRules) + '}'
            );
          if (rule.style) {
            for (const key of [...rule.style])
              if (/\bcq(w|h|i|min|max)\b/.test(rule.style.getPropertyValue(key)))
                rule.style.removeProperty(key);
          }
          return rule.cssText;
        })
        .join('\n');
    const css = transform(sheet.cssRules);
    const style = document.createElement('style');
    style.textContent = css;
    window.card.shadowRoot.querySelector('link[rel=stylesheet]').replaceWith(style);
  });
  await new Promise((r) => setTimeout(r, 100));
  await assertLayout(480, 480);
  await click('.mc-details');
  await click('.mc-volume');
  await page.waitForSelector('houseview-card >>> .ov-volume-input');
  assert.equal(await page.evaluate(() => window.panelCalls.length), 2);
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.hv-screensaver').getBoundingClientRect().bottom
    ),
    480
  );
  await click('[data-action="overview-close"]');
  await page.waitForFunction('!window.card.shadowRoot.querySelector(".hv-screensaver")');
  await page.evaluate(() => {
    window.fake.now += 1000;
  });
  await click('.mc-browse');
  await page.waitForSelector('houseview-card >>> .media-library');
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.media-library').getBoundingClientRect().bottom
    ),
    480
  );
  // A desktop uses the same saved panel config but must keep HA's editor reachable.
  await page.setViewport({width: 1280, height: 800, hasTouch: false});
  await page.waitForFunction('window.ready === true');
  await page.evaluate(() => {
    // Linux headless Chrome can advertise no primary pointer even with touch emulation disabled.
    // This case explicitly models a mouse desktop; keep other media queries native for layout checks.
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) =>
      query === '(hover: hover) and (pointer: fine)' ? {matches: true} : matchMedia(query);
    window.card?.remove();
    window.card = document.createElement('houseview-card');
    document.body.replaceChildren(window.card);
    window.card.setConfig({tablet_mode: true, widgets: [{type: 'clock'}]});
    window.card.hass = {states: {}, locale: {language: 'en'}};
  });
  const desktop = await page.evaluate(() => ({
    mouse: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    fullScreen: window.card.hasAttribute('tablet-mode'),
    position: getComputedStyle(window.card).position
  }));
  assert.equal(desktop.mouse, true);
  assert.equal(desktop.fullScreen, false);
  assert.notEqual(desktop.position, 'fixed');
  await page.setViewport({width: 480, height: 480, hasTouch: false});
  assert.equal(await page.evaluate(() => window.card.hasAttribute('tablet-mode')), false);
  await page.evaluate(() => {
    window.history.replaceState(null, '', '?tablet=1');
    window.card._layout();
  });
  assert.equal(await page.evaluate(() => window.card.hasAttribute('tablet-mode')), true);
  await page.evaluate(() => {
    window.card.editMode = true;
    window.card._layout();
  });
  assert.equal(await page.evaluate(() => window.card.hasAttribute('tablet-mode')), false);
  console.log(
    'PASS mouse desktops retain HA editing space at wide and narrow sizes; forced kiosks release it during editing'
  );
  assert.deepEqual(errors, []);
  console.log('PASS legacy WebView layout, track controls, volume, and tappable playlist browser');
} finally {
  await browser.close();
  await server.close();
}
