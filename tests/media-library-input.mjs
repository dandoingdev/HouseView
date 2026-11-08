/* global document, window, PointerEvent, CSSRule */
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
  // A synthetic live queue exercises the cover key, scrolling and track playback on actual touch input.
  await page.evaluate(() => {
    const hass = window.card._hass;
    hass.services = {sonos: {get_queue: {}, play_queue: {}}};
    hass.entities = {'media_player.test': {platform: 'sonos'}};
    window.trackQueue = Array.from({length: 24}, (_, i) => ({
      media_title:
        ['Golden hour', 'A little closer', 'The long way home', 'Soft focus'][i % 4] +
        (i > 3 ? ` · ${i + 1}` : ''),
      media_artist: 'The House Band',
      media_content_id: `synthetic:track:${i}`
    }));
    hass.callWS = async () => ({response: {'media_player.test': window.trackQueue}});
    hass.states['media_player.test'] = {
      state: 'playing',
      attributes: {
        supported_features: 131072 | 512 | 4 | 2 | 16 | 32 | 32768 | 262144,
        friendly_name: 'Kitchen',
        media_title: 'Golden hour',
        media_artist: 'The House Band',
        media_playlist: 'Evening sessions',
        queue_size: 24,
        queue_position: 1,
        media_duration: 240,
        media_position: 60,
        volume_level: 0.35
      }
    };
    window.card.hass = {...hass};
    window.swipeCalls = [];
  });
  const tap = async (selector) => {
    const point = await page.evaluate((selector) => {
      const r = window.card.shadowRoot.querySelector(selector).getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, selector);
    await page.touchscreen.tap(point.x, point.y);
  };
  for (const [width, height] of [
    [480, 480],
    [320, 568],
    [240, 640],
    [640, 360],
    [768, 1024],
    [1024, 768]
  ]) {
    await page.setViewport({width, height, hasTouch: true});
    await new Promise((resolve) => setTimeout(resolve, 150));
    const cover = await page.evaluate(() => {
      const button = window.card.shadowRoot.querySelector('.mc-tracks');
      const r = button.getBoundingClientRect(),
        icon = button.querySelector('ha-icon').getBoundingClientRect();
      const art = button.parentElement.getBoundingClientRect();
      const meta = button.parentElement.querySelector('.mc-meta').getBoundingClientRect();
      return {
        w: r.width,
        h: r.height,
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        artRight: art.right,
        artTop: art.top,
        overlap:
          r.left < meta.right && r.right > meta.left && r.top < meta.bottom && r.bottom > meta.top,
        dx: Math.abs(r.x + r.width / 2 - icon.x - icon.width / 2),
        dy: Math.abs(r.y + r.height / 2 - icon.y - icon.height / 2)
      };
    });
    assert.ok(
      cover.w >= 44 &&
        cover.h === cover.w &&
        cover.dx <= 1 &&
        cover.dy <= 1 &&
        cover.x >= 0 &&
        cover.y >= cover.artTop &&
        cover.right <= cover.artRight + 1 &&
        !cover.overlap,
      `FAIL cover track target at ${width}×${height}: ${JSON.stringify(cover)}`
    );
    await tap('.mc-tracks');
    await page.waitForSelector('houseview-card >>> .mt-track');
    const geometry = await page.evaluate(() => {
      const root = window.card.shadowRoot.querySelector('.media-tracks');
      const content = root.querySelector('.mt-content').getBoundingClientRect();
      return {
        scroll: content.height,
        bottom: content.bottom,
        width: root.scrollWidth,
        rows: [...root.querySelectorAll('.mt-track')].map((b) => ({
          w: b.clientWidth,
          h: b.clientHeight
        })),
        keys: [...root.querySelectorAll('.ov-panel-key')].map((b) => {
          const r = b.getBoundingClientRect(),
            i = b.querySelector('ha-icon').getBoundingClientRect();
          return {
            w: r.width,
            h: r.height,
            right: r.right,
            bottom: r.bottom,
            dx: Math.abs(r.x + r.width / 2 - i.x - i.width / 2),
            dy: Math.abs(r.y + r.height / 2 - i.y - i.height / 2)
          };
        })
      };
    });
    assert.ok(
      geometry.width <= width &&
        geometry.bottom <= height &&
        geometry.scroll >= 100 &&
        geometry.rows.every((r) => r.w >= 44 && r.h >= 64) &&
        geometry.keys.every(
          (k) =>
            k.w >= 64 &&
            k.h === k.w &&
            k.dx <= 1 &&
            k.dy <= 1 &&
            k.right <= width &&
            k.bottom <= height
        ),
      `FAIL tracks geometry at ${width}×${height}: ${JSON.stringify(geometry)}`
    );
    assert.equal((await state()).calls, 0);
    if (width === 480 || width === 768)
      await page.screenshot({path: `/tmp/houseview-tracks-${width}.png`});
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.card.shadowRoot.querySelector('.media-tracks'));
    assert.equal(
      await page.evaluate(() =>
        window.card.shadowRoot.activeElement?.classList.contains('mc-tracks')
      ),
      true
    );
    console.log(
      `PASS track targets, centred icons, no overlap and reachable list at ${width}×${height}`
    );
  }
  await tap('.mc-tracks');
  await page.waitForSelector('houseview-card >>> .mt-track');
  const scroll = await page.evaluate(() => {
    const r = window.card.shadowRoot.querySelector('.mt-content').getBoundingClientRect();
    return {x: r.x + r.width / 2, from: r.bottom - 30, to: r.top + 30};
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: scroll.x, y: scroll.from}]
  });
  for (let i = 1; i <= 10; i++)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x: scroll.x, y: scroll.from + ((scroll.to - scroll.from) * i) / 10}]
    });
  await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const scrollTop = await page.evaluate(
    () => window.card.shadowRoot.querySelector('.mt-content').scrollTop
  );
  assert.ok(scrollTop > 100, `FAIL touch scrolling observed scrollTop=${scrollTop}`);
  assert.equal((await state()).calls, 0, 'scrolling tracks never starts music');
  await page.evaluate(() => (window.card.shadowRoot.querySelector('.mt-content').scrollTop = 0));
  await tap('[data-action="media-player-track-play-2"]');
  await page.waitForFunction(() => !window.card.shadowRoot.querySelector('.media-tracks'));
  assert.deepEqual(await page.evaluate(() => window.swipeCalls), [
    {d: 'sonos', s: 'play_queue', data: {entity_id: 'media_player.test', queue_position: 2}}
  ]);
  assert.deepEqual(errors, []);
  console.log(
    'PASS real touch scrolling does not play; tapping a track jumps within the queue exactly once'
  );
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.evaluate(() => {
    window.card.setConfig({
      tablet_mode: true,
      show_header: true,
      performance: 'lite',
      pages: [{name: 'Sound', columns: 2}],
      widgets: [
        {type: 'media_player', entity: 'media_player.test'},
        ...['a', 'b', 'c'].map((id) => ({type: 'switch', entity: `switch.${id}`}))
      ]
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  await tap('.mc-details');
  await page.waitForSelector('houseview-card >>> .media-stage');
  await new Promise((resolve) => setTimeout(resolve, 450));
  const stageKey = await page.evaluate(() => {
    const b = window.card.shadowRoot.querySelector('.media-stage .mc-tracks');
    const r = b.getBoundingClientRect(),
      i = b.querySelector('ha-icon').getBoundingClientRect();
    const m = b.parentElement.querySelector('.mc-meta').getBoundingClientRect();
    return {
      w: r.width,
      h: r.height,
      right: r.right,
      bottom: r.bottom,
      meta: {top: m.top, bottom: m.bottom, left: m.left, right: m.right},
      art: {width: b.parentElement.clientWidth, height: b.parentElement.clientHeight},
      overlap: r.left < m.right && r.right > m.left && r.top < m.bottom && r.bottom > m.top,
      dx: Math.abs(r.x + r.width / 2 - i.x - i.width / 2),
      dy: Math.abs(r.y + r.height / 2 - i.y - i.height / 2)
    };
  });
  await page.screenshot({path: '/tmp/houseview-tracks-player-480.png'});
  assert.ok(
    stageKey.w >= 64 &&
      stageKey.w === stageKey.h &&
      stageKey.dx <= 1 &&
      stageKey.dy <= 1 &&
      !stageKey.overlap &&
      stageKey.right <= 480 &&
      stageKey.bottom <= 480,
    `FAIL full player cover key: ${JSON.stringify(stageKey)}`
  );
  await page.screenshot({path: '/tmp/houseview-tracks-player-480.png'});
  await tap('.media-stage .mc-tracks');
  await page.waitForSelector('houseview-card >>> .mt-track');
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.activeElement?.dataset.action),
    'media-player-tracks-refresh'
  );
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() =>
      window.card.shadowRoot.activeElement?.classList.contains('mc-tracks')
    ),
    true
  );
  await tap('.ms-close');
  console.log(
    'PASS tiny panel opens the full player and track picker with 64px cover key, focus trap and return focus'
  );

  // Activate the same fallback used by older WebViews, without container rules or cq units.
  await page.evaluate(() => {
    const link = window.card.shadowRoot.querySelector('link[rel=stylesheet]');
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
          if (rule.style)
            for (const key of [...rule.style])
              if (/cq(w|h|i|min|max)\b/.test(rule.style.getPropertyValue(key)))
                rule.style.removeProperty(key);
          return rule.cssText;
        })
        .join('\n');
    const style = document.createElement('style');
    style.textContent = transform(link.sheet.cssRules);
    link.replaceWith(style);
  });
  await tap('.mc-details');
  await new Promise((resolve) => setTimeout(resolve, 450));
  await tap('.media-stage .mc-tracks');
  await page.waitForSelector('houseview-card >>> .mt-track');
  const fallback = await page.evaluate(() => {
    const root = window.card.shadowRoot.querySelector('.media-tracks');
    const r = root.getBoundingClientRect(),
      content = root.querySelector('.mt-content').getBoundingClientRect();
    return {
      width: root.scrollWidth,
      bottom: r.bottom,
      content: content.height,
      key: root.querySelector('.ov-panel-key').getBoundingClientRect().width
    };
  });
  assert.ok(
    fallback.width <= 480 && fallback.bottom <= 480 && fallback.content > 100 && fallback.key >= 64,
    `FAIL legacy track list: ${JSON.stringify(fallback)}`
  );
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log('PASS legacy WebView fallback retains reachable track list and 64px navigation keys');
} finally {
  await browser.close();
  await server.close();
}
