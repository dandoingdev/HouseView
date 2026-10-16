// Thermostat widget (minimal face): a very large temperature, a down chevron, the name with a "room • current"
// line, and an up chevron. Nothing else: a hold on the number opens the full-screen thermostat view
// (src/overviews/climate), or Home Assistant's more-info dialog when the card says `climate_view: false`. The
// step logic (target_temp_step, clamping, heat_cool, feature bit 1) is shared with the view, which dispatches the
// `up` and `down` actions below. Reference: docs/widget-api.md
import {defineWidget} from '../../core/define-widget.js';
import {numberFormat} from '../../core/format.js';

// ClimateEntityFeature bit in `supported_features` (Home Assistant core).
const TARGET_TEMPERATURE = 1;

/** Separates the parts of the line under the name. */
const BULLET = ' • ';

/** Step used when the entity has no usable `target_temp_step`: whole degrees for Fahrenheit, halves otherwise. */
const defaultStep = (ctx) => (ctx.unit() === '°F' ? 1 : 0.5);

const supports = (attrs, bit) => !!(attrs.supported_features & bit);

/** In heat_cool mode there is no single target, so the tile shows the room temperature instead. */
const hasSingleTarget = (ctx) => ctx.num(ctx.attrs.temperature) && ctx.state.state !== 'heat_cool';

/** Target temperature when there is one, else the measured room temperature; null while unavailable. */
function shownTemperature(ctx) {
  if (!ctx.ok) return null;
  return hasSingleTarget(ctx) ? ctx.attrs.temperature : ctx.attrs.current_temperature;
}

/** A temperature in the user's language with at most one decimal. */
const formatted = (ctx, value) => numberFormat(ctx.hass, {maximumFractionDigits: 1}).format(value);

/** The big number; an em dash when unknown. */
function temperatureText(ctx) {
  const shown = shownTemperature(ctx);
  return ctx.num(shown) ? formatted(ctx, shown) : '—';
}

/**
 * The line under the name: "Off • Living Room • 20°". Each part is left out when it does not apply: "Off" only
 * while the entity is switched off (or "Unavailable"), the room only when the `room` option is set, the current
 * temperature only when the entity reports one.
 */
function subtitleText(ctx) {
  const room = String(ctx.widget.room ?? '').trim();
  const current = ctx.ok ? ctx.attrs.current_temperature : null;
  const status = !ctx.ok
    ? ctx.t('state.unavailable')
    : ctx.state.state === 'off'
      ? ctx.t('common.off')
      : '';
  return [status, room, ctx.num(current) ? `${formatted(ctx, current)}°` : '']
    .filter(Boolean)
    .join(BULLET);
}

/** A thin chevron drawn inline, so it looks the same with and without Home Assistant's icon set. */
const chevron = (up) =>
  `<svg class="cs-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="${up ? 'M4.5 15.5 12 8l7.5 7.5' : 'M4.5 8.5 12 16l7.5-7.5'}"/></svg>`;

/** Down / up key: needs a numeric target, a single-target mode, feature bit 1 and room before min / max. */
function adjustButton(ctx, direction) {
  const {attrs} = ctx;
  const up = direction === 'up';
  const limit = up ? attrs.max_temp : attrs.min_temp;
  const adjustable = ctx.ok && hasSingleTarget(ctx) && supports(attrs, TARGET_TEMPERATURE);
  const withinLimit =
    !ctx.num(limit) || (up ? attrs.temperature < limit : attrs.temperature > limit);
  const label = up ? ctx.t('climate.increase') : ctx.t('climate.decrease');
  return ctx.btn(
    direction,
    `${chevron(up)}<span class="sr">${ctx.esc(label)}</span>`,
    `cs-step cs-${direction}`,
    adjustable && withinLimit
  );
}

/**
 * Change the target by one step, clamped to min_temp / max_temp. Anything that cannot be stepped (no numeric
 * target, heat_cool, no target-temperature feature) opens more-info instead.
 */
function stepTarget(ctx, id, direction) {
  const attrs = ctx.attrsOf(id);
  if (!ctx.num(attrs.temperature) || ctx.stateOf(id).state === 'heat_cool') return ctx.info(id);
  if (!supports(attrs, TARGET_TEMPERATURE)) return ctx.info(id);
  const step =
    ctx.num(attrs.target_temp_step) && attrs.target_temp_step > 0
      ? attrs.target_temp_step
      : defaultStep(ctx);
  const wanted = attrs.temperature + (direction === 'up' ? step : -step);
  const floor = ctx.num(attrs.min_temp) ? attrs.min_temp : -Infinity;
  const ceiling = ctx.num(attrs.max_temp) ? attrs.max_temp : Infinity;
  const target = Math.min(ceiling, Math.max(floor, wanted));
  // Two decimals removes float noise such as 20.5 + 0.1.
  return ctx.call('climate', 'set_temperature', {
    entity_id: id,
    temperature: Math.round(target * 100) / 100
  });
}

const stepAction = (direction) => ({run: (ctx, id) => stepTarget(ctx, id, direction)});

export default defineWidget({
  type: 'climate',
  label: 'Thermostat',
  order: 50,
  defaultSize: 'large',
  standaloneHeight: 280,

  // `room` names the room in the line under the name ("Living Room • 20°"); a removed config shape
  // uses it as its caption too.
  options: {room: {type: 'text'}},

  render(ctx) {
    const text = temperatureText(ctx);
    // A hold opens the full-screen thermostat view (`climate_view: false` keeps the more-info dialog).
    const number = ctx.btn(
      ctx.config?.climate_view === false ? 'info' : 'climate-view',
      `<span class="cs-value">${ctx.esc(text)}</span><span class="sr">${ctx.esc(ctx.t('climate.target_info'))}</span>`,
      'cs-number'
    );
    const label = `<div class="cs-label"><strong class="cs-name">${ctx.name}</strong><span class="cs-sub">${ctx.esc(subtitleText(ctx))}</span></div>`;
    const bar = `<div class="cs-bar">${adjustButton(ctx, 'down')}${label}${adjustButton(ctx, 'up')}</div>`;
    const flags = [
      !ctx.ok || ctx.state.state === 'off' ? 'cs-dim' : '',
      text === '—' ? 'cs-none' : text.length > 2 ? 'cs-long' : ''
    ]
      .filter(Boolean)
      .join(' ');
    return ctx.root('section', `climate-simple ${flags}`.trim(), `${number}${bar}`);
  },

  actions: {
    // `up` and `down` are un-prefixed names kept for compatibility (ctx.widget may be undefined for a direct
    // call). No guard: run decides between a service call and more-info.
    up: stepAction('up'),
    down: stepAction('down')
  }
});
