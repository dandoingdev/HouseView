#!/usr/bin/env node
/* global window, document, Event */
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
  await page.evaluate(() => {
    window.card?.remove();
    window.card = document.createElement('houseview-card');
    window.volumeCalls = [];
    window.volumeResolves = [];
    window.volumeHass = {
      states: {
        'media_player.test': {
          state: 'playing',
          attributes: {friendly_name: 'Speaker', volume_level: 0.4, supported_features: 12}
        }
      },
      locale: {language: 'en'},
      callService: async (d, s, data) => {
        window.volumeCalls.push({d, s, data});
        if (window.holdVolume) await new Promise((resolve) => window.volumeResolves.push(resolve));
      }
    };
    window.card.setConfig({
      tablet_mode: true,
      widgets: [{type: 'media_player', entity: 'media_player.test', name: 'Room speaker'}]
    });
    window.card.hass = window.volumeHass;
    document.body.replaceChildren(window.card);
  });
  await page.waitForSelector('houseview-card >>> .mc-volume');
  const centre = (selector) =>
    page.evaluate((s) => {
      const r = window.card.shadowRoot.querySelector(s).getBoundingClientRect();
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        top: r.top,
        bottom: r.bottom,
        height: r.height
      };
    }, selector);
  const click = async (selector) => {
    const r = await centre(selector);
    await page.mouse.click(r.x, r.y);
  };
  await click('.mc-volume');
  await page.waitForSelector('houseview-card >>> .ov-volume-input');
  assert.equal(await page.evaluate(() => window.volumeCalls.length), 0);
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.ov-volume-title').textContent),
    'Room speaker'
  );
  const input = await centre('.ov-volume-input');
  assert.equal(input.height, 480);
  const probe = () =>
    page.evaluate(() => ({
      value: window.card.shadowRoot.querySelector('.ov-volume-value')?.textContent,
      fill: window.card.shadowRoot
        .querySelector('.ov-volume-control')
        ?.style.getPropertyValue('--volume'),
      calls: window.volumeCalls
    }));
  const cdp = await page.createCDPSession();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: input.x, y: input.bottom - input.height * 0.25}]
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{x: input.x, y: input.bottom - input.height * 0.65}]
  });
  assert.equal((await probe()).value, '65');
  assert.equal((await probe()).fill, '65%');
  assert.equal((await probe()).calls.length, 0);
  await page.evaluate(() => {
    const old = window.volumeHass.states['media_player.test'];
    window.volumeHass.states['media_player.test'] = {
      ...old,
      attributes: {...old.attributes, volume_level: 0.1}
    };
    window.card.hass = window.volumeHass;
  });
  assert.equal((await probe()).value, '65');
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await page.waitForFunction('window.volumeCalls.length === 1');
  assert.deepEqual((await probe()).calls[0], {
    d: 'media_player',
    s: 'volume_set',
    data: {entity_id: 'media_player.test', volume_level: 0.65}
  });
  console.log(
    'PASS volume button opens without playback; real touch, immediate fill, HA updates during drag, one release command'
  );
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: input.x, y: input.bottom - input.height * 0.3}]
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{x: input.x, y: input.bottom - input.height * 0.8}]
  });
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
  assert.equal((await probe()).value, '65');
  assert.equal((await probe()).calls.length, 1);
  await page.keyboard.press('Home');
  await page.waitForFunction('window.volumeCalls.length === 2');
  assert.equal((await probe()).calls[1].s, 'volume_set');
  assert.equal((await probe()).calls[1].data.volume_level, 0);
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction('window.volumeCalls.length === 3');
  assert.equal((await probe()).calls[2].data.volume_level, 0.01);
  await page.mouse.move(input.x, input.bottom - input.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(input.x, input.top - 40);
  await page.mouse.up();
  await page.waitForFunction('window.volumeCalls.length === 4');
  assert.equal((await probe()).calls[3].data.volume_level, 1);
  console.log(
    'PASS cancelled drag restores volume, native keyboard, zero stays a volume command, and mouse capture clamps to 100%'
  );
  await click('[data-action="media-player-volume-mute"]');
  await page.waitForFunction('window.volumeCalls.length === 5');
  assert.deepEqual((await probe()).calls[4].data, {
    entity_id: 'media_player.test',
    is_volume_muted: true
  });
  await page.evaluate(() => {
    const old = window.volumeHass.states['media_player.test'];
    window.volumeHass.states['media_player.test'] = {
      ...old,
      attributes: {...old.attributes, volume_level: 0.35, is_volume_muted: true}
    };
    window.card.hass = window.volumeHass;
  });
  assert.equal((await probe()).value, '35');
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.ov-volume-muted').textContent),
    'Muted'
  );
  await click('[data-action="media-player-volume-mute"]');
  await page.waitForFunction('window.volumeCalls.length === 6');
  assert.equal((await probe()).calls[5].data.is_volume_muted, false);
  await page.evaluate(async () => {
    for (const a of [
      'media-player-volume-set-101',
      'media-player-volume-set--1',
      'media-player-volume-set-1.5',
      'media-player-volume-set-NaN'
    ])
      await window.card._act(a, 'media_player.test');
  });
  assert.equal((await probe()).calls.length, 6);
  console.log(
    'PASS mute/unmute follows supported features, authoritative updates and invalid values'
  );
  await page.evaluate(() => {
    window.holdVolume = true;
    const input = window.card.shadowRoot.querySelector('.ov-volume-input');
    for (const value of ['15', '40', '80']) {
      input.value = value;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.dispatchEvent(new Event('change', {bubbles: true}));
    }
  });
  await page.waitForFunction('window.volumeCalls.length === 7');
  await page.evaluate(() => window.advance(2));
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.ov-volume-input')),
    true
  );
  assert.equal((await probe()).calls[6].data.volume_level, 0.15);
  assert.equal((await probe()).value, '80');
  await page.evaluate(() => window.volumeResolves.shift()());
  await page.waitForFunction('window.volumeCalls.length === 8');
  assert.equal((await probe()).calls[7].data.volume_level, 0.8);
  await page.evaluate(() => {
    window.holdVolume = false;
    window.volumeResolves.shift()();
  });
  console.log('PASS slow service queues only the latest volume while retaining local feedback');
  await page.evaluate(() => {
    const old = window.volumeHass.states['media_player.test'];
    window.volumeHass.states['media_player.test'] = {...old, state: 'unavailable'};
    window.card.hass = window.volumeHass;
  });
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.ov-volume-input').disabled),
    true
  );
  await page.evaluate(() => window.card._act('media-player-volume-set-50', 'media_player.test'));
  assert.equal((await probe()).calls.length, 8);
  await page.evaluate(() =>
    window.card.shadowRoot.querySelector('[data-action="overview-close"]').focus()
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction('!window.card.shadowRoot.querySelector(".hv-screensaver")');
  await page.evaluate(() => {
    window.fake.now += 1000;
    const old = window.volumeHass.states['media_player.test'];
    window.volumeHass.states['media_player.test'] = {
      ...old,
      state: 'playing',
      attributes: {...old.attributes, supported_features: 0}
    };
    window.card.hass = window.volumeHass;
  });
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.mc-volume').disabled),
    true
  );
  await page.evaluate(() => window.card._act('media-player-volume-view', 'media_player.test'));
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.hv-screensaver')),
    false
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS unavailable and unsupported speakers cannot adjust, Escape closes, no browser errors'
  );
} finally {
  await browser.close();
  await server.close();
}
