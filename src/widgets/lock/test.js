// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService, `infos` every
// more-info request, `confirms` every confirmation message (the harness answers with confirmWith(true|false)).
export default async function ({mount, check, variants, confirms, confirmWith}) {
  let t = await mount(variants.ok);
  check(
    'a locked door shows the closed padlock and its raw state',
    t.q('ha-icon').getAttribute('icon') === 'mdi:lock' &&
      t.text('[data-action="lock"] small') === 'locked' &&
      !t.q('[data-action="lock"].active')
  );

  confirms.length = 0;
  confirmWith(false);
  await t.click('lock');
  check(
    'declining the confirmation sends nothing',
    confirms.length === 1 && confirms[0] === 'Unlock this door?' && t.calls.length === 0
  );

  confirms.length = 0;
  confirmWith(true);
  await t.click('lock');
  check(
    'confirming unlocks only its own entity',
    confirms.length === 1 &&
      t.calls.length === 1 &&
      t.calls[0].d === 'lock' &&
      t.calls[0].s === 'unlock' &&
      t.calls[0].data.entity_id === 'lock.test'
  );

  t = await mount(variants.unlocked);
  confirms.length = 0;
  confirmWith(false);
  await t.click('lock');
  check(
    'locking needs no confirmation',
    confirms.length === 0 &&
      t.calls.length === 1 &&
      t.calls[0].s === 'lock' &&
      t.calls[0].data.entity_id === 'lock.test'
  );
  check(
    'an unlocked door shows the open padlock',
    t.q('ha-icon').getAttribute('icon') === 'mdi:lock-open'
  );

  for (const name of ['locking', 'unlocking', 'jammed']) {
    t = await mount(variants[name]);
    confirms.length = 0;
    await t.click('lock');
    check(
      `${name} opens more-info and sends nothing`,
      t.calls.length === 0 && confirms.length === 0 && t.infos.includes('lock.test')
    );
  }

  t = await mount(variants.customIcon);
  check(
    'custom icon and name are used',
    t.q('ha-icon').getAttribute('icon') === 'mdi:door-closed-lock' &&
      t.text('[data-action="lock"] span') === 'Back door'
  );

  t = await mount(variants.foreignIcon);
  check(
    'non-mdi icon prefix is passed through',
    t.q('ha-icon').getAttribute('icon') === 'hass:lock'
  );

  t = await mount(variants.hostileName);
  check(
    'name is escaped, not parsed as markup',
    !t.q('[data-action="lock"] b') && t.text('[data-action="lock"] span') === '<b>"Door" & co</b>'
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable lock is disabled and labelled',
    t.q('[data-action="lock"]').disabled && t.text('[data-action="lock"]').includes('Unavailable')
  );
  await t.act('lock', 'lock.test');
  check('unavailable lock issues no service call', t.calls.length === 0);

  t = await mount(variants.unknown);
  check('unknown lock is disabled', t.q('[data-action="lock"]').disabled);

  t = await mount(variants.missing);
  await t.act('lock', 'lock.test');
  check(
    'missing entity renders disabled and issues no service call',
    t.q('[data-action="lock"]').disabled && t.calls.length === 0
  );
}
