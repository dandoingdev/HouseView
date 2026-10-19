// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService, `infos` every
// more-info request.
export default async function ({mount, check, variants, wait}) {
  let t = await mount(variants.ok);
  check(
    'weather shows temperature, unit, name and condition',
    t.text('.widget-value') === '21.5°C' &&
      t.text('.widget-value sup') === '°C' &&
      t.text('[data-action="weather-view"] small') === 'sunny'
  );
  check('weather uses the sunny icon', t.q('ha-icon').getAttribute('icon') === 'mdi:weather-sunny');
  await t.click('weather-view');
  check(
    'a tap shows the full-screen weather view, calls no service and opens no dialog',
    t.calls.length === 0 && t.infos.length === 0
  );

  t = await mount(variants.clear);
  check('clear is the night icon', t.q('ha-icon').getAttribute('icon') === 'mdi:weather-night');

  t = await mount(variants.lightningRainy);
  check(
    'hyphenated condition is spaced and uses the fallback icon',
    t.text('[data-action="weather-view"] small') === 'lightning rainy' &&
      t.q('ha-icon').getAttribute('icon') === 'mdi:weather-partly-cloudy'
  );

  t = await mount(variants.fahrenheit);
  check('entity unit is shown unchanged', t.text('.widget-value sup') === '°F');

  t = await mount(variants.noUnit);
  check('missing unit falls back to the system unit', t.text('.widget-value sup') !== '');

  t = await mount(variants.noTemperature);
  check('missing temperature shows a dash', t.text('.widget-value').startsWith('—'));

  t = await mount(variants.stringTemperature);
  check('a string temperature is not trusted', t.text('.widget-value').startsWith('—'));

  t = await mount(variants.hostileName);
  check(
    'name is escaped, not parsed as markup',
    !t.q('[data-action="weather-view"] b') &&
      t.text('[data-action="weather-view"] > span:not(.widget-value)') === '<b>"Sky" & co</b>'
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable weather is disabled and labelled',
    t.q('[data-action="weather-view"]').disabled &&
      t.text('[data-action="weather-view"] small') === 'Unavailable' &&
      t.text('.widget-value').startsWith('—')
  );

  t = await mount(variants.missing);
  check('missing entity renders disabled', t.q('[data-action="weather-view"]').disabled);
  check('weather never calls a service', t.calls.length === 0);

  // A real press opens on pointerup. The click that follows lands on the new layer and must not close it.
  t = await mount(variants.ok);
  const button = t.q('[data-action="weather-view"]');
  const point = {bubbles: true, button: 0, pointerId: 1, isPrimary: true, clientX: 24, clientY: 24};
  button.dispatchEvent(new PointerEvent('pointerdown', point));
  button.dispatchEvent(new PointerEvent('pointerup', point));
  await t.settle();
  const layer = () => t.root.querySelector('.hv-screensaver');
  check(
    'a press opens the weather view with a close button',
    layer()?.dataset.state === 'on' &&
      !!layer().querySelector('.ov-weather-scene') &&
      layer().querySelector('[data-action="overview-close"]')?.getAttribute('aria-label') ===
        'Close' &&
      !layer().querySelector('.ov-dismiss')
  );
  layer().dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}));
  await t.settle();
  check(
    'the click that follows the press leaves the weather view open',
    layer()?.dataset.state === 'on'
  );
  const scene = layer().querySelector('.ov-weather-scene');
  scene.dispatchEvent(
    new PointerEvent('pointerdown', {bubbles: true, button: 0, pointerId: 3, isPrimary: true})
  );
  scene.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}));
  await t.settle();
  check(
    'a later tap on the scene leaves it open and calls nothing',
    layer()?.dataset.state === 'on' && t.calls.length === 0
  );
  const close = layer().querySelector('[data-action="overview-close"]');
  close.dispatchEvent(
    new PointerEvent('pointerdown', {bubbles: true, button: 0, pointerId: 4, isPrimary: true})
  );
  close.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}));
  await t.settle();
  await wait(400);
  check(
    'the close button dismisses the weather view and calls no service',
    !t.root.querySelector('.hv-screensaver') && t.calls.length === 0
  );
}
