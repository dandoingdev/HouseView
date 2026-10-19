// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService, `infos` every more-info.
const only = (t, service, data) =>
  t.calls.length === 1 &&
  t.calls[0].d === 'vacuum' &&
  t.calls[0].s === service &&
  Object.entries(data).every(([k, v]) => t.calls[0].data[k] === v);

export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'cleaning tile shows the activity, battery and vacuum icon, and is highlighted',
    t.text('[data-action="vacuum-view"] small') === 'Cleaning • 72%' &&
      t.q('ha-icon').getAttribute('icon') === 'mdi:robot-vacuum' &&
      t.q('.control').classList.contains('active') &&
      t.text('[data-action="vacuum-view"] > span') === 'Robot'
  );
  check('rendering never sends a command', t.calls.length === 0);
  await t.click('vacuum-view');
  check(
    'a tap opens the cleaning panel and calls no service',
    !!t.q('.hv-screensaver .ov-vacuum-scene') && t.calls.length === 0 && t.infos.length === 0
  );

  t = await mount(variants.ok);
  await t.act('vacuum-pause', 'vacuum.test');
  check('pause while cleaning calls vacuum.pause', only(t, 'pause', {entity_id: 'vacuum.test'}));
  t = await mount(variants.ok);
  await t.act('vacuum-start', 'vacuum.test');
  check('start is refused while cleaning', t.calls.length === 0);
  t = await mount(variants.ok);
  await t.act('vacuum-return', 'vacuum.test');
  check(
    'return to dock calls vacuum.return_to_base',
    only(t, 'return_to_base', {entity_id: 'vacuum.test'})
  );
  t = await mount(variants.ok);
  await t.act('vacuum-stop', 'vacuum.test');
  check('stop calls vacuum.stop', only(t, 'stop', {entity_id: 'vacuum.test'}));
  t = await mount(variants.ok);
  await t.act('vacuum-spot', 'vacuum.test');
  check('spot is refused while cleaning', t.calls.length === 0);
  t = await mount(variants.ok);
  await t.act('vacuum-locate', 'vacuum.test');
  check('locate calls vacuum.locate', only(t, 'locate', {entity_id: 'vacuum.test'}));
  t = await mount(variants.ok);
  await t.act('vacuum-fan-1', 'vacuum.test');
  check(
    'a fan-speed key sends that speed',
    only(t, 'set_fan_speed', {entity_id: 'vacuum.test', fan_speed: 'Balanced'})
  );
  t = await mount(variants.ok);
  await t.act('vacuum-fan-9', 'vacuum.test');
  check('a fan-speed index past the list is ignored', t.calls.length === 0);

  t = await mount(variants.docked);
  check(
    'docked is quiet and shows a full battery',
    t.text('small') === 'Docked • 100%' && !t.q('.control').classList.contains('active')
  );
  await t.act('vacuum-start', 'vacuum.test');
  check('start from the dock calls vacuum.start', only(t, 'start', {entity_id: 'vacuum.test'}));
  t = await mount(variants.docked);
  await t.act('vacuum-return', 'vacuum.test');
  check('return is refused when it is already docked', t.calls.length === 0);
  t = await mount(variants.docked);
  await t.act('vacuum-spot', 'vacuum.test');
  check('spot clean calls vacuum.clean_spot', only(t, 'clean_spot', {entity_id: 'vacuum.test'}));

  t = await mount(variants.paused);
  await t.act('vacuum-start', 'vacuum.test');
  check(
    'start while paused resumes with vacuum.start',
    only(t, 'start', {entity_id: 'vacuum.test'})
  );

  t = await mount(variants.legacy);
  await t.act('vacuum-start', 'vacuum.test');
  check(
    'an older vacuum starts with vacuum.turn_on',
    only(t, 'turn_on', {entity_id: 'vacuum.test'})
  );
  t = await mount(variants.turnOffOnly);
  await t.act('vacuum-stop', 'vacuum.test');
  check(
    'an older vacuum stops with vacuum.turn_off',
    only(t, 'turn_off', {entity_id: 'vacuum.test'})
  );

  t = await mount(variants.noFeatures);
  await t.act('vacuum-start', 'vacuum.test');
  check('a vacuum with no cleaning features ignores start', t.calls.length === 0);

  t = await mount(variants.error);
  check(
    'an error shows the integration status and battery',
    t.text('small') === 'Brush stuck • 12%'
  );
  t = await mount(variants.idle);
  check('no battery leaves just the activity', t.text('small') === 'Idle');
  t = await mount(variants.charging);
  check(
    'charging is named and not highlighted',
    t.text('small') === 'Charging • 80%' && !t.q('.active')
  );
  t = await mount(variants.customIcon);
  check(
    'a chosen icon replaces the vacuum icon',
    t.q('ha-icon').getAttribute('icon') === 'mdi:broom'
  );
  t = await mount(variants.hostileName);
  check(
    'name and status are text, not markup',
    !t.q('b') &&
      t.text('span') === '<b>"Bot" & co</b>' &&
      t.text('small') === '<b>bad</b> & co • 72%'
  );

  t = await mount(variants.vacuumViewOff, {as: 'card'});
  check(
    'vacuum_view: false keeps the entity dialog on the tile',
    !!t.q('[data-action="info"]') && !t.q('[data-action="vacuum-view"]')
  );
  await t.hold('[data-action="info"]');
  check(
    'that hold opens more-info and calls no service',
    t.infos.includes('vacuum.test') && t.calls.length === 0
  );

  t = await mount(variants.ok);
  await t.hold();
  check(
    'holding the tile opens the entity dialog and does not start cleaning',
    t.infos.includes('vacuum.test') && t.calls.length === 0 && !t.q('.ov-vacuum-scene')
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable vacuum is disabled and labelled',
    t.q('[data-action="vacuum-view"]').disabled && t.text('small') === 'Unavailable'
  );
  await t.act('vacuum-start', 'vacuum.test');
  check('unavailable vacuum issues no command', t.calls.length === 0);
  t = await mount(variants.missing);
  check('a missing vacuum renders disabled', t.q('[data-action="vacuum-view"]').disabled);
}
