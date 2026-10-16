import {dateTimeFormatter} from '../../core/intl.js';

// The analogue dial: markup and the hand/label update. Used by the clock widget (and refreshed through the
// controller's role `clock`).
// Pure functions with no DOM access at import time, so they load in plain Node.

const HOURS = 12;

/** Angle of the hour hand in degrees: 30 per hour plus half a degree per minute. */
export const hourAngle = (date) => (date.getHours() % 12) * 30 + date.getMinutes() / 2;

/** Angle of the minute hand in degrees: 6 per minute. */
export const minuteAngle = (date) => date.getMinutes() * 6;

/** The 12 hour ticks of the dial (`--tick` is the multiplier of 30 degrees used by the CSS). */
export function dialTicks() {
  return Array.from({length: HOURS}, (_, n) => `<i style="--tick:${n}"></i>`).join('');
}

/**
 * The 12 numerals of the "soft" surface (hidden by CSS on the other surfaces). Each numeral is rotated into place
 * by `--angle` and counter-rotated inside so the digits stay upright.
 */
export function dialNumbers() {
  return Array.from(
    {length: HOURS},
    (_, n) =>
      `<span class="clock-number" style="--angle:${n * 30}deg"><span>${n || 12}</span></span>`
  ).join('');
}

/** The hands and the centre pin. */
export const DIAL_HANDS = '<b class="hand hour"></b><b class="hand minute"></b><b class="pin"></b>';

const TIME_OPTIONS = {hour: 'numeric', minute: '2-digit'};
const DATE_OPTIONS = {weekday: 'long', day: 'numeric', month: 'long'};

/** The label screen readers get, e.g. "10:10". `language` undefined = the browser locale (the default). */
export function timeLabel(date, language) {
  return dateTimeFormatter(language, TIME_OPTIONS).format(date);
}

/** The caption under the dial, e.g. "Thursday 15 October". */
export function dateLabel(date, language) {
  return dateTimeFormatter(language, DATE_OPTIONS).format(date);
}

/** The labels of the last minute asked for: every clock widget on the page shares them. */
let lastLabels = null;

function labelsFor(date, language) {
  const key = `${language ?? ''}|${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;
  if (lastLabels?.key !== key) {
    lastLabels = {
      key,
      time: timeLabel(date, language),
      date: dateLabel(date, language),
      hour: `rotate(${hourAngle(date)}deg)`,
      minute: `rotate(${minuteAngle(date)}deg)`
    };
  }
  return lastLabels;
}

/**
 * Point the hands of one `.clock` element at `date`, update its aria-label and its `.clock-date` caption (when it has
 * one). Safe on null and on a half-built element: hooks must not throw.
 *
 * Called every second, so it writes only what differs: a second that changes nothing costs no style recalculation
 * and no layout (the hands and the label move once a minute).
 * @param {Element|null|undefined} clock
 * @param {Date} date
 * @param {string|undefined} language  hass.locale.language
 */
export function updateDial(clock, date, language) {
  if (!clock) return;
  const labels = labelsFor(date, language);
  const hour = clock.querySelector('.hour');
  const minute = clock.querySelector('.minute');
  if (hour && hour.style.transform !== labels.hour) hour.style.transform = labels.hour;
  if (minute && minute.style.transform !== labels.minute) minute.style.transform = labels.minute;
  if (clock.getAttribute('aria-label') !== labels.time)
    clock.setAttribute('aria-label', labels.time);
  const caption = clock.querySelector('.clock-date');
  if (caption && caption.textContent !== labels.date) caption.textContent = labels.date;
}
