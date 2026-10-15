// Browser behaviour test (docs/widget-api.md). Runs against dist/houseview.js with a recording mock hass.
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'sensor shows value, unit and name',
    t.text('.widget-value') === '21.5°C' &&
      t.text('.widget-value sup') === '°C' &&
      t.qa('.tile > span')[1].textContent === 'Living room'
  );
  check(
    'sensor tile is the info button with the default gauge icon',
    t.q('.tile').dataset.action === 'info' &&
      t.q('.tile').dataset.entity === 'sensor.test' &&
      t.q('ha-icon').getAttribute('icon') === 'mdi:gauge'
  );
  await t.click('info');
  check(
    'tap opens more-info and calls no service',
    t.infos.includes('sensor.test') && t.calls.length === 0
  );

  t = await mount(variants.noUnit);
  check('no unit leaves an empty sup', t.text('.widget-value sup') === '');

  t = await mount(variants.textState);
  check('state text is shown raw', t.text('.widget-value') === 'not_home');

  t = await mount(variants.zero);
  check('zero is a value, not a dash', t.text('.widget-value') === '0W');

  t = await mount(variants.customIcon);
  check(
    'icon option replaces the gauge and name replaces the friendly name',
    t.q('ha-icon').getAttribute('icon') === 'mdi:water-percent' &&
      t.qa('.tile > span')[1].textContent === 'Humidity'
  );
  t = await mount(variants.bareIcon);
  check(
    'bare icon name is an mdi icon',
    t.q('ha-icon').getAttribute('icon') === 'mdi:water-percent'
  );

  t = await mount(variants.hostile);
  check(
    'state, unit and name are escaped',
    !t.q('.widget-value i') && !t.q('img') && t.text('.widget-value').startsWith('<i>1</i>')
  );

  for (const key of ['unavailable', 'unknown', 'missing']) {
    t = await mount(variants[key]);
    check(
      `${key} sensor shows a dash and is disabled`,
      t.text('.widget-value').startsWith('—') && t.q('.tile').disabled
    );
  }
  t = await mount(variants.unavailable);
  check('unavailable sensor keeps its unit', t.text('.widget-value sup') === '°C');
  await t.click('info');
  check('disabled sensor does not open more-info', t.infos.length === 0 && t.calls.length === 0);
}
