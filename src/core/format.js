import {dateTimeFormatter, numberFormatter} from './intl.js';

// Locale-aware number, date and time formatters (docs/architecture.md).
//
// The defaults: numbers use hass.locale.language, dates use whatever the
// caller asks for (`browserLocale` keeps the browser's own locale, which the clock and date widgets use).
// The one new behaviour is the time zone: a user whose Home Assistant profile says "server time zone" sees
// the server's zone; everyone else keeps the browser's.

/** `hass.locale.time_zone` is 'local' (browser) or 'server'. Returns an IANA zone or undefined. */
export function timeZoneOf(hass) {
  return hass?.locale?.time_zone === 'server' ? hass?.config?.time_zone || undefined : undefined;
}

/** The temperature unit Home Assistant is configured for. */
export function temperatureUnit(hass) {
  return hass?.config?.unit_system?.temperature || '°C';
}

/** A number formatter in the user's language. */
export function numberFormat(hass, options = {}) {
  return numberFormatter(hass?.locale?.language || undefined, options);
}

/**
 * A date/time formatter.
 * @param {any} hass
 * @param {Intl.DateTimeFormatOptions} options
 * @param {{browserLocale?: boolean}} [opts]   true = ignore hass.locale.language (the date widget)
 */
export function dateFormat(hass, options = {}, {browserLocale = false} = {}) {
  const language = browserLocale ? undefined : hass?.locale?.language || undefined;
  const timeZone = timeZoneOf(hass);
  return dateTimeFormatter(language, timeZone ? {...options, timeZone} : options);
}

/** 12:34 in the user's language and zone (no seconds). */
export function formatTime(hass, date) {
  return dateFormat(hass, {hour: 'numeric', minute: '2-digit'}).format(date);
}

/** Format a number with at most `digits` decimals in the user's language. */
export function formatNumber(hass, value, digits = 1) {
  return numberFormat(hass, {maximumFractionDigits: digits}).format(value);
}

/** Intl options for Home Assistant's explicit 12/24-hour preferences. */
export function hourOptions(timeFormat) {
  if (timeFormat === '24') return {hour: '2-digit', hourCycle: 'h23'};
  if (timeFormat === '12') return {hour12: true};
  return {};
}
