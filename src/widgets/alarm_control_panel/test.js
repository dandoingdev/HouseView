// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService, `infos` every
// more-info request, `confirms` every confirmation message (the harness answers with confirmWith(true|false)).
const only = (t, service) =>
  t.calls.length === 1 &&
  t.calls[0].d === 'alarm_control_panel' &&
  t.calls[0].s === service &&
  t.calls[0].data.entity_id === 'alarm_control_panel.test';

export default async function ({mount, check, variants, confirms, confirmWith}) {
  let t = await mount(variants.armedHome);
  check(
    'armed alarm shows the check shield, state text and is active',
    !!t.q('[data-action="alarm-view"].alarm-tile.control.active') &&
      t.q('ha-icon').getAttribute('icon') === 'mdi:shield-check-outline' &&
      t.text('small') === 'armed home'
  );
  check('tile carries the arming hint', t.text('.control-note') === 'Open arming controls');
  await t.hold('[data-action="alarm-view"]');
  check(
    'a hold opens more-info and never calls a service',
    t.calls.length === 0 && t.infos.length === 1 && t.infos[0] === 'alarm_control_panel.test'
  );

  t = await mount(variants.armedHome);
  await t.click('alarm-view');
  check(
    'a tap opens the alarm view and calls no service',
    !!t.q('.hv-screensaver .ov-alarm-scene') && t.calls.length === 0 && t.infos.length === 0
  );

  t = await mount(variants.alarmViewOff, {as: 'card'});
  check(
    'alarm_view: false keeps the entity dialog on the tile',
    !!t.q('[data-action="info"]') && !t.q('[data-action="alarm-view"]')
  );

  for (const [action, service] of [
    ['alarm-control-panel-arm-home', 'alarm_arm_home'],
    ['alarm-control-panel-arm-away', 'alarm_arm_away'],
    ['alarm-control-panel-arm-night', 'alarm_arm_night'],
    ['alarm-control-panel-arm-vacation', 'alarm_arm_vacation']
  ]) {
    t = await mount(variants.disarmed);
    await t.act(action, 'alarm_control_panel.test');
    check(`${action} calls ${service} while disarmed`, only(t, service));
  }
  t = await mount(variants.armedHome);
  await t.act('alarm-control-panel-arm-away', 'alarm_control_panel.test');
  check('arming is refused while already armed', t.calls.length === 0);
  t = await mount(variants.codeRequired);
  await t.act('alarm-control-panel-arm-home', 'alarm_control_panel.test');
  check('arming is refused when the panel wants a code', t.calls.length === 0);
  t = await mount(variants.noFeatures);
  await t.act('alarm-control-panel-arm-night', 'alarm_control_panel.test');
  check('a mode the panel does not advertise is refused', t.calls.length === 0);
  t = await mount(variants.disarmed);
  await t.act('alarm-control-panel-arm-home', 'switch.not_an_alarm');
  check('only alarm panels can be armed', t.calls.length === 0);

  t = await mount(variants.armedHome);
  confirms.length = 0;
  confirmWith(false);
  await t.act('alarm-control-panel-disarm', 'alarm_control_panel.test');
  check(
    'declining the confirmation sends nothing',
    confirms.length === 1 && confirms[0].startsWith('Disarm ') && t.calls.length === 0
  );
  confirms.length = 0;
  confirmWith(true);
  await t.act('alarm-control-panel-disarm', 'alarm_control_panel.test');
  check('confirming disarms only its own entity', only(t, 'alarm_disarm'));
  for (const variant of ['arming', 'pending', 'triggered']) {
    t = await mount(variants[variant]);
    confirmWith(true);
    await t.act('alarm-control-panel-disarm', 'alarm_control_panel.test');
    check(`disarm works while ${variant}`, only(t, 'alarm_disarm'));
  }
  t = await mount(variants.disarmed);
  confirms.length = 0;
  await t.act('alarm-control-panel-disarm', 'alarm_control_panel.test');
  check(
    'disarm is refused while disarmed, without asking',
    confirms.length === 0 && t.calls.length === 0
  );
  t = await mount(variants.codeArmed);
  await t.act('alarm-control-panel-disarm', 'alarm_control_panel.test');
  check('disarm is refused when the panel wants a code', t.calls.length === 0);

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
    t.q('[data-action="alarm-view"]').disabled && t.text('small') === 'Unavailable'
  );

  t = await mount(variants.unknown);
  check('unknown alarm is disabled', t.q('[data-action="alarm-view"]').disabled);

  t = await mount(variants.missing);
  check(
    'missing entity renders disabled',
    t.q('[data-action="alarm-view"]').disabled && t.calls.length === 0
  );
}
