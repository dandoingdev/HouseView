// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService, `infos` every more-info.
const only = (t, service, data) =>
  t.calls.length === 1 &&
  t.calls[0].d === 'climate' &&
  t.calls[0].s === service &&
  Object.entries(data).every(([k, v]) => t.calls[0].data[k] === v);

export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'thermostat shows the target as a bare number, no unit sign',
    t.text('.cs-value') === '21' && !t.q('sup') && !t.text('.cs-number').includes('°')
  );
  check(
    'tile is the minimal face: no power key, shortcut keys or room line',
    !!t.q('.climate-simple') &&
      !t.q('.thermostat') &&
      t.qa('[data-widget] button').length === 3 &&
      !t.q('[data-action="climate-on"]') &&
      !t.q('[data-action="climate-off"]') &&
      !t.q('.climate-power, .climate-quick, .climate-room')
  );
  check(
    'down chevron, name and up chevron sit in one bar, in that order',
    [...t.q('.cs-bar').children].map((el) => el.dataset.action || el.className).join() ===
      'down,cs-label,up'
  );
  await t.click('up');
  check(
    'up raises the target by the default step',
    only(t, 'set_temperature', {entity_id: 'climate.test', temperature: 21.5})
  );
  t = await mount(variants.ok);
  await t.click('down');
  check('down lowers it', only(t, 'set_temperature', {temperature: 20.5}));

  t = await mount(variants.customStep);
  await t.click('up');
  check(
    'target_temp_step is used and float noise rounded',
    only(t, 'set_temperature', {temperature: 20.2})
  );

  t = await mount(variants.fahrenheit);
  await t.click('up');
  check('Fahrenheit steps by one degree', only(t, 'set_temperature', {temperature: 71}));

  t = await mount(variants.atMin);
  check(
    'down is disabled at min_temp',
    t.q('[data-action="down"]').disabled && !t.q('[data-action="up"]').disabled
  );
  t = await mount(variants.atMax);
  check('up is disabled at max_temp', t.q('[data-action="up"]').disabled);

  t = await mount(variants.heatCool);
  check(
    'heat_cool shows the room temperature and disables the keys',
    t.text('.cs-value') === '20.5' &&
      t.q('[data-action="up"]').disabled &&
      t.q('[data-action="down"]').disabled
  );
  await t.act('up', 'climate.test');
  check(
    'stepping in heat_cool opens more-info',
    t.calls.length === 0 && t.infos.includes('climate.test')
  );

  t = await mount(variants.noTargetFeature);
  await t.act('down', 'climate.test');
  check(
    'no target feature: more-info, no service',
    t.calls.length === 0 && t.infos.includes('climate.test')
  );

  t = await mount(variants.ok);
  check('rendering never sends a command', t.calls.length === 0);
  await t.click('info');
  check(
    'tapping the temperature opens more-info',
    t.infos.includes('climate.test') && t.calls.length === 0
  );

  // The removed actions are unknown now: dispatching one does nothing at all.
  t = await mount(variants.ok);
  for (const action of [
    'climate-on',
    'climate-off',
    'climate-cool',
    'climate-heat',
    'climate-quiet'
  ]) {
    await t.act(action, 'climate.test');
  }
  check('the removed power and shortcut actions issue no call', t.calls.length === 0);

  t = await mount(variants.withRoom);
  check(
    'name, then "room • current°" under it',
    t.text('.cs-name') === 'climate' && t.text('.cs-sub') === 'Living Room • 20.5°'
  );
  t = await mount(variants.customName);
  check('no room: just the current temperature', t.text('.cs-sub') === '20.5°');
  t = await mount(variants.roomNoCurrent);
  check('no current temperature: just the room', t.text('.cs-sub') === 'Living Room');
  t = await mount(variants.noRoomNoCurrent);
  check('no room and no current temperature: empty line', t.text('.cs-sub') === '');
  t = await mount(variants.decimalTarget);
  check(
    'one decimal at most, in both numbers',
    t.text('.cs-value') === '21.5' && t.text('.cs-sub') === '20.3°'
  );
  t = await mount(variants.fahrenheitRoom);
  check('Fahrenheit keeps a plain degree sign', t.text('.cs-sub') === 'Hall • 68.5°');

  t = await mount(variants.withRoomOff);
  check(
    'off: "Off" leads the line and the number is dimmed',
    t.text('.cs-sub') === 'Off • Living Room • 20.5°' &&
      t.q('.climate-simple').classList.contains('cs-dim') &&
      !t.q('[data-action="info"]').disabled
  );
  t = await mount(variants.withRoom);
  check('on: the number is not dimmed', !t.q('.climate-simple').classList.contains('cs-dim'));

  t = await mount(variants.hostileName);
  check('name is escaped everywhere', !t.q('b') && t.text('.cs-name') === '<b>"AC" & co</b>');
  t = await mount(variants.hostileRoom);
  check('room is escaped', !t.q('i') && t.text('.cs-sub') === '<i>"R"</i> & co • 20.5°');

  t = await mount(variants.unavailableRoom);
  check(
    'unavailable tile shows a dash, says so, and is disabled',
    t.text('.cs-value') === '—' &&
      t.text('.cs-sub') === 'Unavailable • Living Room' &&
      t.q('.climate-simple').classList.contains('cs-dim') &&
      t.qa('[data-widget] button:not(:disabled)').length === 0
  );
  await t.act('up', 'climate.test');
  check('unavailable thermostat issues no call', t.calls.length === 0);

  t = await mount(variants.missing);
  await t.act('up', 'climate.test');
  check(
    'missing entity issues no call',
    t.calls.length === 0 && t.qa('[data-widget] button:not(:disabled)').length === 0
  );
}
