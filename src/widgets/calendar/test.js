// Browser behaviour tests (docs/widget-api.md). The calendar widget has no actions of its own: a tap
// opens more-info through the core `info` action.
export default async function ({mount, check, variants}) {
  const today = new Date();
  let t = await mount(variants.ok);
  check(
    'calendar shows today, the next event and its time',
    t.text('.calendar-day') === String(today.getDate()) &&
      t.text('.calendar-month') !== '' &&
      t.text('.calendar-event') === 'Dentist' &&
      t.text('small') !== '' &&
      !t.text('small').includes('Connect')
  );
  check('timed event shows a clock time', /\d:\d\d|\d\s?(am|pm)/i.test(t.text('small')));

  await t.click('calendar-view');
  check(
    'tap shows the month calendar and calls no service',
    t.infos.length === 0 && t.calls.length === 0
  );

  t = await mount(variants.allDay);
  check(
    'all-day event shows no clock time',
    !/\d:\d\d/.test(t.text('small')) && t.text('small') !== ''
  );

  t = await mount(variants.noEvent);
  check(
    'no event shows the placeholder and the connect hint',
    t.text('.calendar-event') === 'No upcoming event' &&
      t.text('small') === 'Connect your family calendar in Edit widgets'
  );

  t = await mount(variants.badStart);
  check(
    'unparsable start_time falls back to the connect hint',
    t.text('small') === 'Connect your family calendar in Edit widgets'
  );

  t = await mount(variants.hostile);
  check('event text is escaped', !t.q('.calendar-content img') && !t.q('.calendar-content b'));

  t = await mount(variants.wide);
  check('size class is applied', !!t.q('.calendar-content.size-wide'));

  t = await mount(variants.unavailable);
  check(
    'unavailable calendar is disabled and labelled',
    t.q('[data-action="calendar-view"]').disabled &&
      t.text('.calendar-event') === 'Calendar unavailable' &&
      !t.text('.calendar-content').includes('Hidden')
  );
  await t.act('info', 'calendar.test');
  check('unavailable calendar issues no service call', t.calls.length === 0);

  t = await mount(variants.missing);
  check('missing calendar entity is disabled', t.q('[data-action="calendar-view"]').disabled);
}
