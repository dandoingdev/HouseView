// Browser behaviour test (docs/widget-api.md). Runs against dist/houseview.js with a recording mock hass.
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'cover shows position and three keys',
    t.text('.bs-status') === '40% open' && t.qa('.bs-key').length === 3
  );
  check(
    'cover keys are open, stop, close in that order',
    t
      .qa('.bs-key')
      .map((b) => b.dataset.action)
      .join() === 'cover-open,cover-stop,cover-close'
  );
  check(
    'cover key carries the entity and a screen-reader name',
    t.q('[data-action="cover-open"]').dataset.entity === 'cover.test' &&
      t.q('[data-action="cover-open"] .sr').textContent.trim() === 'Open cover'
  );

  for (const [action, service] of [
    ['cover-open', 'open_cover'],
    ['cover-stop', 'stop_cover'],
    ['cover-close', 'close_cover']
  ]) {
    t = await mount(variants.ok);
    await t.click(action);
    check(
      `${action} calls cover.${service} for its own entity only`,
      t.calls.length === 1 &&
        t.calls[0].d === 'cover' &&
        t.calls[0].s === service &&
        t.calls[0].data.entity_id === 'cover.test' &&
        Object.keys(t.calls[0].data).length === 1
    );
  }

  t = await mount(variants.closed);
  check('position 0 reads 0% open', t.text('.bs-status') === '0% open');

  t = await mount(variants.fractional);
  check('position is rounded', t.text('.bs-status') === '34% open');

  t = await mount(variants.noPosition);
  check('no position falls back to the raw state', t.text('.bs-status') === 'open');

  t = await mount(variants.opening);
  check('opening state is shown as text', t.text('.bs-status') === 'opening');

  t = await mount(variants.openOnly);
  check(
    'only the supported key is enabled',
    !t.q('[data-action="cover-open"]').disabled &&
      t.q('[data-action="cover-close"]').disabled &&
      t.q('[data-action="cover-stop"]').disabled
  );
  await t.act('cover-close', 'cover.test');
  await t.act('cover-stop', 'cover.test');
  check('unsupported keys never call a service', t.calls.length === 0);

  t = await mount(variants.stopOnly);
  await t.click('cover-stop');
  check('stop-only cover can stop', t.calls.length === 1 && t.calls[0].s === 'stop_cover');

  t = await mount(variants.noFeatures);
  check('no features disables every key', t.qa('.bs-key:not(:disabled)').length === 0);

  t = await mount(variants.unknown);
  check('unknown state shows position unknown', t.text('.bs-status') === 'Position unknown');
  check('unknown state keeps the keys enabled', t.qa('.bs-key:not(:disabled)').length === 3);
  await t.click('cover-open');
  check(
    'unknown state still allows open',
    t.calls.length === 1 &&
      t.calls[0].d === 'cover' &&
      t.calls[0].s === 'open_cover' &&
      t.calls[0].data.entity_id === 'cover.test'
  );

  t = await mount(variants.unknown);
  await t.click('info');
  check(
    'heading on an unknown cover opens more-info, no service',
    t.infos.includes('cover.test') && t.calls.length === 0
  );

  t = await mount(variants.unknownPosition);
  check('a numeric position wins over unknown', t.text('.bs-status') === '70% open');

  t = await mount(variants.named);
  check('name is escaped', t.text('.bs-name') === 'Kitchen & <b>Bay</b>' && !t.q('.bs-heading b'));

  t = await mount(variants.unavailable);
  await t.act('cover-open', 'cover.test');
  check(
    'unavailable cover is disabled, labelled and issues no action',
    t.calls.length === 0 &&
      t.qa('.face button:not(:disabled)').length === 0 &&
      t.text('.bs-status') === 'Unavailable'
  );

  t = await mount(variants.missing);
  await t.act('cover-open', 'cover.test');
  check(
    'missing cover issues no action',
    t.calls.length === 0 && t.qa('.face button:not(:disabled)').length === 0
  );

  t = await mount(variants.ok);
  await t.act('cover-open', 'light.other');
  check('cover action on a non-cover entity is ignored', t.calls.length === 0);
}
