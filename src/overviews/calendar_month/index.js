import {dateTimeFormatter} from '../../core/intl.js';
import {defineOverview} from '../../core/define-overview.js';
import {setText} from '../_shared/dom.js';
import strings from './strings.js';
import {monthCells, weekdayOrder, weekStartOf} from './model.js';

/** A calendar date formatted in the user's language without any time zone shift (the fields are already local). */
const format = (ctx, options, y, m, d) =>
  dateTimeFormatter(ctx.lang(), {...options, timeZone: 'UTC'}).format(Date.UTC(y, m - 1, d));

/** "M T W T F S S" in the user's language, in the order the week starts. */
const weekdayInitials = (ctx, weekStart) =>
  weekdayOrder(weekStart).map(
    (weekday) =>
      format(ctx, {weekday: 'narrow'}, 2024, 1, 7 + weekday) /* 7 Jan 2024 was a Sunday */
  );

function sceneHTML(ctx, mode) {
  const today = ctx.localParts(ctx.now());
  const weekStart = weekStartOf(ctx.options.week_start, ctx.hass?.locale?.first_weekday);
  const cells = monthCells(today, weekStart);
  const title = format(ctx, {month: 'long', year: 'numeric'}, today.year, today.month, 1);
  const fullDate = format(
    ctx,
    {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'},
    today.year,
    today.month,
    today.day
  );
  const time =
    mode === 'screensaver' && ctx.options.show_time
      ? `<span class="ov-cm-time" data-ov="cm-time">${ctx.esc(ctx.timeParts(ctx.now()).text)}</span>`
      : '';
  const days = weekdayInitials(ctx, weekStart)
    .map((d) => `<span>${ctx.esc(d)}</span>`)
    .join('');
  const grid = cells
    .map(
      (c) =>
        `<span class="ov-cm-d${c.out ? ' ov-cm-out' : ''}${c.today ? ' ov-cm-today' : ''}">${c.day}</span>`
    )
    .join('');
  return (
    `<div class="ov-scene ov-calendar_month-scene" data-mode="${mode}" data-day="${today.day}">` +
    `<div class="ov-cm-frame" role="group" aria-label="${ctx.esc(fullDate)}">` +
    `<header class="ov-cm-head"><span class="ov-cm-month">${ctx.esc(title)}</span>${time}</header>` +
    `<div class="ov-cm-days" aria-hidden="true">${days}</div>` +
    `<div class="ov-cm-grid" aria-hidden="true">${grid}</div>` +
    `<div class="ov-cm-big" data-len="${String(today.day).length}" aria-hidden="true">${today.day}</div>` +
    `</div></div>`
  );
}

/**
 * Centre the ink of the big day number in the face. The box of a text is not its ink: "1" has a wide left bearing and
 * every font puts digits a little high or low in the line. Measure the real glyph extents once per day and size and
 * move the element by the difference. Cheap (one canvas measure), idempotent, and silent when canvas is not available.
 */
function centreBig(ctx) {
  const big = ctx.el?.querySelector('.ov-cm-big');
  if (!big || !big.isConnected) return;
  const style = getComputedStyle(big);
  const key = `${big.textContent}|${style.fontSize}|${style.fontFamily}|${style.fontWeight}`;
  if (ctx.store.get('big') === key) return;
  const size = parseFloat(style.fontSize);
  if (!(size > 0)) return;
  try {
    const canvas = ctx.store.get('canvas') ?? document.createElement('canvas').getContext('2d');
    ctx.store.set('canvas', canvas);
    canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const m = canvas.measureText(big.textContent);
    const inkCentreX = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
    const dx = m.width / 2 - inkCentreX;
    const inkCentreUp = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    const boxCentreUp = (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
    const dy = inkCentreUp - boxCentreUp;
    if (![dx, dy].every(Number.isFinite)) return;
    big.style.setProperty('--cm-dx', `${(dx / size).toFixed(4)}em`);
    big.style.setProperty('--cm-dy', `${(dy / size).toFixed(4)}em`);
    ctx.store.set('big', key);
  } catch {
    // no canvas: the number stays where the font puts it
  }
}

export default defineOverview({
  type: 'calendar_month',
  label: 'Month calendar',
  order: 50,
  selectable: false,
  entity: 'none',
  domains: [],
  strings,

  options: {
    week_start: {
      type: 'enum',
      values: ['auto', 'monday', 'sunday', 'saturday'],
      default: 'auto',
      error: 'Month calendar week_start must be auto, monday, sunday or saturday.'
    },
    show_time: {type: 'boolean', default: true}
  },

  render: (ctx) => sceneHTML(ctx, ctx.mode),

  afterRender: (ctx) => centreBig(ctx),

  // The time changes with the minute; a new day redraws the whole month.
  tick: {
    every: 60000,
    align: 'minute',
    run(ctx) {
      centreBig(ctx);
      const day = ctx.localParts(ctx.now()).day;
      if (ctx.store.get('day') !== undefined && ctx.store.get('day') !== day) {
        ctx.store.set('day', day);
        return ctx.requestRender();
      }
      ctx.store.set('day', day);
      if (ctx.mode === 'screensaver' && ctx.options.show_time) {
        setText(ctx.el, '[data-ov="cm-time"]', ctx.timeParts(ctx.now()).text);
      }
    }
  },

  // In card mode the card is the calendar itself: nothing to open.
  tap: {card: 'none'}
});
