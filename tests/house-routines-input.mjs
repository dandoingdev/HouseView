import {emulateLegacyCSS} from './fixtures/legacy-css.mjs';
/* global window, document, MutationObserver */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {startServer} from '../tools/serve.mjs';
import {CHROME} from '../tools/run-tests.mjs';
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
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.goto(`${server.url}/tests/media-library.html?preview`);
  await page.waitForFunction(() =>
    document.querySelector('#summary').textContent.includes('0 failed')
  );
  await page.evaluate(() => {
    window.card = document.querySelector('houseview-card');
    window.routineCalls = [];
    window.routineConfig = {
      tablet_mode: true,
      performance: 'lite',
      home_overview: true,
      house_mode_entity: 'input_select.house_mode',
      pages: [{name: 'Living'}, {name: 'Rooms'}],
      widgets: [
        {type: 'switch', entity: 'switch.a', page: 'Living'},
        {type: 'switch', entity: 'switch.b', page: 'Rooms'}
      ],
      quick_actions: [{flow: 'away'}, {flow: 'sleeping'}],
      house_modes: ['Home', 'Away', 'Guests', 'Evening', 'Sleeping'].map((option) => ({
        mode: option.toLowerCase(),
        option,
        description:
          option === 'Away'
            ? 'Turn off shared-room lights, lock the front door and arm the alarm.'
            : option === 'Sleeping'
              ? 'Settle the house, turn off shared-room lights and arm the night alarm.'
              : 'Restore your configured everyday routine.',
        ...(['Away', 'Sleeping'].includes(option)
          ? {
              script: option === 'Away' ? 'script.leave_home' : 'script.good_night',
              checks: [
                {kind: 'opening', entity: 'binary_sensor.kitchen_window', name: 'Kitchen window'},
                {kind: 'opening', entity: 'binary_sensor.back_door', name: 'Back door'},
                {kind: 'opening', entity: 'binary_sensor.roof_window', name: 'Roof window'},
                {kind: 'light', entity: 'light.hall', name: 'Hall lights'},
                {kind: 'light', entity: 'light.lounge', name: 'Lounge lights'},
                {kind: 'lock', entity: 'lock.front', name: 'Front door'},
                {kind: 'climate', entity: 'climate.home', name: 'Heating'},
                {
                  kind: 'alarm',
                  entity: 'alarm_control_panel.home',
                  name: 'Alarm',
                  expected_state: option === 'Away' ? 'armed_away' : 'armed_night'
                }
              ]
            }
          : {})
      }))
    };
    window.routineHass = {
      locale: {language: 'en-GB'},
      config: {time_zone: 'Europe/London'},
      states: {
        'switch.a': {state: 'off', attributes: {}},
        'switch.b': {state: 'off', attributes: {}},
        'input_select.house_mode': {
          state: 'Home',
          attributes: {options: ['Home', 'Away', 'Guests', 'Evening', 'Sleeping']}
        },
        'script.leave_home': {state: 'off', attributes: {}},
        'script.good_night': {state: 'off', attributes: {}},
        'binary_sensor.kitchen_window': {state: 'on', attributes: {}},
        'binary_sensor.back_door': {state: 'off', attributes: {}},
        'binary_sensor.roof_window': {state: 'unknown', attributes: {}},
        'light.hall': {state: 'on', attributes: {}},
        'light.lounge': {state: 'off', attributes: {}},
        'lock.front': {state: 'unlocked', attributes: {}},
        'climate.home': {state: 'heat', attributes: {hvac_modes: ['off', 'heat']}},
        'alarm_control_panel.home': {state: 'disarmed', attributes: {}}
      },
      callService: async (d, s, data) => {
        window.routineCalls.push({d, s, data});
        if (d === 'script') {
          if (window.slowRoutine)
            await new Promise((resolve) => {
              window.finishRoutine = resolve;
            });
          if (window.failRoutine) {
            window.routineReport({'light.hall': 'off'});
            throw Error('Synthetic routine failure');
          }
        }
        if (window.failFix && d === 'light') throw Error('Synthetic light failure');
        if (d === 'light') window.routineReport({[data.entity_id]: 'off'});
        if (d === 'lock') window.routineReport({[data.entity_id]: 'locked'});
        if (d === 'climate') window.routineReport({[data.entity_id]: data.hvac_mode});
      }
    };
    window.routineReport = (updates) => {
      const states = {...window.routineHass.states};
      for (const [entity, state] of Object.entries(updates))
        states[entity] = {state, attributes: states[entity]?.attributes || {}};
      window.routineHass = {...window.routineHass, states};
      window.card.hass = window.routineHass;
    };
    window.card.setConfig(window.routineConfig);
    window.card.hass = window.routineHass;
  });
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const tap = async (selector) => {
    const p = await page.evaluate((selector) => {
      const b = window.card.shadowRoot.querySelector(selector);
      b.scrollIntoView({block: 'center'});
      const r = b.getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, selector);
    await page.touchscreen.tap(p.x, p.y);
  };
  const report = (updates) => page.evaluate((updates) => window.routineReport(updates), updates);
  const count = () => page.evaluate(() => window.routineCalls.length);
  const open = async (mode = 'away') => {
    await tap('.house-mode-indicator');
    await tap(`[data-house-mode="${mode}"]`);
    await page.waitForSelector('houseview-card >>> .hr-panel');
  };
  const close = async () => {
    await page.keyboard.press('Escape');
    if (await page.evaluate(() => !!window.card._houseModes?.open))
      await page.keyboard.press('Escape');
    try {
      await page.waitForFunction(() => !window.card._houseModes?.open, {timeout: 3000});
    } catch (error) {
      console.error(
        'FAIL closing routine',
        await page.evaluate(() => ({
          focus: window.card.shadowRoot.activeElement?.outerHTML,
          stage: window.card._houseModes?.routine?.stage,
          mode: window.routineHass.states['input_select.house_mode'].state
        }))
      );
      throw error;
    }
    await pause(450);
  };
  await pause(180);
  await open();
  assert.equal(await count(), 0);
  assert.match(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hm-heading h2').textContent),
    /Leaving home/
  );
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.querySelectorAll('.hr-check').length),
    8
  );
  const statuses = await page.evaluate(() =>
    [...window.card.shadowRoot.querySelectorAll('.hr-check')].map((node) => node.dataset.status)
  );
  assert.equal(statuses.filter((status) => status === 'unknown').length, 1);
  assert.deepEqual(statuses, [
    'attention',
    'attention',
    'attention',
    'attention',
    'attention',
    'unknown',
    'ready',
    'ready'
  ]);
  await page.evaluate(() => {
    window.savedRoutineRow = window.card.shadowRoot.querySelector('[data-check-index="3"]');
    window.failFix = true;
  });
  await tap('[data-check-index="3"] .hr-fix');
  await pause(50);
  assert.match(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('[data-check-index="3"] .hr-fix-error').textContent
    ),
    /Synthetic light failure/
  );
  await page.evaluate(() => {
    window.failFix = false;
  });
  await tap('[data-check-index="3"] .hr-fix');
  await pause(50);
  assert.equal(
    await page.evaluate(
      () =>
        window.savedRoutineRow === window.card.shadowRoot.querySelector('[data-check-index="3"]')
    ),
    true
  );
  await tap('[data-check-index="5"] .hr-fix');
  await tap('[data-check-index="6"] .hr-fix');
  assert.deepEqual(
    await page.evaluate(() =>
      window.routineCalls.slice(-3).map((call) => [call.d, call.s, call.data.entity_id])
    ),
    [
      ['light', 'turn_off', 'light.hall'],
      ['lock', 'lock', 'lock.front'],
      ['climate', 'set_hvac_mode', 'climate.home']
    ]
  );
  await tap('.hr-start');
  await page.waitForFunction(() => window.card._houseModes.routine.stage === 'verifying');
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.house-mode-indicator strong').textContent
    ),
    'Home'
  );
  assert.deepEqual(
    await page.evaluate(() => window.routineCalls.slice(-2).map((call) => [call.d, call.s])),
    [
      ['script', 'leave_home'],
      ['input_select', 'select_option']
    ]
  );
  await report({
    'input_select.house_mode': 'Away',
    'binary_sensor.kitchen_window': 'off',
    'alarm_control_panel.home': 'armed_away'
  });
  assert.equal(await page.evaluate(() => window.card._houseModes.routine.stage), 'verifying');
  await page.evaluate(() => window.card._finishHouseRoutine());
  assert.match(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hr-headline').textContent),
    /couldn’t be verified/
  );
  assert.match(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hr-mode-state').textContent),
    /confirmed: Away/
  );
  assert.match(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('[data-check-index="2"] .hr-detail').textContent
    ),
    /Couldn’t check/
  );
  await page.evaluate(() => {
    window.card.shadowRoot.querySelector('.hm-scroll').scrollTop = 0;
    window.card.shadowRoot.activeElement?.blur();
  });
  await page.screenshot({path: '/tmp/houseview-leaving-home-result-480.png'});
  await page.evaluate(() =>
    window.card.shadowRoot.querySelector('.hm-close').focus({preventScroll: true})
  );
  console.log(
    'PASS readiness review runs nothing; explicit fixes target one device, errors remain visible, and unknown checks never become verified'
  );
  await close();
  await report({'input_select.house_mode': 'Home', 'binary_sensor.roof_window': 'off'});
  await open('sleeping');
  await tap('.hr-start');
  await page.waitForFunction(() => window.card._houseModes.routine.stage === 'verifying');
  await report({'input_select.house_mode': 'Sleeping', 'alarm_control_panel.home': 'armed_night'});
  assert.equal(await page.evaluate(() => window.card._houseModes.routine.stage), 'result');
  assert.match(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hr-headline').textContent),
    /checks are verified/
  );
  assert.equal(await page.evaluate(() => window.card._houseModes.routine.verificationHandle), null);
  assert.equal(
    await page.evaluate(() => window.routineCalls.filter((call) => call.d === 'script').at(-1).s),
    'good_night'
  );
  await close();
  await report({'input_select.house_mode': 'Home'});
  await open();
  await page.evaluate(() => {
    window.failRoutine = true;
  });
  const beforeFailure = await count();
  await tap('.hr-start');
  await page.waitForFunction(() => window.card._houseModes.routine.stage === 'result');
  assert.equal(await count(), beforeFailure + 1);
  assert.match(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hr-message').textContent),
    /Synthetic routine failure/
  );
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.house-mode-indicator strong').textContent
    ),
    'Home'
  );
  await page.evaluate(() => {
    window.failRoutine = false;
  });
  await close();
  console.log(
    'PASS Good night verifies its configured alarm state; partial script failure preserves the actual mode and reports real device states'
  );
  await open();
  await tap('.hr-start');
  await page.waitForFunction(() => window.card._houseModes.routine.stage === 'verifying');
  await page.evaluate(() => window.card._finishHouseRoutine());
  assert.match(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hr-mode-state').textContent),
    /not confirmed/
  );
  await close();
  const client = await page.createCDPSession();
  const swipe = async (x, y, dx, dy) => {
    await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
    for (let i = 1; i <= 10; i++)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{x: x + (dx * i) / 10, y: y + (dy * i) / 10}]
      });
    await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  };
  const callsBeforeQuick = await count();
  await swipe(240, 460, 0, -150);
  await page.waitForSelector('houseview-card >>> .quick-actions');
  await pause(450);
  await tap('[data-quick-index="0"]');
  await page.waitForSelector('houseview-card >>> .hr-panel');
  assert.equal(await page.evaluate(() => !!window.card._quickActions), false);
  assert.equal(await count(), callsBeforeQuick);
  await close();
  await swipe(240, 460, 0, -150);
  await pause(450);
  await tap('[data-quick-index="1"]');
  assert.equal(await page.evaluate(() => window.card._houseModes.routine.mode), 'sleeping');
  assert.equal(await count(), callsBeforeQuick);
  await close();
  console.log(
    'PASS missing mode echoes remain unconfirmed; both Quick action shortcuts open review without calling a device service'
  );
  await page.evaluate(() => {
    const empty = {
      ...window.routineConfig,
      house_modes: window.routineConfig.house_modes.map((mode) =>
        mode.mode === 'away' ? {...mode, checks: []} : mode
      )
    };
    window.card.setConfig(empty);
    window.card.hass = window.routineHass;
  });
  await open();
  await tap('.hr-start');
  await page.waitForFunction(() => window.card._houseModes.routine.stage === 'verifying');
  await report({'input_select.house_mode': 'Away'});
  assert.match(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hr-headline').textContent),
    /no device checks/
  );
  await close();
  await page.evaluate(() => {
    window.card.setConfig(window.routineConfig);
    window.card.hass = window.routineHass;
  });
  await report({'input_select.house_mode': 'Home'});
  await open();
  await page.evaluate(() => {
    window.routineHass = {...window.routineHass, connected: false};
    window.card.hass = window.routineHass;
  });
  const offlineCalls = await count();
  await page.evaluate(() => window.card._startHouseRoutine());
  assert.equal(await count(), offlineCalls);
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hr-start').disabled),
    true
  );
  assert.equal(
    await page.evaluate(() =>
      [...window.card.shadowRoot.querySelectorAll('.hr-check')].every(
        (node) => node.dataset.status === 'unknown'
      )
    ),
    true
  );
  await page.evaluate(() => {
    window.routineHass = {...window.routineHass, connected: true};
    window.card.hass = window.routineHass;
  });
  await close();
  console.log(
    'PASS no-check routines never certify devices; disconnected states disable activation and remain unverified'
  );
  await report({
    'binary_sensor.kitchen_window': 'on',
    'binary_sensor.roof_window': 'unknown',
    'light.hall': 'on',
    'lock.front': 'unlocked',
    'climate.home': 'heat',
    'alarm_control_panel.home': 'disarmed'
  });
  for (const [width, height] of [
    [480, 480],
    [320, 568],
    [240, 640],
    [640, 360],
    [768, 1024],
    [1024, 768]
  ]) {
    await page.setViewport({width, height, hasTouch: true});
    await pause(150);
    await open();
    const callsBeforeInfo = await count();
    assert.equal(
      await page.evaluate(() => window.card.shadowRoot.querySelector('.hr-description').hidden),
      true
    );
    await tap('.hr-summary .hm-info');
    assert.equal(
      await page.evaluate(() => window.card.shadowRoot.querySelector('.hr-description').hidden),
      false
    );
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hr-summary .hm-info').focus());
    await page.keyboard.press('Escape');
    assert.equal(
      await page.evaluate(() => window.card.shadowRoot.querySelector('.hr-description').hidden),
      true
    );
    assert.equal(await page.evaluate(() => window.card._houseModes.routine.stage), 'review');
    assert.equal(await count(), callsBeforeInfo);
    const geometry = await page.evaluate(() => {
      const root = window.card.shadowRoot.querySelector('.house-modes');
      const footer = root.querySelector('.hm-footer').getBoundingClientRect();
      return {
        width: root.scrollWidth,
        height: root.scrollHeight,
        buttons: [...root.querySelectorAll('.hr-panel button,.hr-actions button,.hm-close')]
          .filter((b) => !b.hidden)
          .map((button) => {
            button.scrollIntoView({block: 'center'});
            const r = button.getBoundingClientRect();
            return {
              footer: !!button.closest('.hr-actions'),
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              w: r.width,
              h: r.height
            };
          }),
        footerY: footer.y
      };
    });
    assert.ok(
      geometry.width <= width &&
        geometry.height <= height &&
        geometry.buttons.every(
          (b) =>
            b.w >= 64 &&
            b.h >= 64 &&
            b.x >= 0 &&
            b.right <= width &&
            b.y >= 0 &&
            (b.footer ? b.bottom <= height : b.bottom <= geometry.footerY)
        ),
      `FAIL guided layout ${width}×${height}: ${JSON.stringify(geometry)}`
    );
    await page.evaluate(() => {
      window.card.shadowRoot.querySelector('.hm-scroll').scrollTop = 0;
      window.card.shadowRoot.activeElement?.blur();
    });
    if (width === 480 || width === 1024)
      await page.screenshot({path: `/tmp/houseview-leaving-home-${width}.png`});
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hm-close').focus());
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() =>
        window.card.shadowRoot.activeElement?.classList.contains('hm-info')
      ),
      true
    );
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => window.card.shadowRoot.activeElement?.classList.contains('hr-fix')),
      true
    );
    await close();
    console.log(
      `PASS guided checks, fixes and keyboard focus remain reachable at ${width}×${height}`
    );
  }
  await open();
  const stable = await page.evaluate(() => {
    const card = window.card;
    const root = card.shadowRoot.querySelector('.house-modes');
    const buttons = [...root.querySelectorAll('.hr-fix')];
    const observer = new MutationObserver(() => {});
    observer.observe(root, {attributes: true, childList: true, subtree: true, characterData: true});
    for (let i = 0; i < 10; i++) card._syncHouseRoutine();
    const writes = observer.takeRecords().length;
    observer.disconnect();
    return {
      writes,
      same: buttons.every((button, index) => button === root.querySelectorAll('.hr-fix')[index])
    };
  });
  assert.deepEqual(
    stable,
    {writes: 0, same: true},
    `FAIL unchanged routine mutated DOM: ${JSON.stringify(stable)}`
  );
  await close();
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await pause(150);
  await page.evaluate(emulateLegacyCSS);
  await open();
  const legacy = await page.evaluate(() =>
    [...window.card.shadowRoot.querySelectorAll('.hr-fix')]
      .filter((button) => !button.hidden)
      .map((button) => {
        button.scrollIntoView({block: 'center'});
        const r = button.getBoundingClientRect();
        return {w: r.width, h: r.height, x: r.x, right: r.right};
      })
  );
  assert.ok(
    legacy.every(
      (button) => button.w >= 64 && button.h >= 64 && button.x >= 0 && button.right <= 480
    ),
    `FAIL legacy guided targets: ${JSON.stringify(legacy)}`
  );
  await close();
  await open();
  await page.evaluate(() => {
    window.slowRoutine = true;
  });
  await tap('.hr-start');
  await page.waitForFunction(() => !!window.finishRoutine);
  const during = await count();
  await page.evaluate(() => window.card._startHouseRoutine());
  assert.equal(await count(), during);
  await swipe(360, 240, -150, 0);
  await pause(450);
  await page.evaluate(() => {
    window.slowRoutine = false;
    window.finishRoutine();
  });
  await pause(50);
  assert.equal(await count(), during);
  assert.equal(await page.evaluate(() => !!window.card._houseModes?.open), false);
  await open();
  await tap('.hr-start');
  await page.waitForFunction(() => window.card._houseModes.routine.stage === 'verifying');
  const hadTimer = await page.evaluate(() => !!window.card._houseModes.routine.verificationHandle);
  assert.equal(hadTimer, true);
  await page.evaluate(() => {
    window.detachedRoutine = window.card._houseModes.routine;
    window.card.remove();
  });
  assert.equal(await page.evaluate(() => window.detachedRoutine.verificationHandle), null);
  assert.equal(await page.evaluate(() => window.card._houseModes), null);
  assert.deepEqual(errors, []);
  console.log(
    'PASS duplicate activation, swipe dismissal during a routine and disconnect cannot queue a later mode change or leak verification work'
  );
} finally {
  await browser.close();
  await server.close();
}
