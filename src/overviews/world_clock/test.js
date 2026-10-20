export default async function ({mount, check, variants, wait}) {
  let t = await mount(variants.ok);
  check(
    'dark scene, yellow title, location pin and rounded city rows match the reference',
    getComputedStyle(t.q('.ov-world-clock-scene')).backgroundColor === 'rgb(23, 23, 25)' &&
      t.q('.ov-world-clock-pin')?.getAttribute('icon') === 'mdi:map-marker' &&
      getComputedStyle(t.q('.ov-world-clock-pin')).color === 'rgb(255, 209, 73)' &&
      getComputedStyle(t.q('.ov-world-clock-pin')).marginBottom === '0px' &&
      t.qa('.ov-world-clock-row').length === 2
  );
  check(
    'local New York and Cupertino show their times and a three-hour offset',
    t.text('[data-clock="local"] .ov-world-clock-city').includes('New York') &&
      t.text('[data-clock="local"] .ov-world-clock-time').includes('4:47') &&
      t.text('[data-clock="sensor.cupertino"] .ov-world-clock-time') === '1:47 PM' &&
      t.text('[data-clock="sensor.cupertino"] .ov-world-clock-sub').includes('−3 HRS')
  );
  check(
    'card mode has no close key or disabled details key',
    !t.q('[data-action="overview-close"]') && !t.q('[data-action="info"]')
  );
  t = await mount(variants.noLocal);
  check(
    'local row can be omitted',
    !t.q('[data-clock="local"]') && t.qa('.ov-world-clock-row').length === 1
  );
  t = await mount(variants.hostileName);
  check(
    'city names are escaped',
    !t.q('.ov-world-clock-city b') &&
      t.text('[data-clock="sensor.cupertino"] .ov-world-clock-city') === '<b>City</b>'
  );
  for (const name of ['missing', 'unavailable']) {
    t = await mount(variants[name]);
    check(
      `${name} sensor keeps a labelled row and a dash`,
      t.text('[data-clock="sensor.cupertino"] .ov-world-clock-time') === '—' &&
        t.text('[data-clock="sensor.cupertino"] .ov-world-clock-sub') === 'Unavailable'
    );
  }
  t = await mount(variants.empty);
  check(
    'no clocks shows setup help',
    !!t.q('.ov-world-clock-empty') && t.qa('.ov-world-clock-row').length === 0
  );

  t = await mount(variants.auto);
  t.hass.callWS = async ({type}) =>
    type === 'config/entity_registry/list'
      ? [
          {entity_id: 'sensor.singapore', platform: 'worldclock', config_entry_id: 'sg'},
          {entity_id: 'sensor.not_a_clock', platform: 'template'}
        ]
      : [{entry_id: 'sg', title: 'Singapore'}];
  t.el.hass = t.hass;
  await t.settle(50);
  check(
    'registry discovery includes Worldclock sensors only',
    !!t.q('[data-clock="sensor.singapore"]') && !t.q('[data-clock="sensor.not_a_clock"]')
  );
  check(
    'registry timezone metadata gives tomorrow and the exact offset',
    t.text('[data-clock="sensor.singapore"] .ov-world-clock-sub').includes('Tomorrow, +12 HRS')
  );
  t.mock.replaceState('sensor.singapore', {
    state: '04:48',
    attributes: {friendly_name: 'Singapore'}
  });
  t.el.hass = t.hass;
  t.advance(1);
  await t.settle();
  check(
    'live sensor changes update the clock rows',
    t.text('[data-clock="sensor.singapore"] .ov-world-clock-time') === '04:48'
  );
  check('world clocks make no service calls', t.calls.length === 0);

  t = await mount(
    {
      ...variants.ok,
      states: {...variants.ok.states, 'calendar.test': {state: 'off', attributes: {}}}
    },
    {
      mode: 'carousel',
      bare: true,
      cards: [
        {type: 'custom:houseview-clock-card'},
        {type: 'custom:houseview-calendar-card', entity: 'calendar.test'}
      ]
    }
  );
  t.hass.callWS = async ({type}) =>
    type === 'config/entity_registry/list'
      ? [{entity_id: 'sensor.cupertino', platform: 'worldclock', config_entry_id: 'cup'}]
      : [{entry_id: 'cup', title: 'America/Los_Angeles'}];
  await t.click('world-clock-view');
  await t.settle(40);
  check(
    'clock opens World Clock instead of the calendar',
    !!t.layer?.querySelector('.ov-world-clock-scene') &&
      !!t.layer?.querySelector('[data-clock="sensor.cupertino"]') &&
      !t.layer?.querySelector('.ov-calendar_month-scene')
  );
  await t.click('overview-close', 'world_clock');
  await wait(400);
  t.advance(1);
  await t.click('calendar-view');
  await t.settle(40);
  check(
    'calendar retains its calendar overlay link',
    !!t.layer?.querySelector('.ov-calendar_month-scene') &&
      !t.layer?.querySelector('.ov-world-clock-scene')
  );
}
