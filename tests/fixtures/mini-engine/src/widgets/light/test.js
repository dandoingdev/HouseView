// The worked example of docs/widget-api.md (the foreign-icon assertion of the real widget is left out here).
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

  t = await mount(variants.actionOff);
  await t.click('light-off');
  check('action off never toggles', t.calls[0].s === 'turn_off');

  t = await mount(variants.unavailable);
  check(
    'unavailable light is disabled and labelled',
    t.q('[data-action="light"]').disabled && t.text('[data-action="light"]').includes('Unavailable')
  );
}
