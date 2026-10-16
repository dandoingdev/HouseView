// Browser behaviour tests (docs/widget-api.md). The harness pins Date to 2026-10-15 10:10 (Europe/London),
// so the expected hand angles are computed from `new Date` instead of being hard-coded.
const hourDeg = (d) => (d.getHours() % 12) * 30 + d.getMinutes() / 2;
const minuteDeg = (d) => d.getMinutes() * 6;
const rotation = (el) => el?.style.transform || '';

export default async function ({mount, check, variants, advance}) {
  let t = await mount(variants.ok);
  const now = new Date();
  const clock = t.q('.clock');
  check(
    'clock renders a dial with 12 ticks, 12 numerals and two hands',
    !!clock &&
      t.qa('.dial i').length === 12 &&
      t.qa('.clock-number').length === 12 &&
      !!t.q('.hand.hour') &&
      !!t.q('.hand.minute') &&
      !!t.q('.pin')
  );
  check(
    'clock needs no entity; its only control shows World Clock',
    t.qa('.face button').length === 1 &&
      t.q('.face button').dataset.action === 'world-clock-view' &&
      t.calls.length === 0
  );
  check(
    'hands point at the current time after the first render',
    rotation(t.q('.hand.hour')) === `rotate(${hourDeg(now)}deg)` &&
      rotation(t.q('.hand.minute')) === `rotate(${minuteDeg(now)}deg)`
  );
  check(
    'aria-label is the time and the clock shows no date',
    /\d{1,2}:\d{2}/.test(clock.getAttribute('aria-label') || '') && !t.q('.clock-date')
  );
  check('default name shows nothing', t.text('.clock-caption strong') === '');

  const before = rotation(t.q('.hand.minute'));
  if (typeof advance === 'function') {
    await advance(120000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    check('the tick moves the minute hand', rotation(t.q('.hand.minute')) !== before);
  }

  t = await mount(variants.named);
  check('a name is shown in the caption', t.text('.clock-caption strong') === 'Kitchen');

  t = await mount(variants.namedClock);
  check('the name "clock" is treated as the default', t.text('.clock-caption strong') === '');

  t = await mount(variants.hostileName);
  check(
    'name is escaped, not parsed as markup',
    !t.q('.clock-caption img') && t.text('.clock-caption strong').startsWith('<img')
  );

  // preview_time is a carousel key; a standalone card does not forward it to its inner controller (behaviour).
  t = await mount(variants.previewTime, {as: 'card'});
  check(
    'preview_time pins the clock',
    rotation(t.q('.hand.hour')) === 'rotate(112.5deg)' &&
      rotation(t.q('.hand.minute')) === 'rotate(270deg)'
  );
  t = await mount({...variants.ok, config: {calendar_view: false}}, {as: 'card'});
  check('calendar opt-out does not disable World Clock', !!t.q('[data-action="world-clock-view"]'));
  t = await mount({...variants.ok, config: {world_clock_view: false}}, {as: 'card'});
  check('World Clock can be disabled independently', !t.q('[data-action="world-clock-view"]'));
}
