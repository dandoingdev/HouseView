// Variants for tests, previews and screenshots. Data only, imports nothing (the browser harness loads this file
// unbundled). Fixed clock: 2026-10-15 10:09 Europe/London (BST, +01:00).
//
//   options    flat overview options (entity first), as in a screensaver block or an overview card
//   states     the hass.states the scene reads
//   forecasts  what the forecast subscriptions deliver: {daily, hourly} (null = no such forecast)
//   config     card config keys (preview_time freezes ctx.now)
//   hass       hass.locale / hass.config overrides; time_zone 'server' + config.time_zone makes Node tests give
//              the same answers in every time zone of the machine they run on
export const NOW = '2026-10-15T10:09:00+01:00';
const entity = 'weather.test';

const hours = (count, wet = () => false, from = '2026-10-15T10:00:00+01:00') =>
  Array.from({length: count}, (_, i) => {
    const datetime = new Date(Date.parse(from) + i * 3600e3).toISOString();
    return {
      datetime,
      temperature: 12 + (i % 5),
      precipitation: wet(i) ? 1.2 : 0,
      condition: wet(i) ? 'rainy' : 'cloudy'
    };
  });

const days = (wetDays = [], from = 15) =>
  Array.from({length: 6}, (_, i) => ({
    datetime: `2026-10-${from + i}T00:00:00+01:00`,
    temperature: 14 - i,
    templow: 9 - i,
    precipitation: wetDays.includes(i) ? 3.1 : 0,
    condition: wetDays.includes(i) ? 'rainy' : 'cloudy'
  }));

const sun = (state = 'above_horizon') => ({
  'sun.sun': {
    state,
    attributes: {
      next_setting: '2026-10-15T18:32:00+00:00',
      next_rising: '2026-10-16T06:21:00+00:00'
    }
  }
});

const weather = (condition, attributes = {}) => ({
  [entity]: {
    state: condition,
    attributes: {
      friendly_name: 'Home',
      temperature: 12,
      temperature_unit: '°C',
      humidity: 76,
      wind_speed: 7.4,
      wind_speed_unit: 'mph',
      pressure: 1012,
      pressure_unit: 'hPa',
      supported_features: 3,
      ...attributes
    }
  }
});

/** @type {(condition: string, extra?: Object) => {options:Object, states:Object, forecasts:Object, config:Object, hass:Object}} */
const make = (condition, {sunState, attributes, forecasts, options = {}, hass} = {}) => ({
  options: {entity, ...options},
  states: {...weather(condition, attributes), ...(sunState === null ? {} : sun(sunState))},
  forecasts: forecasts ?? {daily: days([1]), hourly: hours(24)},
  config: {preview_time: NOW},
  hass: {
    locale: {language: 'en-GB', time_format: '24', time_zone: 'server', ...hass?.locale},
    config: {time_zone: 'Europe/London', unit_system: {temperature: '°C'}, ...hass?.config}
  }
});

/** The 15 states of a HA weather entity, each at its natural time of day. */
export const CONDITION_VARIANTS = Object.fromEntries(
  [
    'sunny',
    'clear-night',
    'partlycloudy',
    'cloudy',
    'fog',
    'hail',
    'lightning',
    'lightning-rainy',
    'pouring',
    'rainy',
    'snowy',
    'snowy-rainy',
    'windy',
    'windy-variant',
    'exceptional'
  ].map((c) => [c, make(c, {sunState: c === 'clear-night' ? 'below_horizon' : 'above_horizon'})])
);

/** The same 15 conditions after dark (sun below the horizon): the night artwork of every group. */
export const NIGHT_VARIANTS = Object.fromEntries(
  Object.keys(CONDITION_VARIANTS).map((c) => [`${c}@night`, make(c, {sunState: 'below_horizon'})])
);

export const variants = {
  ...CONDITION_VARIANTS,

  // the reference look: Partly Cloudy, 12 degrees, H14 L9, sunset 19:32, 7 mph, 76 %, rain in 1 d
  ok: make('partlycloudy'),
  night: make('partlycloudy', {sunState: 'below_horizon'}),

  // the compact tile (card option display: tile): condition and range on a flat slate face, tap opens the scene
  tile: make('partlycloudy', {options: {display: 'tile'}}),

  // next-rain wording
  rainNow: make('rainy'),
  rainSoon: make('cloudy', {forecasts: {daily: days([0]), hourly: hours(24, (i) => i >= 3)}}),
  rainTomorrow: make('cloudy'),
  rainNever: make('cloudy', {forecasts: {daily: days(), hourly: hours(24)}}),
  dailyOnly: make('cloudy', {forecasts: {daily: days([2]), hourly: null}}),
  hourlyOnly: make('cloudy', {forecasts: {daily: null, hourly: hours(24)}}),
  noForecast: make('cloudy', {forecasts: {daily: null, hourly: null}}),
  highOnly: make('cloudy', {
    forecasts: {daily: [{datetime: '2026-10-15T00:00:00+01:00', temperature: 15}], hourly: null}
  }),

  // details, units, clocks, locales
  customDetails: make('sunny', {
    options: {
      details: ['pressure', 'feels_like', 'cloud_coverage', 'uv', 'visibility', 'dew_point']
    },
    attributes: {
      apparent_temperature: 10,
      cloud_coverage: 40,
      uv_index: 3.4,
      visibility: 14,
      visibility_unit: 'km',
      dew_point: 7
    }
  }),
  twelveHour: make('sunny', {hass: {locale: {language: 'en-US', time_format: '12'}}}),
  fahrenheit: make('sunny', {
    attributes: {temperature: 54, temperature_unit: '°F', wind_speed_unit: 'mph'},
    options: {show_unit: true},
    hass: {config: {unit_system: {temperature: '°F'}}}
  }),
  celsiusUnit: make('partlycloudy', {options: {show_unit: true}}),
  negative: make('snowy', {attributes: {temperature: -3.4}}),
  hundreds: make('sunny', {attributes: {temperature: 104}}),
  noSun: make('sunny', {sunState: null}),
  noTime: make('partlycloudy', {options: {show_time: false}}),
  solid: make('partlycloudy', {options: {frosted: false}}),
  longLocale: make('lightning-rainy', {
    attributes: {
      wind_speed: 23.4,
      wind_speed_unit: 'Kilometer pro Stunde',
      humidity: 100,
      pressure: 1008.4,
      pressure_unit: 'hPa'
    },
    options: {details: ['sunset', 'wind', 'humidity', 'rain']},
    forecasts: {daily: days([0]), hourly: hours(24, (i) => i >= 1)},
    hass: {locale: {language: 'de-DE', time_format: '24'}}
  }),
  newCondition: make('tornado-warning'),

  // hostile and degenerate data
  evilName: make('sunny', {attributes: {friendly_name: '<img src=x onerror=alert(1)>'}}),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {
    options: {entity},
    states: {},
    forecasts: {},
    config: {preview_time: NOW},
    hass: {locale: {language: 'en-GB', time_zone: 'server'}, config: {time_zone: 'Europe/London'}}
  }
};
