// The plants view: a full-screen page for the plants of one Plants widget, opened by holding that tile. A close key
// top left, the title and a care summary, then a card per plant: a large humidity ring, the temperature with a
// comfort bar, a humidity bar with the care range, the battery and when the plant last reported. Pressing a card
// opens the more-info of its humidity sensor. The list scrolls when the plants do not fit.
//
// It reads the plants from the widget on the dashboard (`config.widgets`, like the home summary), so there is
// nothing to configure twice. It is a control panel (live keys in the layer) that never calls a service.
// Reference: docs/overview-api.md
import {defineOverview} from '../../core/define-overview.js';
import {
  needsCare,
  percentOf,
  plantEntities,
  readPlant,
  TEMPERATURE_SCALE
} from '../../core/plants.js';
import {panelKey} from '../_shared/control-panel.js';
import strings from './strings.js';

const RANGE_KEYS = ['humidity_low', 'humidity_high', 'temperature_low', 'temperature_high'];

const STATUS_ICONS = {
  ok: 'mdi:sprout',
  dry: 'mdi:water-alert-outline',
  wet: 'mdi:water-check-outline',
  cold: 'mdi:snowflake-alert',
  hot: 'mdi:thermometer-alert',
  offline: 'mdi:leaf-off'
};

/** The Plants widget this view was opened from: the one whose first sensor is the view's entity, else the first. */
function widgetOf(ctx) {
  const widgets = (ctx.config?.widgets || []).filter((w) => w?.type === 'plants');
  return widgets.find((w) => w.entity === ctx.options.entity) || widgets[0];
}

/** "just now", "5 min ago", "3 h ago", "2 d ago" for a timestamp, or '' when unknown. */
function agoText(ctx, timestamp) {
  const then = Date.parse(timestamp);
  if (!Number.isFinite(then)) return '';
  const minutes = Math.max(0, Math.floor((ctx.now() - then) / 60000));
  if (minutes < 1) return ctx.t('plants_overview.just_now');
  if (minutes < 60) return ctx.t('plants_overview.minutes_ago', {n: minutes});
  if (minutes < 1440) return ctx.t('plants_overview.hours_ago', {n: Math.floor(minutes / 60)});
  return ctx.t('plants_overview.days_ago', {n: Math.floor(minutes / 1440)});
}

/** An icon carrying an ov-* class, so the CSS can address it. */
const icon = (ctx, name, cls) => ctx.icon(name).replace('<ha-icon', `<ha-icon class="${cls}"`);

const number = (ctx, value) => ctx.formatNumber(value, {maximumFractionDigits: 1});

/** A track with the care band shaded and a marker at the value. Percent positions only: no units in the markup. */
function barHTML(cls, {value, low, high}) {
  const marker = value === null ? '' : `<i class="ov-plants-marker" style="left:${value}%"></i>`;
  return (
    `<span class="ov-plants-bar ${cls}"><b class="ov-plants-band" style="left:${low}%;width:${Math.max(0, high - low)}%"></b>` +
    `${marker}</span>`
  );
}

function cardHTML(ctx, plant, range) {
  const reading = readPlant(plant, range, (id) => ctx.stateOf(id));
  const {humidity, temperature, battery, status} = reading;
  const percent = humidity === null ? 0 : Math.round(percentOf(humidity, 0, 100));
  const celsius =
    temperature === null
      ? null
      : reading.unit === '°F'
        ? ((temperature - 32) * 5) / 9
        : temperature;
  const {min, max} = TEMPERATURE_SCALE;
  const humidityText = humidity === null ? '—' : ctx.formatNumber(Math.round(humidity));
  const temperatureText =
    temperature === null ? '—' : `${number(ctx, temperature)}${reading.unit.replace(/^°?/, '°')}`;
  const ago = agoText(ctx, reading.updated);
  const statusText = ctx.t(`plants_overview.status.${status}`);
  const label = ctx.t('plants_overview.card_label', {
    name: plant.name,
    status: statusText,
    humidity: humidityText,
    temperature: temperatureText
  });
  const batteryText =
    battery === null
      ? ''
      : `<span class="ov-plants-foot-item" data-low="${battery <= 20}">${icon(ctx, battery <= 20 ? 'mdi:battery-alert-variant-outline' : 'mdi:battery-outline', 'ov-plants-ico')}${ctx.esc(ctx.formatNumber(Math.round(battery)))}%</span>`;
  const agoMarkup = ago
    ? `<span class="ov-plants-foot-item">${icon(ctx, 'mdi:clock-outline', 'ov-plants-ico')}${ctx.esc(ago)}</span>`
    : '';
  return (
    `<button type="button" class="ov-plants-card" data-action="info" data-entity="${ctx.esc(plant.humidity)}" data-state="${status}" aria-label="${ctx.esc(label)}">` +
    `<span class="ov-plants-top"><span class="ov-plants-badge">${icon(ctx, plant.icon || STATUS_ICONS[status], 'ov-plants-ico')}</span>` +
    `<span class="ov-plants-name">${ctx.esc(plant.name)}</span>` +
    `<span class="ov-plants-pill">${ctx.esc(statusText)}</span></span>` +
    `<span class="ov-plants-main">` +
    `<span class="ov-plants-ring" style="--p:${percent}"><span class="ov-plants-value">${ctx.esc(humidityText)}<span class="ov-plants-unit">%</span></span>` +
    `<small class="ov-plants-cap">${ctx.esc(ctx.t('plants_overview.humidity'))}</small></span>` +
    `<span class="ov-plants-side">` +
    `<span class="ov-plants-temp" data-temp="${reading.temperatureStatus}">${icon(ctx, 'mdi:thermometer', 'ov-plants-ico')}<b>${ctx.esc(temperatureText)}</b></span>` +
    barHTML('ov-plants-tempbar', {
      value: celsius === null ? null : Math.round(percentOf(celsius, min, max)),
      low: Math.round(percentOf(reading.range.temperature_low, min, max)),
      high: Math.round(percentOf(reading.range.temperature_high, min, max))
    }) +
    `<small class="ov-plants-cap">${ctx.esc(ctx.t('plants_overview.temperature_range', {low: reading.range.temperature_low, high: reading.range.temperature_high}))}</small>` +
    barHTML('ov-plants-humbar', {
      value: humidity === null ? null : percent,
      low: reading.range.humidity_low,
      high: reading.range.humidity_high
    }) +
    `<small class="ov-plants-cap">${ctx.esc(ctx.t('plants_overview.humidity_range', {low: reading.range.humidity_low, high: reading.range.humidity_high}))}</small>` +
    `</span></span>` +
    `<span class="ov-plants-foot">${batteryText}${agoMarkup}</span>` +
    `</button>`
  );
}

function sceneHTML(ctx, mode) {
  const widget = widgetOf(ctx);
  const title = ctx.options.name ? ctx.name : ctx.esc(ctx.t('plants_overview.title'));
  const keyCtx = {
    ...ctx,
    entityId: widget?.plants?.[0]?.humidity || ctx.options.entity || 'sensor.plants'
  };
  const close =
    mode === 'screensaver'
      ? panelKey(keyCtx, {
          action: 'overview-close',
          icon: 'close',
          label: ctx.t('plants_overview.close'),
          cls: 'ov-panel-close ov-plants-close'
        })
      : '';
  const range = Object.fromEntries(RANGE_KEYS.map((key) => [key, widget?.[key]]));
  const plants = widget?.plants || [];
  const attention = plants.filter((plant) =>
    needsCare(readPlant(plant, range, (id) => ctx.stateOf(id)).status)
  ).length;
  const summary = !plants.length
    ? ''
    : attention
      ? ctx.t(attention === 1 ? 'plants_overview.summary_one' : 'plants_overview.summary_many', {
          n: attention
        })
      : ctx.t('plants_overview.summary_ok');
  const body = plants.length
    ? `<div class="ov-plants-grid">${plants.map((plant) => cardHTML(ctx, plant, range)).join('')}</div>`
    : `<p class="ov-plants-empty">${ctx.esc(ctx.t('plants_overview.empty'))}</p>`;
  return (
    `<div class="ov-scene ov-plants-scene" role="group" aria-label="${ctx.esc(ctx.t('plants_overview.title'))}">` +
    `<header class="ov-panel-head ov-plants-head">${close}<h2 class="ov-panel-title ov-plants-title">${title}</h2>` +
    `${summary ? `<span class="ov-panel-time ov-plants-summary" data-tone="${attention ? 'care' : 'ok'}">${ctx.esc(summary)}</span>` : ''}` +
    `</header><div class="ov-plants-body">${body}</div></div>`
  );
}

/** Once a minute: the "updated ... ago" labels move on. */
function refresh(ctx) {
  ctx.requestRender?.();
}

export default defineOverview({
  type: 'plants',
  label: 'Plants view',
  order: 150,
  entity: 'optional',
  domains: ['sensor'],
  strings,
  // Opened by holding the Plants tile, not picked from the screensaver list.
  selectable: false,
  interactive: true,
  controls: true,
  tap: {card: 'none'},

  options: {},

  // The primary entity is always watched; the plants of the widget are the rest.
  watch: (options, config) =>
    plantEntities(
      (config?.widgets || []).filter((w) => w?.type === 'plants').flatMap((w) => w.plants || [])
    ),

  render: (ctx, mode) => sceneHTML(ctx, mode),

  tick: {every: 60000, align: 'minute', run: refresh}
});
