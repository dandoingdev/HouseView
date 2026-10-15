// "Press a clock, date or calendar widget to see the month calendar": the transparent full-tile key those tiles carry.
// Off when the card says `calendar_view: false`. Shared by the clock, date and calendar widgets (docs/widget-api.md).
export function calendarTap(ctx) {
  if (ctx.config?.calendar_view === false) return '';
  const label = ctx.esc(ctx.t('calendar_view.open'));
  return ctx.btn('calendar-view', '', 'tile-tap', true, {
    entity: '',
    attrs: `aria-label="${label}" `
  });
}
