/* global window, document, getComputedStyle, CustomEvent */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {startServer} from '../tools/serve.mjs';
import {CHROME} from '../tools/run-tests.mjs';
import {emulateLegacyCSS} from './fixtures/legacy-css.mjs';
const server = await startServer({
  root: process.cwd(),
  port: 0,
  target: process.argv.includes('--min') ? 'dist-min' : 'dist'
});
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
  await page.goto(`${server.url}/tests/media-library.html?preview`);
  await page.waitForFunction(() =>
    document.querySelector('#summary').textContent.includes('0 failed')
  );
  await page.evaluate(() => {
    window.card = document.querySelector('houseview-card');
    window.lineCalls = [];
    window.lineDetails = [];
    window.card.addEventListener('hass-more-info', (e) =>
      window.lineDetails.push(e.detail.entityId)
    );
    window.lineConfig = {
      tablet_mode: true,
      performance: 'lite',
      show_header: true,
      bedtime: true,
      home_overview: true,
      state_compare: 'reference',
      line_alert_entity: 'sensor.demo_line',
      line_alert_name: 'Example line',
      house_mode_entity: 'input_select.demo_mode',
      pages: [{name: 'Music'}, {name: 'Kitchen'}, {name: 'Rooms'}, {name: 'Garden'}],
      widgets: [
        {type: 'media_player', entity: 'media_player.demo', page: 'Music', size: 'large'},
        ...['Kitchen', 'Rooms', 'Garden'].map((page, i) => ({
          type: 'switch',
          entity: `switch.demo_${i}`,
          page
        }))
      ]
    };
    window.lineHass = {
      locale: {language: 'en-GB', time_format: '24'},
      config: {time_zone: 'Europe/London'},
      states: {
        'sensor.demo_line': {
          state: 'Minor Delays',
          attributes: {
            friendly_name: 'London Underground Example',
            Description: 'Synthetic signal problem. No household data.'
          }
        },
        'input_select.demo_mode': {
          state: 'Home',
          attributes: {options: ['Home', 'Away', 'Guests', 'Evening', 'Sleeping']}
        },
        'media_player.demo': {
          state: 'playing',
          attributes: {
            media_title: 'Demo music',
            media_artist: 'Example artist',
            supported_features: 512
          }
        },
        ...Object.fromEntries(
          [0, 1, 2].map((i) => [`switch.demo_${i}`, {state: 'off', attributes: {}}])
        )
      },
      callService: async (d, s, data) => window.lineCalls.push({d, s, data})
    };
    window.lineReport = (state, extra = {}) => {
      window.lineHass = {
        ...window.lineHass,
        states: {
          ...window.lineHass.states,
          'sensor.demo_line': {...window.lineHass.states['sensor.demo_line'], state, ...extra}
        }
      };
      window.card.hass = window.lineHass;
    };
    window.card.setConfig(window.lineConfig);
    window.card.hass = window.lineHass;
  });
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const tap = async (selector) => {
    const p = await page.evaluate((s) => {
      const r = window.card.shadowRoot.querySelector(s).getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, selector);
    await page.touchscreen.tap(p.x, p.y);
  };
  const geometry = () =>
    page.evaluate(() => {
      const root = window.card.shadowRoot,
        button = root.querySelector('.line-alert');
      const rect = (node) => {
        const r = node.getBoundingClientRect();
        return {x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height};
      };
      const a = rect(button),
        i = rect(button.querySelector('ha-icon'));
      return {
        alert: a,
        icon: i,
        header: button.parentElement.classList.contains('dashboard-header'),
        others: [
          ...root.querySelectorAll(
            '.dashboard-control,.house-mode-indicator,.dashboard-time,.dim-screen,.home-button,.page-nav button'
          )
        ]
          .filter((n) => getComputedStyle(n).visibility !== 'hidden')
          .map(rect),
        time: rect(root.querySelector('.dashboard-time')),
        stacked: root.querySelector('.shell').classList.contains('line-alert-footer-stacked'),
        overflow: root.querySelector('.shell').scrollHeight > window.innerHeight,
        nav: rect(root.querySelector('.page-nav'))
      };
    });
  for (const [width, height] of [
    [480, 480],
    [320, 568],
    [240, 640],
    [440, 480],
    [640, 360],
    [700, 480],
    [768, 1024],
    [1024, 768]
  ]) {
    await page.setViewport({width, height, hasTouch: true});
    await pause(180);
    const g = await geometry();
    const a = g.alert,
      i = g.icon;
    const overlaps = g.others.filter(
      (b) =>
        a.x < b.right - 0.5 && a.right > b.x + 0.5 && a.y < b.bottom - 0.5 && a.bottom > b.y + 0.5
    );
    assert.ok(
      a.w >= 56 &&
        a.h >= 56 &&
        a.x >= 0 &&
        a.y >= 0 &&
        a.right <= width &&
        a.bottom <= height &&
        !overlaps.length &&
        !g.overflow,
      `FAIL alert geometry ${width}x${height}: ${JSON.stringify({...g, overlaps})}`
    );
    assert.equal(g.header, width < 700, `FAIL placement ${width}: ${JSON.stringify(g)}`);
    assert.ok(
      i.x >= a.x + 8 && i.right <= a.right - 8,
      `FAIL footer icon inset ${width}: ${JSON.stringify(g)}`
    );
    assert.ok(
      Math.abs(i.y + i.h / 2 - a.y - a.h / 2) <= 1,
      `FAIL icon vertical centre ${width}: ${JSON.stringify(g)}`
    );
    assert.ok(
      Math.abs(g.time.x + g.time.w / 2 - width / 2) <= 1,
      `FAIL centred clock ${width}: ${JSON.stringify(g)}`
    );
    if (width === 480 || width === 320 || width === 1024)
      await page.screenshot({path: `/tmp/houseview-line-alert-${width}.png`});
    if (width === 768) {
      await tap('.page-dot[data-page="1"]');
      await pause(180);
      const paged = await geometry();
      const collision = paged.others.some(
        (b) =>
          paged.alert.x < b.right - 0.5 &&
          paged.alert.right > b.x + 0.5 &&
          paged.alert.y < b.bottom - 0.5 &&
          paged.alert.bottom > b.y + 0.5
      );
      assert.ok(
        paged.stacked && !collision,
        `FAIL footer reservation after paging: ${JSON.stringify(paged)}`
      );
      await tap('.page-dot[data-page="0"]');
      await pause(180);
    }
    await tap('.line-alert');
    assert.equal(await page.evaluate(() => window.lineDetails.at(-1)), 'sensor.demo_line');
    assert.equal(await page.evaluate(() => window.lineCalls.length), 0);
    console.log(
      `PASS alert coexists with playback, house mode, centred clock and footer navigation at ${width}x${height}`
    );
  }
  await page.evaluate(() => {
    window.lineNode = window.card.shadowRoot.querySelector('.line-alert');
    window.lineReport('Severe Delays');
  });
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.line-alert') === window.lineNode
    ),
    true
  );
  assert.equal(await page.evaluate(() => window.lineNode.dataset.severity), 'critical');
  await page.evaluate(() =>
    window.lineReport('Severe Delays', {
      attributes: {friendly_name: 'Demo line', Description: 'Updated synthetic detail.'}
    })
  );
  assert.match(
    await page.evaluate(() => window.lineNode.getAttribute('aria-label')),
    /Updated synthetic detail/
  );
  await tap('.dashboard-control');
  assert.equal(await page.evaluate(() => window.lineCalls.at(-1).s), 'media_play_pause');
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.line-alert') === window.lineNode
    ),
    true
  );
  for (const state of [
    'Good Service',
    'No Issues',
    'Information',
    'unknown',
    'unavailable',
    'not a transport status'
  ]) {
    await page.evaluate((state) => window.lineReport(state), state);
    await pause(80);
    assert.equal(
      await page.evaluate(() => !!window.card.shadowRoot.querySelector('.line-alert')),
      false,
      `FAIL silent state: ${state}`
    );
    assert.equal(
      await page.evaluate(() => window.card.classList.contains('line-alert-footer-stacked')),
      false
    );
  }
  await page.evaluate(() => window.lineReport('Minor Delays'));
  await page.setViewport({width: 320, height: 568, hasTouch: true});
  await pause(180);
  await page.evaluate(() => {
    window.lineHass = {...window.lineHass, locale: {language: 'en-US', time_format: '12'}};
    window.card.hass = window.lineHass;
  });
  const twelve = await geometry();
  assert.ok(!twelve.overflow, `FAIL 12h narrow toolbar: ${JSON.stringify(twelve)}`);
  await page.evaluate(() => {
    window.card.shadowRoot.querySelector('.line-alert').focus();
    window.lineReport('Good Service');
  });
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.activeElement?.className),
    'dim-screen'
  );
  await page.evaluate(() => {
    window.lineConfig = {...window.lineConfig, line_alert_entity: 'sensor.other_line'};
    window.lineHass = {
      ...window.lineHass,
      states: {
        ...window.lineHass.states,
        'sensor.other_line': {state: 'Part Suspended', attributes: {friendly_name: 'Other line'}}
      }
    };
    window.card.setConfig(window.lineConfig);
    window.card.hass = window.lineHass;
  });
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.line-alert').dataset.entity),
    'sensor.other_line'
  );
  await page.evaluate(() => {
    window.lineHass = {...window.lineHass, connected: false};
    window.card.hass = window.lineHass;
  });
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.line-alert')),
    false
  );
  await page.evaluate(() => {
    window.lineHass = {...window.lineHass, connected: true};
    window.card.hass = window.lineHass;
  });
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.line-alert')),
    true
  );
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await pause(180);
  await page.evaluate(emulateLegacyCSS);
  const legacy = await geometry();
  assert.ok(
    legacy.alert.w >= 56 && legacy.alert.h >= 56 && !legacy.overflow,
    `FAIL legacy alert: ${JSON.stringify(legacy)}`
  );
  await page.evaluate(() => {
    window.card.setConfig({...window.lineConfig, line_alert_entity: ''});
  });
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.line-alert')),
    false
  );
  await page.evaluate(() => {
    window.card.setConfig({
      ...window.lineConfig,
      show_header: false,
      bedtime: false,
      house_mode_entity: undefined,
      widgets: [{type: 'switch', entity: 'switch.demo_0'}]
    });
  });
  await page.setViewport({width: 320, height: 568, hasTouch: true});
  await pause(180);
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.dashboard-header').getBoundingClientRect().height
    ),
    56
  );
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.dashboard-control')),
    false
  );
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.line-alert')),
    true
  );
  await page.setViewport({width: 1024, height: 768, hasTouch: true});
  await pause(180);
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.line-alert').parentElement.className
    ),
    'dashboard-controls'
  );
  await page.evaluate(() => {
    window.lineHass = {
      ...window.lineHass,
      states: {
        ...window.lineHass.states,
        'sensor.other_line': {state: 'Good Service', attributes: {}}
      }
    };
    window.card.hass = window.lineHass;
  });
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.dashboard-controls')),
    false
  );
  await page.evaluate(() => {
    window.card.remove();
    document.body.append(window.card);
    window.card.hass = window.lineHass;
    window.lineHass = {
      ...window.lineHass,
      states: {
        ...window.lineHass.states,
        'sensor.other_line': {state: 'Severe Delays', attributes: {}}
      }
    };
    window.card.hass = window.lineHass;
  });
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.line-alert').dataset.severity),
    'critical'
  );
  await page.evaluate(() => {
    window.card.setConfig({...window.lineConfig, tablet_mode: false});
    window.card.style.width = '320px';
  });
  await pause(180);
  const narrowCard = await page.evaluate(() => {
    const c = window.card.getBoundingClientRect();
    const b = window.card.shadowRoot.querySelector('.line-alert').getBoundingClientRect();
    return {
      width: c.width,
      left: c.left,
      right: c.right,
      buttonLeft: b.left,
      buttonRight: b.right,
      header: window.card.shadowRoot.querySelector('.dashboard-header').getBoundingClientRect()
        .height
    };
  });
  assert.ok(
    narrowCard.width === 320 &&
      narrowCard.buttonLeft >= narrowCard.left &&
      narrowCard.buttonRight <= narrowCard.right &&
      narrowCard.header === 112,
    `FAIL narrow card in wide viewport: ${JSON.stringify(narrowCard)}`
  );
  const reads = await page.evaluate(() => {
    const card = window.card;
    const original = card.getBoundingClientRect;
    let calls = 0;
    card.getBoundingClientRect = function () {
      calls++;
      return original.call(this);
    };
    try {
      card._syncDashboardHeader();
    } finally {
      card.getBoundingClientRect = original;
    }
    return calls;
  });
  assert.equal(reads, 1, `FAIL toolbar repeats size measurements: ${reads}`);
  await page.evaluate(() => {
    const editor = document.createElement('houseview-editor');
    window.lineEditor = editor;
    editor.setConfig(window.lineConfig);
    editor.hass = window.lineHass;
    editor.addEventListener('config-changed', (event) => {
      window.lineEdited = event.detail.config;
    });
    document.body.append(editor);
  });
  await page.waitForFunction(() => !!window.lineEditor._view?.appearance);
  await page.evaluate(() => {
    const form = window.lineEditor._view.appearance;
    form.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: {
          value: {
            ...form.data,
            line_alert_entity: 'sensor.demo_line',
            line_alert_name: 'Test label'
          }
        }
      })
    );
  });
  assert.equal(await page.evaluate(() => window.lineEdited.line_alert_entity), 'sensor.demo_line');
  assert.equal(await page.evaluate(() => window.lineEdited.line_alert_name), 'Test label');
  await page.evaluate(() => {
    const form = window.lineEditor._view.appearance;
    form.dispatchEvent(
      new CustomEvent('value-changed', {detail: {value: {...form.data, line_alert_entity: ''}}})
    );
  });
  assert.equal(await page.evaluate(() => window.lineEdited.line_alert_entity), '');
  await page.evaluate(() => window.lineEditor.remove());
  assert.deepEqual(errors, []);
  console.log(
    'PASS live severity/details, stable nodes, playback, silent/unknown states, sensor replacement, disconnect/reconnect, clear configuration, 12h time and legacy WebView'
  );
} finally {
  await browser.close();
  await server.close();
}
