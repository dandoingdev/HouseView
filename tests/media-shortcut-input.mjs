/* global document, window, CSSRule, getComputedStyle */
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
  await page.setViewport({width: 1280, height: 800, hasTouch: true});
  await page.goto(`${server.url}/tests/media-library.html?preview`);
  await page.waitForFunction(() =>
    document.querySelector('#summary').textContent.includes('0 failed')
  );
  await page.evaluate(() => {
    window.card = document.querySelector('houseview-card');
    window.quickCalls = [];
    window.quickConfig = {
      tablet_mode: true,
      show_header: true,
      bedtime: true,
      home_overview: true,
      pages: [{name: 'Music'}, {name: 'Lights'}],
      widgets: [
        {type: 'media_player', entity: 'media_player.a', name: 'Kitchen', page: 'Music'},
        {type: 'media_player', entity: 'media_player.b', name: 'Studio', page: 'Music'},
        {type: 'switch', entity: 'switch.test', page: 'Lights'}
      ]
    };
    window.quickHass = {
      locale: {language: 'en'},
      config: {time_zone: 'Europe/London'},
      states: {
        'media_player.a': {
          state: 'playing',
          attributes: {
            media_title: 'Golden hour',
            media_artist: 'The House Band',
            supported_features: 512
          }
        },
        'media_player.b': {
          state: 'playing',
          attributes: {media_title: 'Soft focus', supported_features: 512}
        },
        'switch.test': {state: 'off', attributes: {}}
      },
      callService: async (d, s, data) => {
        window.quickCalls.push({d, s, data});
        if (window.slowQuick)
          await new Promise((resolve) => {
            window.finishQuick = resolve;
          });
      }
    };
    window.quickState = (entity, state) => {
      window.quickHass.states[entity] = {...window.quickHass.states[entity], state};
      window.card.hass = {...window.quickHass};
    };
    window.card.setConfig(window.quickConfig);
    window.card.hass = window.quickHass;
  });
  await page.waitForSelector('houseview-card >>> .dashboard-control');
  const tap = async (selector) => {
    const point = await page.evaluate((selector) => {
      const r = window.card.shadowRoot.querySelector(selector).getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, selector);
    await page.touchscreen.tap(point.x, point.y);
  };
  const probe = () =>
    page.evaluate(() => {
      const root = window.card.shadowRoot;
      const button = root.querySelector('.dashboard-control');
      const rect = (node) => {
        const r = node.getBoundingClientRect();
        return {x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height};
      };
      const target = rect(button),
        icon = rect(button.querySelector('ha-icon'));
      const others = [
        ...root.querySelectorAll('.dim-screen,.home-button,.page-nav button,.dashboard-header time')
      ]
        .filter((node) => getComputedStyle(node).visibility !== 'hidden')
        .map(rect);
      const chip = getComputedStyle(button, '::before');
      return {
        chip: {top: parseFloat(chip.top), bottom: parseFloat(chip.bottom)},
        parent: rect(button.parentElement),
        date: root.querySelector('.dashboard-date')
          ? rect(root.querySelector('.dashboard-date'))
          : null,
        time: root.querySelector('.dashboard-time')
          ? rect(root.querySelector('.dashboard-time'))
          : null,
        target,
        icon,
        others,
        header: button.parentElement.classList.contains('dashboard-header'),
        entity: button.dataset.entity,
        label: button.getAttribute('aria-label'),
        disabled: button.disabled,
        overflow: root.querySelector('.shell').scrollHeight > window.innerHeight
      };
    });
  const checkGeometry = async (width, height, header) => {
    const result = await probe(),
      a = result.target,
      i = result.icon;
    assert.ok(
      a.w >= 56 &&
        a.h >= 56 &&
        (header
          ? a.w > a.h &&
            result.chip.top >= 8 &&
            result.chip.bottom >= 8 &&
            Math.abs(result.parent.right - a.right - 10) <= 1 &&
            Math.abs(result.date.x - result.parent.x - 10) <= 1 &&
            Math.abs(result.time.x + result.time.w / 2 - result.parent.x - result.parent.w / 2) <= 1
          : a.h === a.w) &&
        a.x >= 0 &&
        a.y >= 0 &&
        a.right <= width &&
        a.bottom <= height &&
        Math.abs(a.x + a.w / 2 - i.x - i.w / 2) <= 1 &&
        Math.abs(a.y + a.h / 2 - i.y - i.h / 2) <= 1 &&
        result.others.every(
          (b) =>
            a.right <= b.x + 0.5 ||
            b.right <= a.x + 0.5 ||
            a.bottom <= b.y + 0.5 ||
            b.bottom <= a.y + 0.5
        ) &&
        result.header === header &&
        !result.overflow,
      `FAIL shortcut geometry at ${width}×${height}: ${JSON.stringify(result)}`
    );
  };
  assert.equal((await probe()).entity, 'media_player.a');
  assert.equal((await probe()).label, 'Pause music on Kitchen');
  await page.evaluate(() => {
    window.quickButton = window.card.shadowRoot.querySelector('.dashboard-control');
    window.quickButton.focus();
    window.slowQuick = true;
  });
  await tap('.dashboard-control');
  await page.waitForFunction(
    () => window.finishQuick && window.card.shadowRoot.querySelector('.dashboard-control').disabled
  );
  await tap('.dashboard-control');
  assert.equal(await page.evaluate(() => window.quickCalls.length), 1);
  await page.evaluate(() => {
    window.quickState('media_player.a', 'paused');
    window.slowQuick = false;
    window.finishQuick();
  });
  await page.waitForFunction(
    () => !window.card.shadowRoot.querySelector('.dashboard-control').disabled
  );
  assert.equal((await probe()).label, 'Play music on Kitchen');
  assert.equal(
    (await probe()).entity,
    'media_player.a',
    'pausing does not switch to another playing speaker'
  );
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.dashboard-control') === window.quickButton
    ),
    true
  );
  await page.focus('houseview-card >>> .dashboard-control');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.quickCalls.length === 2);
  assert.deepEqual(await page.evaluate(() => window.quickCalls), [
    {d: 'media_player', s: 'media_play_pause', data: {entity_id: 'media_player.a'}},
    {d: 'media_player', s: 'media_play_pause', data: {entity_id: 'media_player.a'}}
  ]);
  await page.evaluate(() => window.card._setPage(1));
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.dashboard-control') === window.quickButton
    ),
    true
  );
  console.log(
    'PASS real touch and keyboard pause/resume the same speaker across pages; pending requests prevent duplicate calls'
  );

  for (const [width, height] of [
    [1280, 800],
    [768, 1024],
    [1024, 768],
    [640, 360],
    [480, 480],
    [320, 568],
    [240, 640]
  ]) {
    await page.setViewport({width, height, hasTouch: true});
    await new Promise((resolve) => setTimeout(resolve, 180));
    await checkGeometry(width, height, width < 700);
    assert.equal(
      await page.evaluate(
        () => window.card.shadowRoot.querySelector('.dashboard-control') === window.quickButton
      ),
      true
    );
    if (width === 480 || width === 768) {
      await page.evaluate(() => window.card.shadowRoot.activeElement?.blur());
      await page.screenshot({path: `/tmp/houseview-shortcut-${width}.png`});
    }
    if (width === 480) {
      await page.evaluate(() => window.quickState('media_player.a', 'playing'));
      await page.screenshot({
        path: '/tmp/houseview-chip-toolbar-playing.png',
        clip: {x: 0, y: 0, width: 480, height: 112}
      });
      await page.evaluate(() => window.quickState('media_player.a', 'paused'));
      await page.screenshot({
        path: '/tmp/houseview-chip-toolbar-paused.png',
        clip: {x: 0, y: 0, width: 480, height: 112}
      });
    }
    console.log(
      `PASS shortcut size, icon centring, placement and no overlap at ${width}×${height}`
    );
  }
  await page.evaluate(() => {
    window.card.setConfig({...window.quickConfig, show_header: false, bedtime: false});
    window.card.hass = {...window.quickHass};
  });
  assert.equal(
    await page.evaluate(
      () =>
        !window.card.shadowRoot.querySelector('.dim-screen') &&
        !!window.card.shadowRoot.querySelector('.dashboard-header.controls-only .dashboard-control')
    ),
    true
  );
  await checkGeometry(240, 640, true);
  await page.evaluate(() => window.quickState('media_player.a', 'idle'));
  assert.equal((await probe()).entity, 'media_player.b');
  await page.evaluate(() => window.quickState('media_player.b', 'unavailable'));
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.dashboard-control')),
    false
  );
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.dashboard-header')),
    false
  );
  const callCount = await page.evaluate(() => window.quickCalls.length);
  await page.evaluate(() => window.card._act('media-player-quick-toggle', 'media_player.a'));
  assert.equal(await page.evaluate(() => window.quickCalls.length), callCount);
  await page.evaluate(() => {
    window.quickState('media_player.a', 'playing');
    window.card.setConfig({
      ...window.quickConfig,
      widgets: [{type: 'switch', entity: 'switch.test'}]
    });
    window.card.hass = {...window.quickHass};
  });
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.dashboard-control')),
    false
  );
  console.log(
    'PASS stopped, unavailable and unconfigured speakers cannot be controlled; compact toolbar works without a clock header or dimmer'
  );

  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.evaluate(() => {
    window.card.setConfig(window.quickConfig);
    window.card.hass = {...window.quickHass};
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
  await new Promise((resolve) => setTimeout(resolve, 180));
  await checkGeometry(480, 480, true);
  await tap('.dashboard-control');
  await page.waitForFunction((count) => window.quickCalls.length === count + 1, {}, callCount);
  assert.deepEqual(errors, []);
  console.log('PASS legacy WebView shortcut geometry and real touch action; no browser errors');
} finally {
  await browser.close();
  await server.close();
}
