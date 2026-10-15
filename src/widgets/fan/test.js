// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService.
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  await t.click('toggle');
  check(
    'fan tap toggles only its own entity via homeassistant.toggle',
    t.calls.length === 1 &&
      t.calls[0].d === 'homeassistant' &&
      t.calls[0].s === 'toggle' &&
      t.calls[0].data.entity_id === 'fan.test'
  );
  check('an on fan is marked active', !!t.q('[data-action="toggle"].control.active'));
  check('default icon is mdi:fan', t.q('ha-icon').getAttribute('icon') === 'mdi:fan');

  t = await mount(variants.off);
  check(
    'an off fan is not active and shows its state',
    !t.q('[data-action="toggle"].active') && t.text('[data-action="toggle"] small') === 'off'
  );

  t = await mount(variants.customIcon);
  check(
    'custom icon and name are used',
    t.q('ha-icon').getAttribute('icon') === 'mdi:ceiling-fan' &&
      t.text('[data-action="toggle"] span') === 'Bedroom'
  );

  t = await mount(variants.hostileName);
  check(
    'name is escaped, not parsed as markup',
    !t.q('[data-action="toggle"] b') &&
      t.text('[data-action="toggle"] span') === '<b>"Fan" & co</b>'
  );

  t = await mount(variants.underscoreState);
  check(
    'underscores in the state are shown as spaces',
    t.text('[data-action="toggle"] small') === 'on high'
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable fan is disabled and labelled',
    t.q('[data-action="toggle"]').disabled &&
      t.text('[data-action="toggle"]').includes('Unavailable')
  );
  await t.act('toggle', 'fan.test');
  check('unavailable fan issues no service call', t.calls.length === 0);

  t = await mount(variants.unknown);
  check('unknown fan is disabled', t.q('[data-action="toggle"]').disabled);

  t = await mount(variants.missing);
  await t.act('toggle', 'fan.test');
  check(
    'missing entity renders disabled and issues no service call',
    t.q('[data-action="toggle"]').disabled && t.calls.length === 0
  );
}
