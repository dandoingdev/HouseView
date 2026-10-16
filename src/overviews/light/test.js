export default async function ({mount, check, variants, wait}) {
  const entity = 'light.test';
  let t = await mount(variants.ok);
  const root = () => t.layer || t.root;
  const q = (s) => root().querySelector(s);
  const pointer = (type, percent, pointerType = 'touch', id = 1) => {
    const input = q('.ov-light-input');
    const rect = input.getBoundingClientRect();
    input.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: id,
        pointerType,
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.bottom - (rect.height * percent) / 100
      })
    );
  };
  // Synthetic pointer ids do not belong to a browser pointer; stub capture only for these unit interactions.
  const capture = () => {
    const input = q('.ov-light-input');
    const control = input.closest('.ov-light-control');
    control.setPointerCapture = () => {};
    control.hasPointerCapture = () => false;
  };
  check(
    'name and initial brightness match the entity',
    t.text('.ov-light-title') === 'Living room' && t.text('.ov-light-value') === '32'
  );
  check(
    'native slider exposes a labelled vertical brightness control',
    q('input').getAttribute('aria-orientation') === 'vertical' &&
      q('input').getAttribute('aria-label') === 'Brightness'
  );
  capture();
  pointer('pointerdown', 32);
  pointer('pointermove', 80);
  check(
    'upward touch drag paints percentage and fill immediately with no network writes',
    q('.ov-light-value').textContent === '80' &&
      q('.ov-light-control').style.getPropertyValue('--brightness') === '80%' &&
      t.calls.length === 0
  );
  pointer('pointermove', 20);
  check(
    'downward drag lowers the fill continuously',
    q('.ov-light-value').textContent === '20' && q('input').value === '20'
  );
  pointer('pointerup', 20);
  await t.settle();
  check(
    'release commits just the final brightness through the light service',
    t.calls.length === 1 &&
      t.calls[0].d === 'light' &&
      t.calls[0].s === 'turn_on' &&
      t.calls[0].data.brightness_pct === 20 &&
      t.calls[0].data.entity_id === entity
  );
  check('local feedback survives pending-state renders', q('.ov-light-value').textContent === '20');

  // Real devices may start without RGB and then report white RGB after the first brightness command.
  for (const value of [60, 40]) {
    pointer('pointerdown', value);
    pointer('pointerup', value);
    await t.settle();
    const previous = t.hass.states[entity];
    t.mock.replaceState(entity, {
      ...previous,
      attributes: {
        ...previous.attributes,
        brightness: Math.round((value * 255) / 100),
        color_mode: 'color_temp',
        rgb_color: [255, 255, 255]
      }
    });
    t.el.hass = t.hass;
    await t.settle();
    const fill = q('.ov-light-fill');
    const control = q('.ov-light-control');
    check(
      `white-light update after dimming to ${value}% keeps a visible yellow fill`,
      getComputedStyle(fill).backgroundColor === 'rgb(242, 194, 0)' &&
        q('.ov-light-value').textContent === String(value) &&
        Math.abs(
          (fill.getBoundingClientRect().height / control.getBoundingClientRect().height) * 100 -
            value
        ) < 1
    );
  }

  t = await mount(variants.off);
  capture();
  pointer('pointerdown', 50, 'mouse');
  pointer('pointerup', 50, 'mouse');
  await t.settle();
  check(
    'off lights can be dragged on',
    t.calls[0]?.s === 'turn_on' && t.calls[0]?.data.brightness_pct === 50
  );

  t = await mount(variants.ok);
  capture();
  pointer('pointerdown', 80);
  pointer('pointercancel', 80);
  check(
    'cancel restores the starting brightness without a call',
    q('.ov-light-value').textContent === '32' && t.calls.length === 0
  );
  pointer('pointerdown', 50);
  pointer('pointermove', -10);
  pointer('pointerup', -10);
  await t.settle();
  check(
    'dragging below the control clamps to zero and turns off',
    q('.ov-light-value').textContent === '0' && t.calls[0]?.s === 'turn_off'
  );

  t = await mount(variants.ok);
  const input = q('input');
  input.value = '75';
  input.dispatchEvent(new Event('input', {bubbles: true}));
  input.dispatchEvent(new Event('change', {bubbles: true}));
  await t.settle();
  check(
    'native accessible input updates UI and commits',
    q('.ov-light-value').textContent === '75' && t.calls[0]?.data.brightness_pct === 75
  );

  t = await mount(variants.color);
  check(
    'entity colour is used',
    getComputedStyle(q('.ov-light-fill')).backgroundColor === 'rgb(255, 140, 60)'
  );
  t = await mount(variants.ok);
  check(
    'fallback matches the existing lights yellow on pale grey-blue',
    getComputedStyle(q('.ov-light-fill')).backgroundColor === 'rgb(242, 194, 0)' &&
      getComputedStyle(q('.ov-light-control')).backgroundColor === 'rgb(220, 229, 232)'
  );
  for (const variant of ['unavailable', 'unknown', 'missing', 'onoff']) {
    t = await mount(variants[variant]);
    check(`${variant} cannot dim`, q('input').disabled);
    await t.card._act('light-brightness-50', entity);
    check(`${variant} sends no brightness service`, t.calls.length === 0);
  }

  t = await mount(variants.ok, {
    mode: 'carousel',
    bare: true,
    cards: [{type: 'custom:houseview-light-card', entity, name: 'Desk', icon: 'desk-lamp'}]
  });
  await t.card._act('light-view', entity);
  await t.settle(50);
  check(
    'pressing a light opens the existing control-panel layer with its configured name and icon',
    !!t.layer?.classList.contains('hv-controls') &&
      q('.ov-light-title').textContent === 'Desk' &&
      q('.ov-light-readout ha-icon').getAttribute('icon') === 'mdi:desk-lamp' &&
      t.calls.length === 0
  );
  capture();
  pointer('pointerdown', 32);
  pointer('pointermove', 90);
  pointer('pointerup', 90);
  await t.settle();
  check(
    'touch dimming works inside the full-screen layer and leaves it open',
    t.calls[0]?.data.brightness_pct === 90 && t.layerState === 'on'
  );
  await t.click('overview-close', entity);
  await wait(400);
  check('the existing close action dismisses the light view', !t.layer);
}
