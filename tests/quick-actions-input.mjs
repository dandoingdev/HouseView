/* global window, document, CSSRule, PointerEvent, CustomEvent */
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
    window.qaCalls = [];
    window.qaConfig = {
      tablet_mode: true,
      performance: 'full',
      home_swipe: true,
      home_overview: true,
      bedtime: true,
      confirm_mode: 'inline',
      pages: [{name: 'Home'}, {name: 'Lights'}, {name: 'Rooms'}],
      widgets: ['a', 'b', 'c'].map((id, i) => ({
        type: 'switch',
        entity: `switch.${id}`,
        page: ['Home', 'Lights', 'Rooms'][i]
      })),
      quick_actions: [
        {
          entity: 'script.lights_off',
          name: 'All lights off',
          note: 'Every room',
          icon: 'lightbulb-group-outline'
        },
        {
          entity: 'input_boolean.guest',
          name: 'Guest mode',
          note: 'Make everyone welcome',
          icon: 'account-group-outline'
        },
        {
          entity: 'scene.relax',
          name: 'Settle in',
          note: 'Your evening scene',
          icon: 'palette-outline'
        },
        {
          entity: 'script.goodnight',
          name: 'Good night',
          note: 'The bedtime routine',
          icon: 'weather-night'
        },
        {
          entity: 'light.garden',
          name: 'Garden lights',
          action: 'turn_off',
          note: 'Turn the garden off',
          icon: 'power'
        },
        {
          entity: 'input_boolean.quiet',
          name: 'Quiet hours',
          note: 'A little less noise',
          icon: 'toggle-switch-outline'
        }
      ]
    };
    window.qaHass = {
      locale: {language: 'en-GB'},
      config: {time_zone: 'Europe/London'},
      states: {
        'switch.a': {state: 'off', attributes: {}},
        'switch.b': {state: 'off', attributes: {}},
        'switch.c': {state: 'off', attributes: {}},
        'script.lights_off': {state: 'off', attributes: {}},
        'input_boolean.guest': {state: 'on', attributes: {}},
        'scene.relax': {state: 'unknown', attributes: {}},
        'script.goodnight': {state: 'off', attributes: {}},
        'light.garden': {state: 'on', attributes: {}},
        'input_boolean.quiet': {state: 'off', attributes: {}}
      },
      callService: async (d, s, data) => {
        window.qaCalls.push({d, s, data});
        if (window.failQA) throw Error('Synthetic service failure');
        if (window.slowQA)
          await new Promise((resolve) => {
            window.finishQA = resolve;
          });
      }
    };
    window.card.setConfig(window.qaConfig);
    window.card.hass = window.qaHass;
  });
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const tap = async (selector) => {
    const point = await page.evaluate((selector) => {
      const r = window.card.shadowRoot.querySelector(selector).getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, selector);
    await page.touchscreen.tap(point.x, point.y);
  };
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
  const open = async () => {
    const {width, height} = page.viewport();
    await swipe(width * 0.5, height - 20, 4, -150);
    await page.waitForSelector('houseview-card >>> .quick-actions');
    await pause(450);
  };
  const close = async () => {
    const {width} = page.viewport();
    await swipe(width * 0.5, 100, 8, 150);
    await page.waitForFunction(() => !window.card.shadowRoot.querySelector('.quick-actions'));
    await pause(450);
  };
  const count = () => page.evaluate(() => window.qaCalls.length);
  await pause(150);
  for (let index = 0; index < 3; index++) {
    await page.evaluate((index) => window.card._setPage(index), index);
    await pause(300);
    await open();
    assert.equal(await count(), 0, 'opening never runs a shortcut');
    assert.equal(await page.evaluate(() => window.card._navigationBlocked()), true);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => window.card._pageIndex), index);
    await close();
    assert.equal(await count(), 0, 'dismissal never clicks through');
    assert.equal(await page.evaluate(() => window.card._pageIndex), index);
  }
  console.log(
    'PASS real upward swipes open from every dashboard page; downward dismissal never pages or activates an underlying button'
  );

  // Existing home pull and horizontal navigation keep their direction and ownership.
  await swipe(240, 15, 4, 150);
  await page.waitForSelector('houseview-card >>> .hv-screensaver');
  assert.equal(await page.evaluate(() => window.card._screensaver.active.entry.type), 'home');
  await page.keyboard.press('Escape');
  await pause(650);
  assert.equal(await count(), 0);
  await page.evaluate(() => window.card.shadowRoot.querySelector('.page-dot.selected').focus());
  await page.keyboard.down('Alt');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.up('Alt');
  await page.waitForSelector('houseview-card >>> .quick-actions');
  await pause(450);
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.activeElement.className),
    'ov-panel-key qa-close'
  );
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.activeElement.dataset.quickIndex),
    '5'
  );
  console.log(
    'PASS home swipe-down is preserved; Alt+Up opens quick actions and keyboard focus stays inside'
  );

  await tap('[data-quick-index="0"]');
  await page.waitForFunction(() => window.qaCalls.length === 1);
  assert.deepEqual(await page.evaluate(() => window.qaCalls[0]), {
    d: 'script',
    s: 'turn_on',
    data: {entity_id: 'script.lights_off'}
  });
  await tap('[data-quick-index="1"]');
  await page.waitForFunction(() => window.qaCalls.length === 2);
  assert.deepEqual(await page.evaluate(() => window.qaCalls[1]), {
    d: 'homeassistant',
    s: 'toggle',
    data: {entity_id: 'input_boolean.guest'}
  });
  await tap('[data-quick-index="4"]');
  await page.waitForFunction(() => window.qaCalls.length === 3);
  assert.deepEqual(await page.evaluate(() => window.qaCalls[2]), {
    d: 'homeassistant',
    s: 'turn_off',
    data: {entity_id: 'light.garden'}
  });
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.quick-actions')),
    true
  );
  await page.evaluate(() => {
    window.qaButton = window.card.shadowRoot.querySelector('[data-quick-index="1"]');
    window.qaButton.focus();
    window.qaHass.states['input_boolean.guest'] = {state: 'off', attributes: {}};
    window.card.hass = {...window.qaHass};
  });
  assert.equal(
    await page.evaluate(
      () =>
        window.qaButton === window.card.shadowRoot.querySelector('[data-quick-index="1"]') &&
        window.card.shadowRoot.activeElement === window.qaButton &&
        !window.qaButton.classList.contains('is-active')
    ),
    true
  );
  console.log(
    'PASS configured scripts, helper toggles and explicit lights-off target exactly the selected entity; live updates preserve focus and button identity'
  );

  await page.evaluate(() => {
    window.slowQA = true;
  });
  await tap('[data-quick-index="0"]');
  await page.waitForFunction(() => !!window.finishQA);
  await tap('[data-quick-index="0"]');
  assert.equal(await count(), 4);
  await page.evaluate(() => {
    window.slowQA = false;
    window.finishQA();
  });
  await page.waitForFunction(
    () => !window.card.shadowRoot.querySelector('[data-quick-index="0"]').disabled
  );
  await page.evaluate(() => {
    window.failQA = true;
  });
  await tap('[data-quick-index="0"]');
  await page.waitForFunction(() =>
    window.card.shadowRoot
      .querySelector('.qa-status')
      .textContent.includes('Synthetic service failure')
  );
  await page.evaluate(() => {
    window.failQA = false;
    window.qaHass.states['light.garden'] = {state: 'unavailable', attributes: {}};
    window.card.hass = {...window.qaHass};
  });
  assert.equal(
    await page.evaluate(
      () => window.card.shadowRoot.querySelector('[data-quick-index="4"]').disabled
    ),
    true
  );
  await page.evaluate(() => window.card._runQuickAction(999));
  assert.equal(await count(), 5);
  console.log(
    'PASS pending actions reject duplicate taps; failures are visible in the sheet and unavailable/forged shortcuts cannot run'
  );

  await page.keyboard.press('Escape');
  await pause(650);
  await page.evaluate(() => {
    window.qaHass.states['light.garden'] = {state: 'on', attributes: {}};
    window.qaConfig.quick_actions[0].confirm = true;
    window.card.setConfig(window.qaConfig);
    window.card.hass = {...window.qaHass};
  });
  await open();
  await tap('[data-quick-index="0"]');
  await page.waitForSelector('houseview-card >>> .hv-confirm');
  await tap('[data-confirm="no"]');
  assert.equal(await count(), 5);
  await tap('[data-quick-index="0"]');
  await page.waitForSelector('houseview-card >>> .hv-confirm');
  await tap('[data-confirm="yes"]');
  await page.waitForFunction(() => window.qaCalls.length === 6);
  await tap('[data-quick-index="0"]');
  await page.waitForSelector('houseview-card >>> .hv-confirm');
  await page.evaluate(() => {
    window.card.setConfig({...window.qaConfig, quick_actions_title: 'Changed'});
    window.card.hass = {...window.qaHass};
  });
  await pause(100);
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.hv-confirm,.quick-actions')),
    false
  );
  assert.equal(await count(), 6);
  console.log(
    'PASS confirmation cancel/accept work above the sheet; configuration changes cancel outstanding confirmations without running actions'
  );

  await page.evaluate(() => {
    window.qaConfig.quick_actions[0].confirm = false;
    window.card.setConfig(window.qaConfig);
    window.card.hass = {...window.qaHass};
  });
  const probe = () =>
    page.evaluate(() => {
      const root = window.card.shadowRoot.querySelector('.quick-actions');
      const rect = (node) => {
        const r = node.getBoundingClientRect();
        return {x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom};
      };
      return {
        root: rect(root),
        scrollW: root.scrollWidth,
        scrollH: root.scrollHeight,
        footer: rect(root.querySelector('.qa-footer')),
        buttons: [...root.querySelectorAll('button')].map((button) => ({
          rect: rect(button),
          icon: rect(button.querySelector('ha-icon')),
          iconBox: rect(
            button.classList.contains('qa-close') ? button : button.querySelector('.qa-icon')
          ),
          label: button.getAttribute('aria-label')
        }))
      };
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
    await pause(180);
    const toolbar = await page.evaluate(() => {
      const root = window.card.shadowRoot;
      const nav = root.querySelector('.page-nav').getBoundingClientRect();
      return {
        top: nav.top,
        page: window.card._pageIndex,
        buttons: [
          ...root.querySelectorAll(
            '.page-nav button,.dashboard-controls button,.home-button,.dim-screen'
          )
        ]
          .filter((button) => !button.disabled)
          .map((button) => {
            const r = button.getBoundingClientRect();
            return {x: r.x + r.width / 2, y: r.y + r.height / 2};
          })
          .filter(({x, y}) => x > 0 && y >= nav.top)
      };
    });
    const callsBeforeToolbar = await count();
    for (const point of [
      ...[8, width / 4, width / 2, (width * 3) / 4, width - 8].map((x) => ({
        x,
        y: toolbar.top + 4
      })),
      ...toolbar.buttons
    ]) {
      await swipe(point.x, point.y, 0, -150);
      assert.equal(
        await page.evaluate(() => !!window.card.shadowRoot.querySelector('.quick-actions')),
        true,
        `FAIL footer pull at ${width}×${height}: ${JSON.stringify({toolbar, point})}`
      );
      await pause(450);
      await close();
      assert.equal(await page.evaluate(() => window.card._pageIndex), toolbar.page);
      assert.equal(await count(), callsBeforeToolbar);
      assert.equal(
        await page.evaluate(
          () => !!window.card.shadowRoot.querySelector('.hv-screensaver,.screen-dim,.page-menu')
        ),
        false,
        `FAIL toolbar swipe activated a control at ${width}×${height}: ${JSON.stringify(point)}`
      );
    }
    console.log(
      `PASS full-width toolbar pulls at ${width}×${height}, including buttons and gaps, without click-through`
    );
    await open();
    const value = await probe();
    assert.ok(
      value.scrollW <= width &&
        value.scrollH <= height &&
        value.footer.bottom <= height &&
        value.buttons.length === 7 &&
        value.buttons.every(
          ({rect: r, icon: i, iconBox: b, label}, index) =>
            r.w >= 64 &&
            r.h >= 64 &&
            r.x >= 0 &&
            r.y >= 0 &&
            r.right <= width &&
            r.bottom <= height &&
            label &&
            Math.abs(i.x + i.w / 2 - b.x - b.w / 2) <= 1 &&
            Math.abs(i.y + i.h / 2 - b.y - b.h / 2) <= 1 &&
            (index !== 0 || r.w === r.h) &&
            value.buttons
              .slice(index + 1)
              .every(
                ({rect: o}) =>
                  r.right <= o.x + 0.5 ||
                  o.right <= r.x + 0.5 ||
                  r.bottom <= o.y + 0.5 ||
                  o.bottom <= r.y + 0.5
              )
        ),
      `FAIL quick actions geometry at ${width}×${height}: ${JSON.stringify(value)}`
    );
    if (width === 480 || width === 768) {
      await page.evaluate(() => window.card.shadowRoot.activeElement?.blur());
      await page.screenshot({path: `/tmp/houseview-quick-actions-${width}.png`});
    }
    await close();
    console.log(
      `PASS fixed quick actions fit ${width}×${height}; 64px targets, centred icons, no clipping or overlap`
    );
  }
  await page.setViewport({width: 480, height: 480, hasTouch: true});
  await pause(180);
  await tap('.dim-screen');
  assert.equal(await page.evaluate(() => window.card._dim), true);
  await tap('.dim-screen');
  assert.equal(await page.evaluate(() => window.card._dim), false);
  await tap('.home-button');
  await page.waitForSelector('houseview-card >>> .hv-screensaver');
  await page.keyboard.press('Escape');
  await pause(650);
  await page.evaluate(() => window.card._setPage(0));
  await pause(300);
  await tap('[data-action="page-next"]');
  assert.equal(await page.evaluate(() => window.card._pageIndex), 1);
  await pause(300);
  console.log('PASS ordinary footer taps still dim, open Home and navigate pages');
  await open();
  const before = await count();
  await swipe(150, 160, 120, 0);
  await pause(450);
  assert.equal(await count(), before, 'a horizontal drag on an action is not a press');
  await page.evaluate(() => {
    const root = window.card.shadowRoot.querySelector('.quick-actions');
    for (const type of ['pointerdown', 'pointermove', 'pointercancel', 'pointerup'])
      root.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 91,
          pointerType: 'touch',
          isPrimary: true,
          clientX: 200,
          clientY: type === 'pointerup' ? 300 : 100
        })
      );
  });
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.quick-actions')),
    true
  );
  await page.keyboard.press('Escape');
  await pause(650);
  await page.evaluate(() => {
    window.card.setConfig({...window.qaConfig, quick_actions_swipe: false});
    window.card.hass = {...window.qaHass};
  });
  await swipe(240, 460, 0, -160);
  await pause(100);
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.quick-actions')),
    false
  );
  await page.evaluate(() => window.card.shadowRoot.querySelector('.page-dot.selected').focus());
  await page.keyboard.down('Alt');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.up('Alt');
  await page.waitForSelector('houseview-card >>> .quick-actions');
  await pause(450);
  await close();
  await page.evaluate(() => {
    window.card.setConfig(window.qaConfig);
    window.card.hass = {...window.qaHass};
  });
  await open();
  await page.evaluate(() => {
    window.card.remove();
    document.body.append(window.card);
    window.card.hass = {...window.qaHass};
  });
  assert.equal(
    await page.evaluate(() => !!window.card.shadowRoot.querySelector('.quick-actions')),
    false
  );
  console.log(
    'PASS cancelled and horizontal gestures cannot execute actions; swipe opt-out and disconnect cleanup work'
  );

  for (const slots of [1, 2]) {
    await page.evaluate((slots) => {
      window.card.setConfig({
        ...window.qaConfig,
        quick_actions: window.qaConfig.quick_actions.slice(0, slots)
      });
      window.card.hass = {...window.qaHass};
    }, slots);
    await open();
    const layout = await probe();
    assert.ok(
      layout.buttons.length === slots + 1 &&
        layout.scrollH <= 480 &&
        layout.buttons.every((b) => b.rect.w >= 64 && b.rect.h >= 64),
      `FAIL ${slots}-action layout: ${JSON.stringify(layout)}`
    );
    await close();
  }
  await page.evaluate(() => {
    window.card.setConfig(window.qaConfig);
    window.card.hass = {...window.qaHass};
  });
  console.log(
    'PASS one or two configured actions fill the fixed screen without empty rows or pagination'
  );

  // Simulate older supported WebViews with container queries and cq units removed.
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
  const legacy = await probe();
  assert.ok(
    legacy.scrollW <= 480 &&
      legacy.scrollH <= 480 &&
      legacy.buttons.every((b) => b.rect.w >= 64 && b.rect.h >= 64),
    `FAIL legacy geometry: ${JSON.stringify(legacy)}`
  );
  await close();
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await open();
  assert.equal(await page.evaluate(() => !!window.card._quickActions.animation), false);
  await close();
  const callsBeforeEditor = await count();
  await page.evaluate(() => {
    window.card.remove();
    const dialog = document.createElement('hui-dialog-edit-card');
    const preview = document.createElement('hui-card');
    preview.preview = true;
    const editor = document.createElement('houseview-editor');
    editor.hass = window.qaHass;
    editor.setConfig(window.qaConfig);
    preview.append(window.card);
    dialog.append(editor, preview);
    document.body.append(dialog);
    window.qaEditor = editor;
    const form = [...editor.shadowRoot.querySelectorAll('ha-form')].find((form) =>
      form.schema.some((item) => item.name === 'quick_actions')
    );
    window.qaEditorForm = form;
    const panel = form.closest('ha-expansion-panel');
    panel.expanded = true;
    panel.dispatchEvent(new CustomEvent('expanded-changed', {bubbles: true}));
  });
  await page.waitForFunction(() => window.card._quickActions?.preview === true);
  assert.equal(
    await page.evaluate(
      () =>
        [...window.card.shadowRoot.querySelectorAll('.qa-action')].every(
          (button) => button.disabled
        ) &&
        window.card.shadowRoot.querySelector('.quick-actions').getAttribute('role') === 'region' &&
        !window.card.shadowRoot.querySelector('.quick-actions').hasAttribute('aria-modal')
    ),
    true
  );
  await page.evaluate(() => window.card._runQuickAction(0));
  assert.equal(await count(), callsBeforeEditor);
  const editorSaved = await page.evaluate(() => {
    let saved;
    window.qaEditor.addEventListener('config-changed', (event) => {
      saved = event.detail.config;
    });
    const value = {
      ...window.qaEditorForm.data,
      quick_actions_title: 'House shortcuts',
      quick_actions: [...window.qaConfig.quick_actions].reverse()
    };
    window.qaEditorForm.dispatchEvent(
      new CustomEvent('value-changed', {bubbles: true, detail: {value}})
    );
    window.card.setConfig(saved);
    window.card.hass = {...window.qaHass};
    return {
      title: saved.quick_actions_title,
      first: saved.quick_actions[0].entity,
      allCards: saved.cards.length
    };
  });
  assert.equal(editorSaved.title, 'House shortcuts');
  assert.equal(editorSaved.first, 'input_boolean.quiet');
  assert.equal(editorSaved.allCards, 3);
  await page.waitForFunction(() => window.card._quickActions?.preview === true);
  assert.equal(
    await page.evaluate(() => window.card.shadowRoot.querySelector('.qa-heading h2').textContent),
    'House shortcuts'
  );
  assert.equal(await count(), callsBeforeEditor);
  console.log(
    'PASS native editor sets and orders shortcuts and updates a read-only live preview without executing services'
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS legacy WebView and reduced-motion mode remain fully operable; no browser errors'
  );
} finally {
  await browser.close();
  await server.close();
}
