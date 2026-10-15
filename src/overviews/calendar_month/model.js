// Pure month arithmetic for the month calendar: no DOM, no Intl, no clock. Days are plain numbers; `weekStart` is the
// weekday the week begins on (0 = Sunday ... 6 = Saturday).

export const WEEKDAY_NUMBER = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

/** The option (`auto` | a weekday name) and Home Assistant's profile setting -> 0..6. Unknown means Monday. */
export function weekStartOf(option, haFirstWeekday) {
  const name = option === 'auto' || option === undefined ? haFirstWeekday : option;
  return WEEKDAY_NUMBER[name] ?? 1;
}

const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1..12

/**
 * Six rows of seven cells for the month that contains `today`, starting on `weekStart`.
 * Cells outside the month are marked `out` (they show the neighbouring months' days, dimmed).
 * @param {{year:number, month:number, day:number}} today   month is 1..12
 * @param {number} weekStart
 * @returns {{day:number, out:boolean, today:boolean}[]}   42 cells
 */
export function monthCells({year, month, day}, weekStart) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lead = (firstWeekday - weekStart + 7) % 7;
  const length = daysIn(year, month);
  const previous = daysIn(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const n = i - lead + 1;
    if (n < 1) cells.push({day: previous + n, out: true, today: false});
    else if (n > length) cells.push({day: n - length, out: true, today: false});
    else cells.push({day: n, out: false, today: n === day});
  }
  return cells;
}

/** The seven weekday numbers in display order, e.g. [1,2,3,4,5,6,0] for a Monday start. */
export const weekdayOrder = (weekStart) => Array.from({length: 7}, (_, i) => (weekStart + i) % 7);
