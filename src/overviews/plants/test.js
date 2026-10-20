export default async function ({mount, check, variants}) {
  // The plants come from the dashboard's Plants widget, so the view is mounted as the layer a hold opens, with
  // that widget on the page.
  const open = (variant) =>
    mount(variant, {
      mode: 'screensaver',
      cards: (variant.config?.widgets || []).map(({type, entity: _entity, ...rest}) => ({
        type: `custom:houseview-${type}-card`,
        ...rest
      }))
    });
  let t = await open(variants.ok);
  check('the layer renders the scene', !!t.q('.ov-plants-scene'));
  check('a card per plant', t.qa('.ov-plants-card').length === 3);
  check(
    'the ring shows the humidity',
    t.q('.ov-plants-card .ov-plants-value')?.textContent.startsWith('54') &&
      t.q('.ov-plants-card .ov-plants-ring')?.style.getPropertyValue('--p') === '54'
  );
  check('everyone happy summary', t.text('.ov-plants-summary') === 'Everyone is happy');
  check(
    'a card opens the more-info of its humidity sensor',
    t.q('.ov-plants-card')?.dataset.action === 'info' &&
      t.q('.ov-plants-card')?.dataset.entity === 'sensor.fern_humidity'
  );

  t = await open(variants.care);
  const states = t.qa('.ov-plants-card').map((card) => card.dataset.state);
  check('dry, wet and cold plants are flagged', states.join() === 'dry,wet,cold');
  check('care summary counts them', t.text('.ov-plants-summary') === '3 plants need care');
  check('low battery is marked', !!t.q('.ov-plants-foot-item[data-low="true"]'));

  t = await open(variants.unavailable);
  check(
    'unavailable sensors show offline cards with a dash',
    t.qa('.ov-plants-card[data-state="offline"]').length === 3 &&
      t.text('.ov-plants-value').startsWith('—')
  );

  t = await mount(variants.ok, {mode: 'screensaver'});
  check(
    'screensaver mode shows the layer and a close key',
    !!t.layer && !!t.q('[data-action="overview-close"]')
  );

  t = await mount(variants.missing);
  check('no plants widget renders calmly', !!t.q('.ov-plants-empty'));
}
