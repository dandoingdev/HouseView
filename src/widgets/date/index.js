import {defineWidget} from '../../core/define-widget.js';
import {calendarTap} from '../_shared/calendar-tap.js';
import {dateFormat} from '../../core/format.js';

// Date tile (flat "Wed Apr / 1" face): short weekday and month on one line above a very large day number. It has no entity and is always available.
// The tile is rendered once per card render; it is not ticked (the original tile was not either), so it moves on
// to the next day with the next render.
//
// 4.x keeps the browser's own locale and time zone, exactly like the original tile (`browserLocale`). Switching to
// hass.locale.language belongs to the Home Assistant tranche (docs/architecture.md).
const month = {month: 'short'};
const weekday = {weekday: 'short'};

export default defineWidget({
  type: 'date',
  label: 'Date',
  order: 30,
  entity: 'none',
  availability: 'always',
  // The tile shows no name, so the editor does not offer the field.
  editor: {name: false},

  // Reads the clock on purpose: the single render exception allowed for date-like widgets (docs/widget-api.md).
  render(ctx) {
    const now = new Date();
    const format = (options) =>
      ctx.esc(dateFormat(ctx.hass, options, {browserLocale: true}).format(now));
    return ctx.root(
      'section',
      'date-panel',
      `<span class="date-heading"><strong class="date-weekday">${format(weekday)}</strong> ` +
        `<span class="calendar-month">${format(month)}</span></span>` +
        `<span class="calendar-day">${now.getDate()}</span>` +
        calendarTap(ctx)
    );
  }
});
