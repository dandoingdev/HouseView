export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check('card mode renders the scene', !!t.q('.ov-{{type}}-scene'));
  t = await mount(variants.ok, {mode: 'screensaver'});
  check('screensaver mode shows the layer', !!t.layer);
  t = await mount(variants.missing);
  check('a missing entity renders calmly', !!t.q('.ov-{{type}}-scene'));
}
