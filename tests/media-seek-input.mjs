#!/usr/bin/env node
/* global window, document */
// Real input against a recording mock player. Never contacts Home Assistant or a speaker.
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
  await page.evaluate(() => {
    window.card = document.createElement('houseview-card');
    window.seekCalls = [];
    window.seekInfos = [];
    window.seekHass = {
      states: {
        'media_player.test': {
          state: 'paused',
          attributes: {
            friendly_name: 'Speaker',
            media_title: 'A track to scrub',
            media_artist: 'An artist',
            media_content_id: 'track:1',
            media_duration: 200,
            media_position: 30,
            volume_level: 0.4,
            supported_features: 2 | 4 | 16 | 32 | 131072
          }
        },
        'switch.a': {state: 'off', attributes: {}},
        'switch.b': {state: 'off', attributes: {}},
        'switch.c': {state: 'off', attributes: {}}
      },
      locale: {language: 'en'},
      callService: async (d, s, data) => {
        window.seekCalls.push({d, s, data});
        if (window.blockSeek) {
          window.blockSeek = false;
          await new Promise((resolve) => {
            window.finishSeek = resolve;
          });
        }
      }
    };
    window.card.addEventListener('hass-more-info', (event) =>
      window.seekInfos.push(event.detail.entityId)
    );
    window.card.setConfig({
      tablet_mode: true,
      show_header: true,
      performance: 'lite',
      pages: [{name: 'Sound', columns: 2}, {name: 'More'}],
      widgets: [
        {type: 'media_player', entity: 'media_player.test'},
        ...['a', 'b', 'c'].map((id) => ({type: 'switch', entity: `switch.${id}`})),
        {type: 'clock', page: 'More'}
      ]
    });
    window.card.hass = window.seekHass;
    document.body.replaceChildren(window.card);
  });
  const rect = () =>
    page.evaluate(() => {
      const input = window.card.shadowRoot.querySelector('.mc-seek');
      const r = input.getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: r.height, middle: r.y + r.height / 2};
    });
  const probe = () =>
    page.evaluate(() => {
      const root = window.card.shadowRoot;
      const input = root.querySelector('.mc-seek');
      return {
        value: Number(input.value),
        disabled: input.disabled,
        elapsed: root.querySelector('.mc-elapsed').textContent,
        calls: window.seekCalls,
        infos: window.seekInfos,
        page: window.card._pageIndex,
        dialog: !!root.querySelector('.hv-screensaver')
      };
    });
  const update = (attrs, state) =>
    page.evaluate(
      (patch, nextState) => {
        const old = window.seekHass.states['media_player.test'];
        window.seekHass.states['media_player.test'] = {
          ...old,
          state: nextState || old.state,
          attributes: {...old.attributes, ...patch}
        };
        window.card.hass = window.seekHass;
      },
      attrs,
      state
    );
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await page.waitForSelector('houseview-card >>> .mc-seek');
  let r = await rect();
  assert.ok(r.width > 100 && r.height >= 44 && r.y + r.height <= 480, JSON.stringify(r));
  assert.equal((await probe()).disabled, false);
  assert.equal((await probe()).calls.length, 0);
  // The compact progress target and the other controls must not overlap.
  assert.equal(
    await page.evaluate(() => {
      const root = window.card.shadowRoot;
      const bar = root.querySelector('.mc-seek').getBoundingClientRect();
      const tile = root.querySelector('.mc').getBoundingClientRect();
      return (
        [...root.querySelectorAll('.mc button')].every((button) => {
          const b = button.getBoundingClientRect();
          return (
            !b.width ||
            b.bottom <= bar.top ||
            b.top >= bar.bottom ||
            b.right <= bar.left ||
            b.left >= bar.right
          );
        }) &&
        bar.left >= tile.left &&
        bar.right <= tile.right &&
        bar.bottom <= tile.bottom
      );
    }),
    true
  );
  console.log(
    'PASS compact 480px panel exposes a separate 44px seek target with no overlapping controls'
  );
  const cdp = await page.createCDPSession();
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{x, y}]
    });
  await touch('touchStart', r.x + r.width * 0.2, r.middle);
  await touch('touchMove', r.x + r.width * 0.75, r.middle);
  await sleep(650);
  assert.ok(
    Math.abs((await probe()).value - 150) <= 1,
    JSON.stringify({
      r,
      state: await probe(),
      hit: await page.evaluate((p) => {
        const node = window.card.shadowRoot.elementFromPoint(p.x + p.width * 0.75, p.middle);
        return {html: node?.outerHTML.slice(0, 350)};
      }, r)
    })
  );
  assert.equal((await probe()).calls.length, 0);
  assert.equal((await probe()).infos.length, 0);
  assert.equal((await probe()).dialog, false);
  await update({media_position: 40});
  await page.evaluate(() => {
    window.fake.now += 1000;
    window.card._tick(window.fake.now);
  });
  assert.ok(Math.abs((await probe()).value - 150) <= 1);
  await touch('touchEnd');
  await page.waitForFunction(() => window.seekCalls.length === 1);
  const target = (await probe()).value;
  assert.deepEqual((await probe()).calls[0], {
    d: 'media_player',
    s: 'media_seek',
    data: {entity_id: 'media_player.test', seek_position: target}
  });
  assert.equal((await probe()).page, 0);
  await page.evaluate(() => {
    window.fake.now += 1000;
    window.card._tick(window.fake.now);
  });
  assert.equal((await probe()).value, target);
  await update({media_position: target});
  console.log(
    'PASS real touch scrubs locally through ticks/HA updates, commits once without paging, and waits for the player echo'
  );
  r = await rect();
  await touch('touchStart', r.x + r.width * 0.1, r.middle);
  await touch('touchMove', r.x + r.width * 0.5, r.middle);
  await touch('touchCancel');
  assert.equal((await probe()).calls.length, 1);
  assert.equal((await probe()).value, target);
  await page.evaluate(() => window.card.shadowRoot.querySelector('.mc-seek').focus());
  await page.keyboard.press('End');
  await page.waitForFunction(() => window.seekCalls.length === 2);
  assert.equal((await probe()).calls.at(-1).data.seek_position, 200);
  await page.keyboard.press('Home');
  await page.waitForFunction(() => window.seekCalls.length === 3);
  assert.equal((await probe()).calls.at(-1).data.seek_position, 0);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.seekCalls.length === 4);
  assert.equal((await probe()).calls.at(-1).data.seek_position, 1);
  assert.equal((await probe()).page, 0);
  console.log(
    'PASS cancellation restores the position; native keyboard End/Home/arrows seek without changing dashboard pages'
  );
  await update({media_position: 1});
  r = await rect();
  await page.mouse.move(r.x + r.width * 0.1, r.middle);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width + 30, r.middle);
  await page.mouse.up();
  await page.waitForFunction(() => window.seekCalls.length === 5);
  assert.equal((await probe()).calls.at(-1).data.seek_position, 200);
  await update({media_position: 200});
  const beforeTrack = (await probe()).calls.length;
  await touch('touchStart', r.x + r.width * 0.2, r.middle);
  await update({media_content_id: 'track:2', media_title: 'Another track', media_position: 0});
  await touch('touchEnd');
  assert.equal((await probe()).calls.length, beforeTrack);
  assert.equal((await probe()).value, 0);
  console.log(
    'PASS mouse capture clamps to the track end; a track change cancels an in-flight drag'
  );
  const change = (value) =>
    page.evaluate((n) => {
      const input = window.card.shadowRoot.querySelector('.mc-seek');
      input.value = String(n);
      input.dispatchEvent(new window.Event('input', {bubbles: true}));
      input.dispatchEvent(new window.Event('change', {bubbles: true}));
    }, value);
  await page.evaluate(() => {
    window.blockSeek = true;
    window.finishSeek = null;
  });
  await change(30);
  await page.waitForFunction(() => !!window.finishSeek);
  await change(80);
  await change(120);
  assert.equal((await probe()).calls.length, beforeTrack + 1);
  await page.evaluate(() => window.finishSeek());
  await page.waitForFunction((n) => window.seekCalls.length === n + 2, {}, beforeTrack);
  assert.equal((await probe()).calls.at(-1).data.seek_position, 120);
  await sleep(60);
  const beforeStale = (await probe()).calls.length;
  await page.evaluate(() => {
    window.blockSeek = true;
    window.finishSeek = null;
  });
  await change(40);
  await page.waitForFunction(() => !!window.finishSeek);
  await change(150);
  await update({media_content_id: 'track:3', media_title: 'Next track', media_position: 0});
  await page.evaluate(() => window.finishSeek());
  await sleep(100);
  assert.equal((await probe()).calls.length, beforeStale + 1);
  console.log(
    'PASS slow service coalesces to the last seek and discards queued seeks after a track change'
  );
  const count = (await probe()).calls.length;
  await page.evaluate(async () => {
    for (const value of ['-1', '201', 'NaN', '1.5', 'Infinity'])
      await window.card._act(`media-player-seek-${value}`, 'media_player.test');
  });
  assert.equal((await probe()).calls.length, count);
  await update({supported_features: 4});
  assert.equal((await probe()).disabled, true);
  await page.evaluate(() => window.card._act('media-player-seek-30', 'media_player.test'));
  await update({supported_features: 6, media_duration: null});
  assert.equal((await probe()).disabled, true);
  await update({media_duration: 200}, 'unavailable');
  await page.evaluate(() => window.card._act('media-player-seek-30', 'media_player.test'));
  assert.equal((await probe()).calls.length, count);
  console.log(
    'PASS unsupported/live/unknown-duration/unavailable players and invalid seek positions send no command'
  );
  await update({supported_features: 6, media_position: 60}, 'playing');
  assert.equal((await probe()).disabled, false);
  await page.screenshot({path: '/tmp/houseview-media-seek-480.png'});
  assert.deepEqual(errors, []);
  console.log('PASS no browser errors');
} finally {
  await browser.close();
  await server.close();
}
