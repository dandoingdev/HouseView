import {dateFormat, hourOptions} from './format.js';

export const DASHBOARD_HEADER_HEIGHT = 44;

/** The same locale and time-zone preferences as Home Assistant, with no seconds. */
export function headerLabels(hass, now) {
  const preference = hass?.locale?.time_format;
  return {
    date: dateFormat(hass, {weekday: 'short', month: 'short', day: 'numeric'}).format(now),
    time: dateFormat(
      hass,
      {hour: 'numeric', minute: '2-digit', ...hourOptions(preference)},
      {
        browserLocale: preference === 'system'
      }
    ).format(now)
  };
}
