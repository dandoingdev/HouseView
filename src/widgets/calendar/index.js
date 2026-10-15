// Calendar tile: the flat date face (weekday, month, big day number), plus the next event of a `calendar.*` entity.
// Ported from the calendar branch of renderWidget before; markup is byte-compatible, the tile has no actions
// of its own: a tap shows the month calendar (`calendar-view`), or more-info when the card says `calendar_view: false`.
import {defineWidget} from '../../core/define-widget.js';
import {dateFormat} from '../../core/format.js';

const MONTH = {month: 'short'};
const WEEKDAY = {weekday: 'short'};
const EVENT_DAY = {weekday: 'short', day: 'numeric', month: 'short'};
const EVENT_TIME = {hour: 'numeric', minute: '2-digit'};

/**
 * "Thu, 15 Oct, 10:00" for the next event, or the "connect a calendar" hint when the entity has no usable
 * start_time. HA's calendar entity exposes `start_time` as a local "YYYY-MM-DD HH:MM:SS" string (a date only for
 * all-day events); `all_day` drops the clock time.
 */
function whenText(ctx, attrs) {
  const start = attrs.start_time ? new Date(attrs.start_time) : null;
  if (!start || Number.isNaN(start.valueOf())) return ctx.t('calendar.connect');
  const options = attrs.all_day ? EVENT_DAY : {...EVENT_DAY, ...EVENT_TIME};
  return dateFormat(ctx.hass, options).format(start);
}

export default defineWidget({
  type: 'calendar',
  label: 'Calendar',
  order: 140,
  // Layout presets treat the calendar like the date widget.
  layoutRoles: ['date'],

  // Reads the clock on purpose (date-like widgets are the one render exception, docs/widget-api.md).
  // The month stays in the browser's locale like the date widget; only the event time follows hass.locale.language.
  render(ctx) {
    const today = new Date(ctx.now());
    const title = ctx.ok
      ? ctx.attrs.message || ctx.t('calendar.no_event')
      : ctx.t('calendar.unavailable');
    const month = dateFormat(ctx.hass, MONTH, {browserLocale: true}).format(today);
    const weekday = dateFormat(ctx.hass, WEEKDAY, {browserLocale: true}).format(today);
    return ctx.tile(
      ctx.config?.calendar_view === false ? 'info' : 'calendar-view',
      `<span class="date-heading"><strong class="date-weekday">${ctx.esc(weekday)}</strong> ` +
        `<span class="calendar-month">${ctx.esc(month)}</span></span>` +
        `<span class="calendar-day">${today.getDate()}</span>` +
        `<span class="calendar-event">${ctx.esc(title)}</span>` +
        `<small>${ctx.esc(whenText(ctx, ctx.attrs))}</small>`,
      'calendar-content'
    );
  }
});
