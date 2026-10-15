// Pure data mapping: Home Assistant weather entity + forecasts -> the numbers and words the scene shows.
// No DOM, no Date.now, no Intl of its own: everything goes through the overview context.

/** All 15 states of a HA weather entity -> mdi line icon. */
export const ICONS = {
  sunny: 'weather-sunny',
  'clear-night': 'weather-night',
  partlycloudy: 'weather-partly-cloudy',
  cloudy: 'weather-cloudy',
  fog: 'weather-fog',
  hail: 'weather-hail',
  lightning: 'weather-lightning',
  'lightning-rainy': 'weather-lightning-rainy',
  pouring: 'weather-pouring',
  rainy: 'weather-rainy',
  snowy: 'weather-snowy',
  'snowy-rainy': 'weather-snowy-rainy',
  windy: 'weather-windy',
  'windy-variant': 'weather-windy-variant',
  exceptional: 'alert-circle-outline'
};
export const CONDITIONS = Object.keys(ICONS);

/** Conditions that count as "rain is coming" even when the forecast has no precipitation figure. */
const WET = new Set(['rainy', 'pouring', 'lightning-rainy', 'snowy-rainy']);

export const DETAIL_KEYS = [
  'sunset',
  'wind',
  'humidity',
  'rain',
  'pressure',
  'uv',
  'visibility',
  'dew_point',
  'feels_like',
  'cloud_coverage',
  'gust'
];
export const DEFAULT_DETAILS = ['sunset', 'wind', 'humidity', 'rain'];

/** Every mdi icon name the scene can ask for (the screenshot page draws a glyph for each of them). */
export const ICON_NAMES = [
  ...new Set([
    ...Object.values(ICONS),
    'weather-cloudy-alert',
    'weather-sunset-down',
    'weather-sunset-up',
    'water-percent',
    'gauge',
    'sun-wireframe',
    'eye-outline',
    'water-thermometer-outline',
    'thermometer',
    'cloud-outline'
  ])
];

// ---------- condition, label, day/night ----------

export const conditionOf = (ctx) => (ctx.ok ? ctx.state.state : null);

/** Localised label: HA's own translation first, then our strings, then the raw state made readable. */
export function conditionLabel(ctx, condition) {
  const fromHass = ctx.hass?.formatEntityState?.(ctx.state);
  if (fromHass) return fromHass;
  if (ICONS[condition]) return ctx.t(`weather_overview.condition.${condition}`);
  return condition.replaceAll('-', ' ').replaceAll('_', ' ');
}

/**
 * Day or night for the artwork: the `daylight` option, then the sun entity, then the weather state itself,
 * then a plain clock guess (06:00 to 19:59 in the display zone).
 */
export function isDaytime(ctx) {
  const {daylight, sun_entity} = ctx.options;
  if (daylight === 'day') return true;
  if (daylight === 'night') return false;
  const sun = ctx.stateOf(sun_entity)?.state;
  if (sun === 'above_horizon') return true;
  if (sun === 'below_horizon') return false;
  if (ctx.state?.state === 'clear-night') return false;
  if (ctx.state?.state === 'sunny') return true;
  const {hour} = ctx.localParts(ctx.now());
  return hour >= 6 && hour < 20;
}

// ---------- numbers ----------

/** Rounded number in the user's locale, or null. 21.6 -> '22', -0.4 -> '0'. */
export function whole(ctx, value) {
  if (!ctx.num(value)) return null;
  return ctx.formatNumber(Math.round(value) || 0);
}

/** '12°' (or '12°C' when show_unit is on). */
export function degrees(ctx, value) {
  const text = whole(ctx, value);
  if (text === null) return null;
  const unit = ctx.options.show_unit ? ctx.attrs.temperature_unit || ctx.unit() : '';
  return `${text}°${unit.replace(/^°/, '')}`;
}

// ---------- forecasts ----------

const when = (item) => Date.parse(item?.datetime);
const valid = (list) =>
  Array.isArray(list) ? list.filter((item) => Number.isFinite(when(item))) : [];
const isWet = (item) => item.precipitation > 0 || WET.has(item.condition);

/** Today's high and low: daily forecast first, hourly extremes as a fallback. {high, low} (numbers or null). */
export function todayRange(ctx) {
  const today = (item) => ctx.dayOffset(when(item)) === 0;
  const day = valid(ctx.data.daily).find(today);
  let high = ctx.num(day?.temperature) ? day.temperature : null;
  let low = ctx.num(day?.templow) ? day.templow : null;
  if (high === null || low === null) {
    const temps = valid(ctx.data.hourly)
      .filter(today)
      .map((item) => item.temperature)
      .filter(ctx.num);
    if (temps.length) {
      high ??= Math.max(...temps);
      low ??= Math.min(...temps);
    }
  }
  return {high, low};
}

/**
 * When does precipitation next start? -> {kind, n}
 *   kind: 'now' | 'minutes' | 'hours' | 'days' | 'today' | 'none' | 'unknown'
 * Hourly data answers first (it is precise); days the hourly list does not reach come from the daily list.
 * With daily data only, the answer is a whole day: 'today' or 'In Nd'.
 */
export function nextRain(ctx) {
  const now = ctx.now();
  const hourly = valid(ctx.data.hourly);
  const daily = valid(ctx.data.daily);
  if (WET.has(ctx.state?.state)) return {kind: 'now', n: 0};
  if (!hourly.length && !daily.length) return {kind: 'unknown', n: 0};

  const HOUR = 3600e3;
  for (let i = 0; i < hourly.length; i++) {
    const start = when(hourly[i]);
    const end = i + 1 < hourly.length ? when(hourly[i + 1]) : start + HOUR;
    if (end <= now || !isWet(hourly[i])) continue;
    if (start <= now) return {kind: 'now', n: 0};
    const minutes = Math.max(1, Math.round((start - now) / 60e3));
    if (minutes < 60) return {kind: 'minutes', n: minutes};
    const hours = Math.round(minutes / 60);
    return hours >= 24 ? {kind: 'days', n: Math.floor(hours / 24)} : {kind: 'hours', n: hours};
  }

  // Daily data answers only for days the hourly list did not already cover. The day the hourly list ends in
  // counts as covered only when the list reaches late evening (22:00+).
  const last = hourly.length ? when(hourly.at(-1)) : null;
  const from = last === null ? 0 : ctx.dayOffset(last) + (ctx.localParts(last).hour >= 22 ? 1 : 0);
  for (const item of daily) {
    const offset = ctx.dayOffset(when(item));
    if (offset < Math.max(0, from) || !isWet(item)) continue;
    return offset === 0 ? {kind: 'today', n: 0} : {kind: 'days', n: offset};
  }
  return {kind: 'none', n: 0};
}

const RAIN_KEYS = {
  now: 'weather_overview.rain.now',
  minutes: 'weather_overview.rain.in_minutes',
  hours: 'weather_overview.rain.in_hours',
  days: 'weather_overview.rain.in_days',
  today: 'weather_overview.rain.today',
  none: 'weather_overview.rain.none'
};

const rainText = (ctx, {kind, n}) => (RAIN_KEYS[kind] ? ctx.t(RAIN_KEYS[kind], {n}) : null);

// ---------- the bottom row ----------

const withUnit = (ctx, value, unit, digits = 0) => {
  if (!ctx.num(value)) return null;
  const text = ctx.formatNumber(value, {maximumFractionDigits: digits});
  return unit ? `${text} ${unit}` : text;
};

const percent = (ctx, value) => (ctx.num(value) ? `${ctx.formatNumber(value)}%` : null);

/** Next sun event: 'Sunset' by day, 'Sunrise' once the sun is down. */
function sunDetail(ctx) {
  const sun = ctx.stateOf(ctx.options.sun_entity);
  if (!sun) return null;
  const down = sun.state === 'below_horizon';
  const at = Date.parse(sun.attributes?.[down ? 'next_rising' : 'next_setting']);
  if (!Number.isFinite(at)) return null;
  return {
    key: 'sunset',
    icon: down ? 'weather-sunset-up' : 'weather-sunset-down',
    label: ctx.t(down ? 'weather_overview.detail.sunrise' : 'weather_overview.detail.sunset'),
    value: ctx.timeParts(at).text
  };
}

const DETAILS = {
  sunset: sunDetail,
  wind: (ctx) => ({
    icon: 'weather-windy',
    value: withUnit(ctx, ctx.attrs.wind_speed, ctx.attrs.wind_speed_unit)
  }),
  humidity: (ctx) => ({icon: 'water-percent', value: percent(ctx, ctx.attrs.humidity)}),
  rain: (ctx) => ({
    icon: 'weather-pouring',
    value: rainText(ctx, nextRain(ctx)),
    label: ctx.t('weather_overview.detail.rain')
  }),
  pressure: (ctx) => ({
    icon: 'gauge',
    value: withUnit(ctx, ctx.attrs.pressure, ctx.attrs.pressure_unit)
  }),
  uv: (ctx) => ({icon: 'sun-wireframe', value: withUnit(ctx, ctx.attrs.uv_index, '', 1)}),
  visibility: (ctx) => ({
    icon: 'eye-outline',
    value: withUnit(ctx, ctx.attrs.visibility, ctx.attrs.visibility_unit)
  }),
  dew_point: (ctx) => ({
    icon: 'water-thermometer-outline',
    value: degrees(ctx, ctx.attrs.dew_point)
  }),
  feels_like: (ctx) => ({
    icon: 'thermometer',
    value: degrees(ctx, ctx.attrs.apparent_temperature)
  }),
  cloud_coverage: (ctx) => ({
    icon: 'cloud-outline',
    value: percent(ctx, ctx.attrs.cloud_coverage)
  }),
  gust: (ctx) => ({
    icon: 'weather-windy-variant',
    value: withUnit(ctx, ctx.attrs.wind_gust_speed, ctx.attrs.wind_speed_unit)
  })
};

/** Configured details in order; a detail without data is left out rather than shown as a blank. */
export function detailsOf(ctx) {
  const rows = [];
  for (const key of ctx.options.details) {
    const row = DETAILS[key]?.(ctx);
    if (!row || row.value == null || row.value === '') continue;
    rows.push({key, ...row, label: row.label ?? ctx.t(`weather_overview.detail.${key}`)});
  }
  return rows;
}

// ---------- the whole view model ----------

/** Everything the scene needs, as plain values (already localised, not yet escaped). */
export function viewOf(ctx) {
  const condition = conditionOf(ctx);
  const day = isDaytime(ctx);
  const {high, low} = ctx.ok ? todayRange(ctx) : {high: null, low: null};
  const hl = [high !== null && `H:${degrees(ctx, high)}`, low !== null && `L:${degrees(ctx, low)}`]
    .filter(Boolean)
    .join(' ');
  const time = ctx.options.show_time ? ctx.timeParts(ctx.now()) : null;
  return {
    ok: ctx.ok,
    condition,
    known: !!ICONS[condition],
    day,
    label: ctx.ok ? conditionLabel(ctx, condition) : ctx.t('weather_overview.unavailable'),
    icon: ICONS[condition] || (ctx.ok ? 'weather-cloudy' : 'weather-cloudy-alert'),
    temperature: ctx.ok ? (degrees(ctx, ctx.attrs.temperature) ?? '—°') : null,
    hl,
    time,
    details: ctx.ok ? detailsOf(ctx) : []
  };
}
