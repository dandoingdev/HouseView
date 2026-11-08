/* global window, document, CustomEvent, CSSRule */
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
    window.modeCalls = [];
    const descriptions = {
      home: 'Restore everyday lighting and motion routines.',
      away: 'Turn off shared-room lights and use the away heating schedule.',
      guests: 'Keep the hallway lit and pause bedroom motion routines.',
      evening: 'Lower the living room lights and use the evening heating schedule.',
      sleeping: 'Turn off shared-room lights and pause overnight announcements.'
    };
    window.modeConfig = {
      tablet_mode: true,
      performance: 'lite',
      home_overview: true,
      show_header: true,
      bedtime: true,
      pages: [{name: 'Living'}, {name: 'Rooms'}],
      widgets: [
        {type: 'switch', entity: 'switch.a', page: 'Living'},
        {type: 'switch', entity: 'switch.b', page: 'Rooms'}
      ],
      house_mode_entity: 'input_select.house_mode',
      house_modes: ['Home', 'Away', 'Guests', 'Evening', 'Sleeping'].map((option) => ({
        mode: option.toLowerCase(),
        option,
        description: descriptions[option.toLowerCase()]
      }))
    };
    window.modeHass = {
      locale: {language: 'en-GB'},
      config: {time_zone: 'Europe/London'},
      states: {
        'switch.a': {state: 'off', attributes: {}},
        'switch.b': {state: 'off', attributes: {}},
        'input_select.house_mode': {
          state: 'Home',
          attributes: {options: ['Home', 'Away', 'Guests', 'Evening', 'Sleeping']}
        }
      },
      callService: async (d, s, data) => {
        window.modeCalls.push({d, s, data});
        if (window.failMode) throw Error('Synthetic mode failure');
        if (window.slowMode)
          await new Promise((resolve) => {
            window.finishMode = resolve;
          });
      }
    };
    window.card.setConfig(window.modeConfig);
    window.card.hass = window.modeHass;
  });
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const tap = async (selector) => {
    const point = await page.evaluate((selector) => {
      const b = window.card.shadowRoot.querySelector(selector);
      b.scrollIntoView({block: 'center'});
      const r = b.getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, selector);
    await page.touchscreen.tap(point.x, point.y);
  };
  const client = await page.createCDPSession();
  const swipe = async (x, y, dx, dy = 0) => {
    await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
    for (let i = 1; i <= 10; i++)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{x: x + (dx * i) / 10, y: y + (dy * i) / 10}]
      });
    await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  };
  const open = async () => {
    await tap('.house-mode-indicator');
    await page.waitForSelector('houseview-card >>> .house-modes');
  };
  const close = async () => {
    const observed = await page.evaluate(() => ({
      focus: window.card.shadowRoot.activeElement?.outerHTML,
      pending: [...window.card._pending],
      request: !!window.card._houseModeRequest,
      feedback: window.card._houseModeFeedback
    }));
    await page.keyboard.press('Escape');
    try {
      await page.waitForFunction(() => !window.card.shadowRoot.querySelector('.house-modes'), {
        timeout: 3000
      });
    } catch (error) {
      console.error('FAIL Escape close', JSON.stringify(observed));
      throw error;
    }
    await pause(450);
  };
  const report = async (state) =>
    page.evaluate((state) => {
      window.modeHass = {
        ...window.modeHass,
        states: {
          ...window.modeHass.states,
          'input_select.house_mode': {
            state,
            attributes: {options: ['Home', 'Away', 'Guests', 'Evening', 'Sleeping']}
          }
        }
      };
      window.card.hass = window.modeHass;
    }, state);
  await pause(250);
  await page.evaluate(() => window.card._act('home-view'));
  await page.waitForSelector('houseview-card >>> .hv-screensaver');
  assert.equal(
    await page.evaluate(
      () =>
        !!window.card.shadowRoot.querySelector(
          '.hv-screensaver .hm-mode,.hv-screensaver .house-modes'
        )
    ),
    false
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.card.shadowRoot.querySelector('.hv-screensaver'));
  await pause(450);
  await open();
  await tap('[data-house-mode="guests"]');
  await page.waitForSelector('houseview-card >>> .hv-house-mode-confirm');
  assert.match(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('.hv-house-mode-confirm').textContent
    ),
    /Keep the hallway lit/
  );
  await tap('[data-confirm="no"]');
  assert.equal(await page.evaluate(() => window.modeCalls.length), 0);
  await tap('[data-house-mode="guests"]');
  await tap('[data-confirm="yes"]');
  await page.waitForFunction(() => window.modeCalls.length === 1);
  assert.deepEqual(await page.evaluate(() => window.modeCalls[0]), {
    d: 'input_select',
    s: 'select_option',
    data: {option: 'Guests', entity_id: 'input_select.house_mode'}
  });
  assert.match(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hm-current-name').textContent),
    /Home/
  );
  assert.match(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hm-status').textContent),
    /Waiting/
  );
  await report('Guests');
  assert.equal(
    await page.evaluate(() =>
      window.card.shadowRoot
        .querySelector('[data-house-mode="guests"]')
        .getAttribute('aria-pressed')
    ),
    'true'
  );
  await tap('.hm-end');
  await tap('[data-confirm="yes"]');
  await page.waitForFunction(() => window.modeCalls.length === 2);
  assert.equal(await page.evaluate(() => window.modeCalls[1].data.option), 'Home');
  await report('Home');
  await close();
  for (const index of [0, 1]) {
    await page.evaluate((index) => window.card._setPage(index), index);
    await pause(150);
    assert.match(
      await page.evaluate(
        () => window.card.shadowRoot.querySelector('.house-mode-indicator').textContent
      ),
      /Home/
    );
  }
  for (const index of [0, 1]) {
    await page.evaluate((index) => window.card._setPage(index), index);
    await pause(150);
    await swipe(32, 240, 140, 4);
    assert.equal(await page.evaluate(() => !!window.card._houseModes?.open), true);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => window.card._pageIndex), index);
    await swipe(360, 240, -150, 4);
    await pause(450);
    assert.equal(await page.evaluate(() => window.card._pageIndex), index);
  }
  console.log(
    'PASS real touch reviews/cancels/activates modes, returns Home, and waits for reported state; indicator follows every page'
  );
  await open();
  await tap('[data-house-mode="evening"]');
  await page.evaluate(() => {
    window.card.setConfig({...window.modeConfig, house_mode_entity: 'select.other'});
    window.card.hass = window.modeHass;
  });
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.hv-house-mode-confirm')),
    false
  );
  assert.equal(await page.evaluate(() => window.modeCalls.length), 2);
  await page.evaluate(() => {
    window.card.setConfig(window.modeConfig);
    window.card.hass = window.modeHass;
  });
  await pause(150);
  await open();
  await tap('[data-house-mode="guests"]');
  await report('Evening');
  await tap('[data-confirm="yes"]');
  assert.equal(await page.evaluate(() => window.modeCalls.length), 2);
  await report('Home');
  await page.evaluate(() => {
    window.slowMode = true;
  });
  await tap('[data-house-mode="guests"]');
  await tap('[data-confirm="yes"]');
  await page.waitForFunction(() => !!window.finishMode);
  await page.evaluate(() => window.card._setHouseMode('house-mode:evening'));
  assert.equal(await page.evaluate(() => window.modeCalls.length), 3);
  await page.evaluate(() => {
    window.slowMode = false;
    window.finishMode();
  });
  await pause(50);
  await page.evaluate(() => {
    window.failMode = true;
  });
  await tap('[data-house-mode="evening"]');
  await tap('[data-confirm="yes"]');
  await pause(100);
  assert.match(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.hm-status').textContent),
    /Synthetic mode failure/
  );
  await page.evaluate(() => {
    window.failMode = false;
  });
  await report('unavailable');
  assert.equal(
    await page.evaluate(() =>
      [...window.card.shadowRoot.querySelectorAll('.hm-mode,.hm-end')]
        .filter((button) => !['away', 'sleeping'].includes(button.dataset.houseMode))
        .every((b) => b.disabled)
    ),
    true
  );
  await page.evaluate(() => window.card._setHouseMode('house-mode:forged'));
  assert.equal(await page.evaluate(() => window.modeCalls.length), 4);
  await report('Guests');
  await close();
  console.log(
    'PASS config changes, external state changes, pending calls, failures and unavailable/forged modes cannot produce an incorrect activation'
  );
  for (const [width, height] of [
    [480, 480],
    [320, 568],
    [240, 640],
    [640, 360],
    [768, 1024],
    [1024, 768]
  ]) {
    await page.setViewport({width, height, hasTouch: true});
    await pause(180);
    const header = await page.evaluate(() => {
      const root = window.card.shadowRoot;
      const r = root.querySelector('.house-mode-indicator').getBoundingClientRect();
      const time = root.querySelector('.dashboard-time').getBoundingClientRect();
      const icon = root.querySelector('.house-mode-indicator ha-icon').getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        right: r.right,
        timeX: time.x,
        iconW: icon.width
      };
    });
    assert.ok(
      header.w >= 56 &&
        header.h >= 56 &&
        header.x >= 0 &&
        header.right <= header.timeX &&
        header.iconW <= 24,
      `FAIL header geometry at ${width}×${height}: ${JSON.stringify(header)}`
    );
    await open();
    const beforeInfo = await page.evaluate(() => window.modeCalls.length);
    assert.equal(
      await page.evaluate(() =>
        [...window.card.shadowRoot.querySelectorAll('.hm-description')].every((node) => node.hidden)
      ),
      true
    );
    await tap('.hm-info[data-entity="guests"]');
    assert.equal(
      await page.evaluate(
        () => window.card.shadowRoot.querySelector('#hm-description-guests').hidden
      ),
      false
    );
    if (width === 480 || width === 240)
      await page.screenshot({path: `/tmp/houseview-mode-info-${width}.png`});
    await tap('.hm-info[data-entity="evening"]');
    assert.deepEqual(
      await page.evaluate(() =>
        [...window.card.shadowRoot.querySelectorAll('.hm-info[aria-expanded="true"]')].map(
          (node) => node.dataset.entity
        )
      ),
      ['evening']
    );
    await page.evaluate(() =>
      window.card.shadowRoot.querySelector('.hm-info[data-entity="evening"]').focus()
    );
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => !!window.card._houseModes?.open), true);
    assert.equal(
      await page.evaluate(
        () => window.card.shadowRoot.querySelector('#hm-description-evening').hidden
      ),
      true
    );
    assert.equal(await page.evaluate(() => window.modeCalls.length), beforeInfo);
    if (width === 320) {
      await page.evaluate(() => {
        window.card.shadowRoot.querySelector('.hm-scroll').scrollTop = 0;
      });
      const beforeScroll = await page.evaluate(
        () => window.card.shadowRoot.querySelector('.hm-scroll').scrollTop
      );
      await swipe(width / 2, height - 85, 0, -160);
      await pause(450);
      const afterScroll = await page.evaluate(
        () => window.card.shadowRoot.querySelector('.hm-scroll').scrollTop
      );
      assert.ok(
        afterScroll > beforeScroll,
        `FAIL vertical mode scroll: ${JSON.stringify({beforeScroll, afterScroll})}`
      );
      assert.equal(await page.evaluate(() => !!window.card._houseModes?.open), true);
    }
    const geometry = await page.evaluate(() => {
      const root = window.card.shadowRoot;
      return [...root.querySelectorAll('.hm-mode,.hm-end,.hm-info')].map((b) => {
        b.scrollIntoView({block: 'center'});
        const r = b.getBoundingClientRect();
        const i = b.matches('.hm-info') ? b : b.querySelector('.hm-icon');
        const glyph = i?.querySelector('ha-icon');
        const ir = i?.getBoundingClientRect();
        const gr = glyph?.getBoundingClientRect();
        return {
          w: r.width,
          h: r.height,
          x: r.x,
          right: r.right,
          y: r.y,
          bottom: r.bottom,
          delta:
            ir && gr
              ? Math.max(
                  Math.abs(ir.x + ir.width / 2 - gr.x - gr.width / 2),
                  Math.abs(ir.y + ir.height / 2 - gr.y - gr.height / 2)
                )
              : 0
        };
      });
    });
    assert.ok(
      geometry.every(
        (r) =>
          r.w >= 64 &&
          r.h >= 64 &&
          r.x >= 0 &&
          r.right <= width &&
          r.y >= 0 &&
          r.bottom <= height &&
          r.delta <= 1
      ),
      `FAIL mode geometry at ${width}×${height}: ${JSON.stringify(geometry)}`
    );
    await page.evaluate(() => {
      window.card.shadowRoot.querySelector('.hm-scroll').scrollTop = 0;
    });
    if (width === 480) {
      const fit = await page.evaluate(() => {
        const node = window.card.shadowRoot.querySelector('.hm-scroll');
        return {
          height: node.clientHeight,
          scroll: node.scrollHeight,
          width: node.clientWidth,
          scrollWidth: node.scrollWidth
        };
      });
      assert.ok(
        fit.scroll <= fit.height && fit.scrollWidth <= fit.width,
        `FAIL fixed square-panel mode layout: ${JSON.stringify(fit)}`
      );
    }
    await page.evaluate(() => window.card.shadowRoot.activeElement?.blur());
    if (width === 480 || width === 1024)
      await page.screenshot({path: `/tmp/houseview-house-modes-${width}.png`});
    await tap('[data-house-mode="evening"]');
    const buttons = await page.evaluate(() =>
      [...window.card.shadowRoot.querySelectorAll('.hv-house-mode-confirm button')].map((b) => {
        const r = b.getBoundingClientRect();
        return {w: r.width, h: r.height, x: r.x, right: r.right, y: r.y, bottom: r.bottom};
      })
    );
    assert.ok(
      buttons.length === 2 &&
        buttons.every(
          (r) =>
            r.w >= 64 && r.h >= 64 && r.x >= 0 && r.right <= width && r.y >= 0 && r.bottom <= height
        ),
      `FAIL confirmation geometry at ${width}×${height}: ${JSON.stringify(buttons)}`
    );
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => window.card.shadowRoot.activeElement.dataset.confirm),
      'yes'
    );
    await page.keyboard.press('Escape');
    await close();
    const callsBefore = await page.evaluate(() => window.modeCalls.length);
    const pageBefore = await page.evaluate(() => window.card._pageIndex);
    for (const y of [14, height / 2, height - 24]) {
      await swipe(Math.min(48, width * 0.2 - 4), y, 140, 4);
      assert.equal(
        await page.evaluate(() => !!window.card.shadowRoot.querySelector('.house-modes')),
        true,
        `FAIL left edge at ${width}×${height}, y=${y}`
      );
      await swipe(width * 0.75, height / 2, -Math.min(150, width * 0.5), 4);
      assert.equal(
        await page.evaluate(() => !!window.card.shadowRoot.querySelector('.house-modes')),
        false,
        `FAIL left dismissal at ${width}×${height}, y=${y}`
      );
      assert.equal(await page.evaluate(() => window.card._pageIndex), pageBefore);
      assert.equal(await page.evaluate(() => window.modeCalls.length), callsBefore);
      await pause(450);
    }
    console.log(
      `PASS mode controls and full-height left-edge opening / swipe-away fit ${width}×${height}, without paging or click-through`
    );
  }
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await pause(150);
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
  await open();
  const legacy = await page.evaluate(() => {
    const root = window.card.shadowRoot.querySelector('.house-modes');
    const scroll = root.querySelector('.hm-scroll');
    return {
      width: root.scrollWidth,
      height: root.scrollHeight,
      scroll: scroll.scrollHeight,
      available: scroll.clientHeight,
      buttons: [...root.querySelectorAll('button:not([hidden])')].map((button) => {
        const r = button.getBoundingClientRect();
        return {w: r.width, h: r.height};
      })
    };
  });
  assert.ok(
    legacy.width <= 480 &&
      legacy.height <= 480 &&
      legacy.scroll <= legacy.available &&
      legacy.buttons.every((button) => button.w >= 64 && button.h >= 64),
    `FAIL legacy mode layout: ${JSON.stringify(legacy)}`
  );
  await close();
  console.log(
    'PASS legacy WebView mode layout keeps all square-panel choices and 64px targets reachable'
  );
  // Beginners can attach existing scripts without writing mode-trigger automations.
  await report('Home');
  await page.evaluate(() => {
    window.modeConfig = {
      ...window.modeConfig,
      house_modes: window.modeConfig.house_modes.map((mode) =>
        mode.mode === 'evening' ? {...mode, script: 'script.evening'} : mode
      )
    };
    window.modeHass = {
      ...window.modeHass,
      states: {...window.modeHass.states, 'script.evening': {state: 'off', attributes: {}}}
    };
    window.card.setConfig(window.modeConfig);
    window.card.hass = window.modeHass;
  });
  await pause(150);
  await open();
  const beforeScript = await page.evaluate(() => window.modeCalls.length);
  await tap('[data-house-mode="evening"]');
  await tap('[data-confirm="yes"]');
  await page.waitForFunction((count) => window.modeCalls.length === count + 2, {}, beforeScript);
  assert.deepEqual(await page.evaluate((count) => window.modeCalls.slice(count), beforeScript), [
    {d: 'script', s: 'evening', data: {}},
    {
      d: 'input_select',
      s: 'select_option',
      data: {option: 'Evening', entity_id: 'input_select.house_mode'}
    }
  ]);
  await page.evaluate(() => {
    window.failMode = true;
  });
  await tap('[data-house-mode="evening"]');
  await tap('[data-confirm="yes"]');
  await pause(100);
  assert.equal(await page.evaluate(() => window.modeCalls.length), beforeScript + 3);
  await page.evaluate(() => {
    window.failMode = false;
  });
  console.log(
    'PASS configured scripts run before the mode selector; a failed routine never marks the requested mode active'
  );
  await page.evaluate(() => {
    window.modeSetupCalls = [];
    const editor = document.createElement('houseview-editor');
    const config = {...window.modeConfig};
    delete config.house_mode_entity;
    editor.hass = {
      ...window.modeHass,
      user: {is_admin: true},
      callWS: async (message) => {
        window.modeSetupCalls.push(message);
        if (message.type === 'input_select/list') return [];
        if (message.type === 'input_select/create') return {id: 'synthetic_house_mode'};
        return [
          {
            platform: 'input_select',
            unique_id: 'synthetic_house_mode',
            entity_id: 'input_select.synthetic_house_mode'
          }
        ];
      }
    };
    editor.setConfig(config);
    window.modeEditor = editor;
    document.body.append(editor);
    editor.addEventListener('config-changed', (event) => {
      window.modeEditorSaved = event.detail.config;
    });
  });
  assert.equal(
    await page.evaluate(() => window.modeSetupCalls.length),
    0,
    'rendering setup never creates a helper'
  );
  await page.evaluate(() =>
    window.modeEditor.shadowRoot.querySelector('.house-mode-create').click()
  );
  await page.waitForFunction(
    () => window.modeEditorSaved?.house_mode_entity === 'input_select.synthetic_house_mode'
  );
  assert.equal(
    await page.evaluate(
      () => window.modeSetupCalls.filter((call) => call.type === 'input_select/create').length
    ),
    1
  );
  assert.equal(
    await page.evaluate(
      () => window.modeEditor.shadowRoot.querySelector('.house-mode-create').disabled
    ),
    true
  );
  await page.evaluate(() => window.modeEditor.remove());
  console.log(
    'PASS beginner editor creates/connects a five-mode helper only after an explicit click, without device service calls'
  );
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await page.evaluate(() => {
    window.card._disposeHouseModes();
    window.card._openHouseModes({preview: true});
  });
  const directPreviewCalls = await page.evaluate(() => window.modeCalls.length);
  await page.evaluate(() => window.card._setHouseMode('house-mode:evening'));
  assert.equal(await page.evaluate(() => window.modeCalls.length), directPreviewCalls);
  await page.evaluate(() => {
    window.card.setConfig({...window.modeConfig, performance: 'full'});
    window.card.hass = window.modeHass;
  });
  await pause(150);
  await page.evaluate(() => window.card.shadowRoot.querySelector('.house-mode-indicator').focus());
  await page.keyboard.down('Alt');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Alt');
  await page.waitForSelector('houseview-card >>> .house-modes');
  assert.equal(await page.evaluate(() => !!window.card._houseModes.animation), true);
  await pause(300);
  await close();
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await open();
  assert.equal(await page.evaluate(() => !!window.card._houseModes.animation), false);
  await close();
  await page.evaluate(() => {
    const dialog = document.createElement('hui-dialog-edit-card');
    const preview = document.createElement('hui-card');
    preview.preview = true;
    const editor = document.createElement('houseview-editor');
    editor.hass = window.modeHass;
    editor.setConfig(window.modeConfig);
    window.card.remove();
    preview.append(window.card);
    dialog.append(editor, preview);
    document.body.append(dialog);
    window.modePreviewDialog = dialog;
    const form = [...editor.shadowRoot.querySelectorAll('ha-form')].find((form) =>
      form.schema.some((field) => field.name === 'house_mode_entity')
    );
    const panel = form.closest('ha-expansion-panel');
    panel.expanded = true;
    panel.dispatchEvent(new CustomEvent('expanded-changed', {bubbles: true}));
  });
  await page.waitForFunction(() => window.card._houseModes?.preview === true);
  const previewCalls = await page.evaluate(() => window.modeCalls.length);
  await page.evaluate(() => window.card._setHouseMode('house-mode:evening'));
  assert.equal(await page.evaluate(() => window.modeCalls.length), previewCalls);
  assert.equal(
    await page.evaluate(() =>
      [...window.card.shadowRoot.querySelectorAll('.house-modes button')].every(
        (button) => button.disabled
      )
    ),
    true
  );
  await page.evaluate(() => {
    window.card.remove();
    window.modePreviewDialog.remove();
    document.body.append(window.card);
    window.card.hass = window.modeHass;
  });
  await pause(150);
  console.log(
    'PASS keyboard shortcut, slide animation, reduced motion and read-only mode editor preview'
  );
  await open();
  await tap('[data-house-mode="evening"]');
  await page.evaluate(() => window.card.remove());
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.hv-house-mode-confirm')),
    false
  );
  assert.deepEqual(errors, []);
  console.log('PASS confirmation keyboard focus and disconnect cleanup; no browser errors');
} finally {
  await browser.close();
  await server.close();
}
