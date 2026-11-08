// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService.
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'switch tile has a details key',
    !!t.q('[data-action="info"].control-icon') && !!t.q('.control-split')
  );
  await t.click('toggle');
  check(
    'switch tap calls homeassistant.toggle for its own entity only',
    t.calls.length === 1 &&
      t.calls[0].d === 'homeassistant' &&
      t.calls[0].s === 'toggle' &&
      t.calls[0].data.entity_id === 'switch.test' &&
      Object.keys(t.calls[0].data).length === 1
  );
  check('an on switch is marked active', !!t.q('.control.active'));
  check(
    'default icon is power',
    t.q('ha-icon').getAttribute('icon') === 'mdi:power' && t.text('.control > small') === 'on'
  );
  await t.click('info');
  check(
    'the details key opens more-info without toggling',
    t.infos.includes('switch.test') && t.calls.length === 0
  );
  t = await mount(variants.ok);
  await t.hold('[data-action="toggle"]');
  check(
    'holding the tile opens more-info without toggling',
    t.infos.includes('switch.test') && t.calls.length === 0
  );

  t = await mount(variants.off);
  check(
    'an off switch is not active and shows its state',
    !t.q('.control.active') && t.text('.control > small') === 'off'
  );

  t = await mount(variants.customIcon);
  check(
    'custom icon and name are used',
    t.q('ha-icon').getAttribute('icon') === 'mdi:coffee-maker' &&
      t.text('.control > span') === 'Coffee'
  );

  t = await mount(variants.bareIcon);
  check('a bare icon name is an mdi icon', t.q('ha-icon').getAttribute('icon') === 'mdi:toaster');

  t = await mount(variants.hostileName);
  check(
    'name is escaped, not parsed as markup',
    !t.q('.control b') && t.text('.control > span') === '<b>"Plug" & co</b>'
  );

  t = await mount(variants.underscoreState);
  check(
    'underscores in the state text become spaces',
    t.text('.control > small') === 'some odd state'
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable switch is disabled and labelled',
    t.q('[data-action="toggle"]').disabled && t.text('.control').includes('Unavailable')
  );
  await t.act('toggle', 'switch.test');
  check('unavailable switch issues no service call', t.calls.length === 0);

  t = await mount(variants.unknown);
  check('unknown switch is disabled', t.q('[data-action="toggle"]').disabled);
  await t.act('toggle', 'switch.test');
  check('unknown switch issues no service call', t.calls.length === 0);

  t = await mount(variants.missing);
  await t.act('toggle', 'switch.test');
  check(
    'missing entity renders disabled and issues no service call',
    t.q('[data-action="toggle"]').disabled && t.calls.length === 0
  );
}
