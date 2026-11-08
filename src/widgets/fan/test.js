// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService.
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'fan tile has a details key',
    !!t.q('[data-action="info"].control-icon') && !!t.q('.control-split')
  );
  await t.click('toggle');
  check(
    'fan tap toggles only its own entity via homeassistant.toggle',
    t.calls.length === 1 &&
      t.calls[0].d === 'homeassistant' &&
      t.calls[0].s === 'toggle' &&
      t.calls[0].data.entity_id === 'fan.test'
  );
  check('an on fan is marked active', !!t.q('.control.active'));
  check('default icon is mdi:fan', t.q('ha-icon').getAttribute('icon') === 'mdi:fan');
  await t.click('info');
  check(
    'the details key opens more-info without toggling',
    t.infos.includes('fan.test') && t.calls.length === 0
  );

  t = await mount(variants.off);
  check(
    'an off fan is not active and shows its state',
    !t.q('.control.active') && t.text('.control > small') === 'off'
  );

  t = await mount(variants.customIcon);
  check(
    'custom icon and name are used',
    t.q('ha-icon').getAttribute('icon') === 'mdi:ceiling-fan' &&
      t.text('.control > span') === 'Bedroom'
  );

  t = await mount(variants.hostileName);
  check(
    'name is escaped, not parsed as markup',
    !t.q('.control b') && t.text('.control > span') === '<b>"Fan" & co</b>'
  );

  t = await mount(variants.underscoreState);
  check(
    'underscores in the state are shown as spaces',
    t.text('.control > small') === 'on high'
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable fan is disabled and labelled',
    t.q('[data-action="toggle"]').disabled && t.text('.control').includes('Unavailable')
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
