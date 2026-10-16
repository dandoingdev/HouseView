import {dateTimeFormatter} from '../../core/intl.js';
import {isColour, colourRgb} from '../../core/colour.js';
export const isClockColour = isColour;
export const inheritsBackground = (options) =>
  options.use_dashboard_background ?? !options.background_color;
export const clockFormData = (config) => ({use_dashboard_background: inheritsBackground(config)});

/** Colours are validated before being used in CSS. */
export function clockPalette(value, face) {
  const rgb = colourRgb(value) || [129, 124, 112];
  const linear = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const ink = luminance > 0.179 ? '#050706' : '#f7faf8';
  const hand =
    face === 'sculpted'
      ? luminance > 0.179
        ? `rgb(${rgb.map((c) => Math.round(c * 0.45)).join(',')})`
        : '#f7faf8'
      : luminance > 0.7
        ? '#27312c'
        : '#ffffff';
  return {background: '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join(''), ink, hand};
}

export function handAngles(parts, seconds) {
  return {
    hour: (parts.hour % 12) * 30 + parts.minute / 2 + seconds / 120,
    minute: parts.minute * 6 + seconds / 10,
    second: seconds * 6
  };
}

export function clockDate(ctx, parts) {
  return dateTimeFormatter(ctx.lang(), {weekday: 'short', day: 'numeric', timeZone: 'UTC'})
    .format(Date.UTC(parts.year, parts.month - 1, parts.day))
    .toLocaleUpperCase(ctx.lang());
}

/** Digital faces share HA's time format and display zone, with localised, zero-padded digits. */
export function digitalTime(ctx, now, parts = ctx.localParts(now)) {
  const {period} = ctx.timeParts(now);
  const digits = (n) =>
    ctx.formatNumber(n, {
      minimumIntegerDigits: 2,
      maximumFractionDigits: 0,
      useGrouping: false
    });
  const hour = digits(period ? parts.hour % 12 || 12 : parts.hour);
  const minute = digits(parts.minute);
  const second = digits(new Date(now).getUTCSeconds());
  return {
    hour,
    minute,
    second,
    period,
    text: `${hour}:${minute}${ctx.options.show_seconds ? `:${second}` : ''}${period ? ` ${period}` : ''}`
  };
}

export const isDigital = (face) => face === 'digital' || face === 'digital_stacked';
