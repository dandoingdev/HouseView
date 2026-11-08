// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService.
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'a default light has a toggle tile and a brightness key',
    !!t.q('[data-action="light"]') &&
      !!t.q('[data-action="light-view"].control-icon') &&
      !!t.q('.control-split')
  );
  check('an on light is marked active', !!t.q('.control.active'));

  await t.click('light');
  check(
    'pressing the tile toggles without opening the brightness view',
    t.calls[0]?.s === 'toggle' && !t.q('.hv-screensaver')
  );
  t = await mount(variants.ok);
  await t.click('light-view');
  check(
    'the brightness key opens the light view without toggling',
    !!t.q('.ov-light-scene') && t.calls.length === 0
  );
  t = await mount(variants.ok);
  await t.hold('[data-action="light"]');
  check(
    'holding the tile opens brightness without toggling',
    !!t.q('.ov-light-scene') && t.calls.length === 0
  );

  t = await mount({
    ...variants.ok,
    widget: {...variants.ok.widget, tap_action: {action: 'more-info'}}
  });
  await t.click('light');
  check(
    'configured tap actions still apply to the main tile',
    t.infos.includes('light.test') && t.calls.length === 0
  );
  await t.hold('[data-action="light"]');
  check(
    'holding still opens brightness with a configured tap action',
    !!t.q('.ov-light-scene') && t.calls.length === 0
  );

  t = await mount(variants.off);
  check(
    'an off light is not active and shows its state',
    !t.q('.control.active') && t.text('.control > small') === 'off'
  );

  t = await mount(variants.actionOff);
  check(
    'action off renders the light-off tile only',
    !!t.q('[data-action="light-off"]') &&
      !t.q('[data-action="light"]') &&
      !t.q('[data-action="light-view"]')
  );
  await t.click('light-off');
  check(
    'action off never toggles',
    t.calls.length === 1 &&
      t.calls[0].d === 'light' &&
      t.calls[0].s === 'turn_off' &&
      t.calls[0].data.entity_id === 'light.test'
  );
  t = await mount(variants.actionOff);
  await t.hold();
  check('action off has no brightness hold', !t.q('.ov-light-scene') && t.calls.length === 0);

  t = await mount(variants.actionToggle);
  check(
    'action toggle renders the light tile without a brightness key',
    !!t.q('[data-action="light"]') &&
      !t.q('[data-action="light-off"]') &&
      !t.q('[data-action="light-view"]')
  );

  await t.click('light');
  check('explicit toggle preserves the direct service action', t.calls[0]?.s === 'toggle');
  t = await mount(variants.actionToggle);
  await t.hold();
  check('action toggle has no brightness hold', !t.q('.ov-light-scene') && t.calls.length === 0);

  t = await mount(variants.yamlFalse);
  check(
    'YAML boolean false is normalised to off',
    t.card._config.widgets[0].action === 'off' && !!t.q('[data-action="light-off"]')
  );

  t = await mount(variants.customIcon);
  check(
    'custom icon and name are used',
    t.q('ha-icon').getAttribute('icon') === 'mdi:ceiling-light-outline' &&
      t.text('.control > span') === 'Hall'
  );

  t = await mount(variants.foreignIcon);
  check(
    'non-mdi icon prefix is passed through',
    t.q('ha-icon').getAttribute('icon') === 'hass:lightbulb'
  );

  t = await mount(variants.hostileName);
  check(
    'name is escaped, not parsed as markup',
    !t.q('.control b') && t.text('.control > span') === '<b>"Lamp" & co</b>'
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable light is disabled and labelled',
    t.q('[data-action="light"]').disabled && t.text('.control').includes('Unavailable')
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
