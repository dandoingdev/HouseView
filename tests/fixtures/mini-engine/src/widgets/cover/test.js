// The worked example of docs/widget-api.md
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'cover shows position and three keys',
    t.text('.blinds-heading small') === '40% open' && t.qa('.blind-key').length === 3
  );

  t = await mount(variants.openOnly);
  await t.act('cover-close', 'cover.test');
  check(
    'unsupported key is disabled and never calls a service',
    t.q('[data-action="cover-close"]').disabled && t.calls.length === 0
  );

  t = await mount(variants.unknown);
  await t.click('cover-open');
  check(
    'unknown state still allows open',
    t.calls.length === 1 &&
      t.calls[0].d === 'cover' &&
      t.calls[0].s === 'open_cover' &&
      t.calls[0].data.entity_id === 'cover.test'
  );
  check(
    'unknown state shows position unknown',
    t.text('.blinds-heading small') === 'Position unknown'
  );

  t = await mount(variants.unavailable);
  await t.act('cover-open', 'cover.test');
  check('unavailable cover issues no action', t.calls.length === 0);
}
