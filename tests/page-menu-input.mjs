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
      pages: [{name: 'Home'}, {name: 'More'}, {name: 'Last'}],
      widgets: [
        {type: 'light', entity: 'light.a', page: 'Home', action: 'toggle'},
        {type: 'light', entity: 'light.b', page: 'More', action: 'toggle'},
        {type: 'clock', page: 'Last'}
      ]
    });
    window.card.hass = window.mock.hass;
  });
  const point = (selector) =>
    page.evaluate((s) => {
      const r = window.card.shadowRoot.querySelector(s).getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, selector);
  for (const target of [1, 0]) {
    const dot = await point('.page-dot');
    // a tap goes straight to that page; a hold opens the menu
    const dots = await page.evaluate(
      () => window.card.shadowRoot.querySelectorAll('.page-dot').length
    );
    const tapPage = (target + 1) % dots;
    const other = await page.evaluate((i) => {
      const r = window.card.shadowRoot.querySelectorAll('.page-dot')[i].getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, tapPage);
    await page.mouse.click(other.x, other.y);
    assert.equal(
      await page.evaluate(() => !!window.card.shadowRoot.querySelector('.page-menu')),
      false,
      'tap does not open the menu'
    );
    assert.equal(
      await page.evaluate(() => window.card._pageIndex),
      tapPage,
      'tap goes to that page'
    );
    await page.mouse.move(dot.x, dot.y);
    await page.mouse.down();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 700)));
    await page.mouse.up();
    await page.evaluate(() => window.advance(1)); // the page's clock is fake: let the click guard lapse
    assert.ok(
      await page.evaluate(() => !!window.card.shadowRoot.querySelector('.page-menu')),
      'menu opens'
    );
    const item = await point(`.page-menu-item[data-page="${target}"]`);
    await page.mouse.click(item.x, item.y);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    assert.equal(
      await page.evaluate(() => !!window.card.shadowRoot.querySelector('.page-menu')),
      false,
      `menu closes after choosing page ${target}`
    );
  }
  // Held scene: the "All Scenes" chip lists the scenes of the pressed scene's own room.
  await page.evaluate(() => {
    const scene = (name) => ({state: 'scened', attributes: {friendly_name: name}});
    const hass = window.mock.hass;
    window.card.setConfig({
      tablet_mode: true,
      widgets: [
        {type: 'action', entity: 'scene.k1'},
        {type: 'action', entity: 'scene.b1'}
      ]
    });
    window.card.hass = {
      ...hass,
      states: {
        ...hass.states,
        'scene.k1': scene('Kitchen One'),
        'scene.k2': scene('Kitchen Two'),
        'scene.b1': scene('Bed One'),
        'scene.b2': scene('Bed Two')
      },
      entities: {
        'scene.k1': {area_id: 'kitchen'},
        'scene.k2': {area_id: 'kitchen'},
        'scene.b1': {area_id: 'bed'},
        'scene.b2': {area_id: 'bed'}
      }
    };
  });
  for (const [held, expected] of [
    ['scene.k1', ['Kitchen One', 'Kitchen Two']],
    ['scene.b1', ['Bed One', 'Bed Two']]
  ]) {
    await page.evaluate((id) => window.card._openSceneMenu(id), held);
    const chip = await point('.page-menu-chip');
    await page.mouse.click(chip.x, chip.y);
    const labels = await page.evaluate(() =>
      [...window.card.shadowRoot.querySelectorAll('.page-menu-item span')].map((n) => n.textContent)
    );
    assert.deepEqual(labels.sort(), expected, `all scenes of ${held}'s room`);
    await page.evaluate(() => window.card._closePageMenu());
  }
  assert.deepEqual(errors, []);
  console.log('page menu closes on selection');
} finally {
  await browser.close();
  await server.close?.();
}
