import {defineWidget} from '../../core/define-widget.js';
import {needsCare, percentOf, plantEntities, readPlant, validatePlants} from '../../core/plants.js';

// Plants tile: a ring gauge per plant (soil humidity), its temperature beneath and a status colour, so a whole shelf
// reads at a glance. Pressing a plant opens the more-info of its humidity sensor; holding anywhere on the tile opens
// the full-screen plants view (the `plants` overview, via the core `plants-view` action).
//
// The widget has no entity of its own: `plants` lists the sensors. `normalize` points `entity` at the first plant's
// humidity sensor so the hold finds this widget again.

const RANGE_KEYS = ['humidity_low', 'humidity_high', 'temperature_low', 'temperature_high'];

/** A reading with at most one decimal and no trailing ".0". */
const shown = (value) => String(Math.round(value * 10) / 10);

/** Literal keys, so `check:widgets` can verify them. */
function statusText(ctx, status) {
  switch (status) {
    case 'dry':
      return ctx.t('plants.status.dry');
    case 'wet':
      return ctx.t('plants.status.wet');
    case 'cold':
      return ctx.t('plants.status.cold');
    case 'hot':
      return ctx.t('plants.status.hot');
    case 'offline':
      return ctx.t('plants.status.offline');
    default:
      return ctx.t('plants.status.ok');
  }
}

function podHTML(ctx, plant, range) {
  const reading = readPlant(plant, range, (id) => ctx.stateOf(id));
  const {humidity, temperature, battery, status} = reading;
  const name = ctx.esc(plant.name);
  const humidityText = humidity === null ? '—' : String(Math.round(humidity));
  const percent = humidity === null ? 0 : Math.round(percentOf(humidity, 0, 100));
  const temperatureText =
    temperature === null ? '' : `${shown(temperature)}${reading.unit.replace(/^°?/, '°')}`;
  const lowBattery = battery !== null && battery <= 20;
  const label = ctx.t('plants.pod_label', {
    name: plant.name,
    status: statusText(ctx, status),
    humidity: humidityText,
    temperature: temperatureText || '—'
  });
  const meta =
    `<span class="plants-meta" data-temp="${reading.temperatureStatus}">` +
    (temperatureText
      ? `${ctx.icon('thermometer')}<span class="plants-temp">${ctx.esc(temperatureText)}</span>`
      : `<span class="plants-temp plants-none">—</span>`) +
    (lowBattery
      ? `<span class="plants-battery">${ctx.icon('battery-alert-variant-outline')}</span>`
      : '') +
    `</span>`;
  return ctx.btn(
    'plants-info',
    `<span class="plants-ring"><span class="plants-value">${ctx.esc(humidityText)}<sup>%</sup></span></span>` +
      `<span class="plants-name">${name}</span>${meta}`,
    'plants-pod',
    true,
    {
      entity: plant.humidity,
      attrs: `data-state="${status}" style="--p:${percent}" aria-label="${ctx.esc(label)}" `
    }
  );
}

export default defineWidget({
  type: 'plants',
  label: 'Plants',
  order: 180,
  entity: 'none',
  defaultSize: 'wide',
  standaloneHeight: 220,

  options: {
    icon: {type: 'icon'},
    humidity_low: {type: 'number', min: 0, max: 100, step: 1},
    humidity_high: {type: 'number', min: 0, max: 100, step: 1},
    temperature_low: {type: 'number', min: -20, max: 60, step: 1},
    temperature_high: {type: 'number', min: -20, max: 60, step: 1}
  },

  stub: () => ({plants: [{name: 'Plant', humidity: 'sensor.plant_humidity'}]}),

  validate(widget) {
    validatePlants(widget.plants);
    for (const key of RANGE_KEYS) {
      if (widget[key] !== undefined && !Number.isFinite(widget[key])) {
        throw new Error(`Plants ${key} must be a number.`);
      }
    }
  },

  normalize: (widget) => ({...widget, entity: widget.plants[0].humidity}),

  watch: (widget) => plantEntities(widget.plants),

  actions: {
    // A tap on a plant opens the more-info of its humidity sensor; holding the tile opens the plants view.
    'plants-info': {immediate: true, run: (ctx, id) => ctx.info(id)}
  },

  render(ctx) {
    const {widget} = ctx;
    const range = Object.fromEntries(RANGE_KEYS.map((key) => [key, widget[key]]));
    const readings = widget.plants.map((plant) => readPlant(plant, range, (id) => ctx.stateOf(id)));
    const attention = readings.filter((reading) => needsCare(reading.status)).length;
    const summary = attention
      ? attention === 1
        ? ctx.t('plants.summary_one')
        : ctx.t('plants.summary_many', {n: attention})
      : ctx.t('plants.summary_ok');
    const heading = widget.name ? ctx.name : ctx.esc(ctx.t('plants.label'));
    const pods = widget.plants.map((plant) => podHTML(ctx, plant, range)).join('');
    return ctx.root(
      'section',
      'plants-card',
      `<header class="plants-head"><span class="plants-title">${ctx.icon(ctx.iconName('leaf'))}<span class="sr">${heading}</span></span>` +
        `<span class="plants-summary" data-tone="${attention ? 'care' : 'ok'}">${ctx.esc(summary)}</span></header>` +
        `<div class="plants-grid" style="--n:${widget.plants.length}">${pods}</div>`
    );
  }
});
