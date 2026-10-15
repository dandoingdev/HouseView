// Browser behaviour test. Runs against dist/houseview.js with a recording mock hass (no network, no HA):
//   mount(variant) -> {card, root, q, qa, text, click(action), act(action, id), calls, infos, setState, remove}
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  await t.click('{{type}}-toggle');
  check(
    '{{type}} tap calls its own service once',
    t.calls.length === 1 &&
      t.calls[0].d === '{{firstDomain}}' &&
      t.calls[0].s === 'toggle' &&
      t.calls[0].data.entity_id === '{{firstDomain}}.test'
  );

  t = await mount(variants.unavailable);
  await t.act('{{type}}-toggle', '{{firstDomain}}.test');
  check('unavailable {{type}} issues no action', t.calls.length === 0);
}
