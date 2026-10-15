// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService, `infos` every
// more-info request.
export default async function ({mount, check, variants}) {
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
}
