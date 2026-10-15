// Browser behaviour tests (tests/overviews/harness.js, against dist/houseview.js). The harness clock is fixed at
// 2026-10-15 10:10 (Europe/London): a Thursday.
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  const cells = t.qa('.ov-cm-d');
  const today = t.q('.ov-cm-today');
  check(
    'six rows of seven days with today highlighted',
    cells.length === 42 &&
      !!today &&
      today.textContent === '15' &&
      t.qa('.ov-cm-today').length === 1
  );
  check('the big number is today', t.text('.ov-cm-big') === '15');
  check(
    'the month and the weekday initials are shown (Monday first)',
    t.text('.ov-cm-month') === 'October 2026' &&
      t
        .qa('.ov-cm-days span')
        .map((e) => e.textContent)
        .join('') === 'MTWTFSS'
  );
  check(
    'days outside the month are dimmed',
    cells.slice(0, 3).every((c) => c.classList.contains('ov-cm-out')) &&
      cells[3].textContent === '1'
  );

  t = await mount(variants.sunday);
  check(
    'week_start: sunday starts the week on Sunday',
    t
      .qa('.ov-cm-days span')
      .map((e) => e.textContent)
      .join('') === 'SMTWTFS'
  );
  t = await mount(variants.profileSunday);
  check(
    'automatic follows the Home Assistant profile',
    t
      .qa('.ov-cm-days span')
      .map((e) => e.textContent)
      .join('') === 'SMTWTFS'
  );

  t = await mount(variants.noTime, {mode: 'screensaver'});
  check('show_time: false leaves the time out', !t.q('.ov-cm-time'));
  t = await mount(variants.ok, {mode: 'screensaver'});
  check('the screensaver shows the time', t.text('.ov-cm-time') === '10:09' && !t.calls.length);
}
