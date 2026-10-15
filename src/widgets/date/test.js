// Browser behaviour tests (docs/widget-api.md). The date widget has no actions.
export default async function ({mount, check, variants}) {
  const now = new Date();
  let t = await mount(variants.ok);
  check(
    'date tile shows weekday, month and day number',
    t.qa('.date-panel').length === 1 &&
      t.text('.calendar-day') === String(now.getDate()) &&
      t.text('.calendar-month') !== '' &&
      t.text('.date-weekday') !== ''
  );
  check(
    'date tile is a section whose only control shows the month calendar',
    t.q('.date-panel').localName === 'section' &&
      t.qa('.face button[data-action]').every((b) => b.dataset.action === 'calendar-view')
  );
  check(
    'date tile is never disabled',
    !t.q('.date-panel[disabled]') && !t.text('.date-panel').includes('Unavailable')
  );

  t = await mount(variants.wide);
  check('size class is applied', !!t.q('.date-panel.size-wide'));

  t = await mount(variants.named);
  check(
    'a name is ignored, not rendered',
    !t.q('.date-panel b') && !t.text('.date-panel').includes('Today')
  );

  t = await mount(variants.strayEntity);
  check('a stray entity is ignored', t.qa('.date-panel').length === 1);
  check('date tile calls no service', t.calls.length === 0);
}
