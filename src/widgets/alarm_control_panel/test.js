// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService, `infos` every
// more-info request.
export default async function ({mount, check, variants}) {
  let t = await mount(variants.armedHome);
  check(
    'armed alarm shows the check shield, state text and is active',
    !!t.q('[data-action="info"].alarm-tile.control.active') &&
      t.q('ha-icon').getAttribute('icon') === 'mdi:shield-check-outline' &&
      t.text('small') === 'armed home'
  );
  check('tile carries the arming hint', t.text('.control-note') === 'Open arming controls');
  await t.click('info');
  check(
    'a tap opens more-info and never calls a service',
    t.calls.length === 0 && t.infos.length === 1 && t.infos[0] === 'alarm_control_panel.test'
  );

  t = await mount(variants.disarmed);
  check(
    'disarmed alarm is not active and uses the moon shield',
    !t.q('.alarm-tile.active') && t.q('ha-icon').getAttribute('icon') === 'mdi:shield-moon-outline'
  );

  t = await mount(variants.triggered);
  check(
    'triggered alarm is not marked armed',
    !t.q('.alarm-tile.active') && t.text('small') === 'triggered'
  );

  t = await mount(variants.hostileName);
  check(
    'name is escaped, not parsed as markup',
    !t.q('.alarm-tile b') && t.text('.alarm-tile span') === '<b>"Alarm" & co</b>'
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable alarm is disabled and labelled',
    t.q('[data-action="info"]').disabled && t.text('small') === 'Unavailable'
  );

  t = await mount(variants.unknown);
  check('unknown alarm is disabled', t.q('[data-action="info"]').disabled);

  t = await mount(variants.missing);
  check(
    'missing entity renders disabled',
    t.q('[data-action="info"]').disabled && t.calls.length === 0
  );
}
