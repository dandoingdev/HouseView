// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService.
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  await t.click('light');
  check(
    'light tap toggles only its own entity',
    t.calls.length === 1 &&
      t.calls[0].d === 'light' &&
      t.calls[0].s === 'toggle' &&
      t.calls[0].data.entity_id === 'light.test'
  );
  check('an on light is marked active', !!t.q('[data-action="light"].control.active'));

  t = await mount(variants.off);
  check(
    'an off light is not active and shows its state',
    !t.q('[data-action="light"].active') && t.text('[data-action="light"] small') === 'off'
  );

  t = await mount(variants.actionOff);
  check(
    'action off renders the light-off tile only',
    !!t.q('[data-action="light-off"]') && !t.q('[data-action="light"]')
  );
  await t.click('light-off');
  check(
    'action off never toggles',
    t.calls.length === 1 &&
      t.calls[0].d === 'light' &&
      t.calls[0].s === 'turn_off' &&
      t.calls[0].data.entity_id === 'light.test'
  );

  t = await mount(variants.actionToggle);
  check(
    'action toggle renders the light tile',
    !!t.q('[data-action="light"]') && !t.q('[data-action="light-off"]')
  );

  t = await mount(variants.yamlFalse);
  check(
    'YAML boolean false is normalised to off',
    t.card._config.widgets[0].action === 'off' && !!t.q('[data-action="light-off"]')
  );

  t = await mount(variants.customIcon);
  check(
    'custom icon and name are used',
    t.q('ha-icon').getAttribute('icon') === 'mdi:ceiling-light-outline' &&
      t.text('[data-action="light"] span') === 'Hall'
  );

  t = await mount(variants.foreignIcon);
  check(
    'non-mdi icon prefix is passed through',
    t.q('ha-icon').getAttribute('icon') === 'hass:lightbulb'
  );

  t = await mount(variants.hostileName);
  check(
    'name is escaped, not parsed as markup',
    !t.q('[data-action="light"] b') && t.text('[data-action="light"] span') === '<b>"Lamp" & co</b>'
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable light is disabled and labelled',
    t.q('[data-action="light"]').disabled && t.text('[data-action="light"]').includes('Unavailable')
  );
  await t.act('light', 'light.test');
  check('unavailable light issues no service call', t.calls.length === 0);

  t = await mount(variants.unknown);
  check('unknown light is disabled', t.q('[data-action="light"]').disabled);

  t = await mount(variants.missing);
  await t.act('light', 'light.test');
  check(
    'missing entity renders disabled and issues no service call',
    t.q('[data-action="light"]').disabled && t.calls.length === 0
  );
}
