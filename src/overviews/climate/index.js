// The thermostat view: a full-screen face for one climate.* entity, opened by pressing the number on a thermostat
// widget. A close key top left, the name, the time; "Cooling to" / "Heating to" over the target in very large
// figures with a down and an up key beside it; the room temperature and humidity beneath; and top right a three-dot key
// that opens Home Assistant's own thermostat dialog (power, modes, fan, presets).
//
// It is a control panel: its keys stay live in the full-page layer. The down and up keys dispatch the thermostat
// widget's own `up` / `down` actions, so one piece of code steps, clamps and rounds the target. The overview itself
// never calls a service. Reference: docs/overview-api.md
import {defineOverview} from '../../core/define-overview.js';
import {setText} from '../_shared/dom.js';
import {panelHeader} from '../_shared/control-panel.js';
import strings from './strings.js';
import {canStep, hasSingleTarget, moodOf} from './model.js';

/** A temperature in the user's language with at most one decimal. */
const degrees = (ctx, value) => ctx.formatNumber(value, {maximumFractionDigits: 1});

/** The line over the number: what the unit is doing with the target it shows. */
function captionOf(ctx, mood) {
  if (mood === 'unavailable') return ctx.t('climate_overview.unavailable');
  if (mood === 'off') return ctx.t('climate_overview.off');
  if (ctx.state.state === 'heat_cool') {
    const {target_temp_low: low, target_temp_high: high} = ctx.attrs;
    if (ctx.num(low) && ctx.num(high)) {
      return ctx.t('climate_overview.range', {low: degrees(ctx, low), high: degrees(ctx, high)});
    }
  }
  if (!hasSingleTarget(ctx.state, ctx.attrs, ctx.num)) return ctx.t('climate_overview.set_to');
  if (mood === 'cooling') return ctx.t('climate_overview.cooling_to');
  if (mood === 'heating') return ctx.t('climate_overview.heating_to');
  return ctx.t('climate_overview.set_to');
}

/** The big number: the target, else the room temperature, else an em dash. */
function numberOf(ctx) {
  if (!ctx.ok) return '—';
  const shown = hasSingleTarget(ctx.state, ctx.attrs, ctx.num)
    ? ctx.attrs.temperature
    : ctx.attrs.current_temperature;
  return ctx.num(shown) ? degrees(ctx, shown) : '—';
}

/**
 * An icon in a fixed box. The carousel gives every `ha-icon` its own size and a bottom margin (`.adaptive ha-icon`,
 * 42 px, 32 px on a phone); the box takes that size so the margin does not push the icon off centre.
 */
const iconBox = (ctx, name) => `<span class="ov-climate-ico">${ctx.icon(name)}</span>`;

/**
 * `<button>` with a screen-reader label. `icon` is an mdi name; without one the key draws its own glyph in CSS (the
 * chevrons, which scale with the view where an `ha-icon` cannot).
 */
function key(ctx, {action, cls, icon, label, disabled = false}) {
  return (
    `<button type="button" class="${cls}" data-action="${action}" data-entity="${ctx.esc(ctx.entityId)}"` +
    `${disabled ? ' disabled' : ''}>${icon ? iconBox(ctx, icon) : ''}<span class="sr">${ctx.esc(label)}</span></button>`
  );
}

/** One figure of the bottom line (room temperature, humidity), left out when the entity does not report it. */
function figure(ctx, {icon, cls, text, label}) {
  return (
    `<span class="ov-climate-fig ${cls}" aria-label="${ctx.esc(label)}">${iconBox(ctx, icon)}` +
    `<span class="ov-climate-fig-text">${ctx.esc(text)}</span></span>`
  );
}

function sceneHTML(ctx, mode) {
  const mood = moodOf(ctx.state, ctx.ok);
  const caption = captionOf(ctx, mood);
  const value = numberOf(ctx);
  const header = panelHeader(ctx, mode, {
    closeLabel: ctx.t('climate_overview.close'),
    detailsLabel: ctx.t('climate_overview.more_info'),
    time: ctx.options.show_time ? ctx.timeParts(ctx.now()).text : ''
  });
  const step = (direction) =>
    key(ctx, {
      action: direction,
      cls: `ov-climate-step ov-climate-${direction}`,
      label: ctx.t(direction === 'up' ? 'climate_overview.increase' : 'climate_overview.decrease'),
      disabled: !canStep(ctx.state, ctx.attrs, ctx.num, direction)
    });
  const current = ctx.ok && ctx.num(ctx.attrs.current_temperature);
  const humidity = ctx.ok && ctx.num(ctx.attrs.current_humidity);
  const figures = [
    current
      ? figure(ctx, {
          icon: 'mdi:thermometer',
          cls: 'ov-climate-current',
          text: `${degrees(ctx, ctx.attrs.current_temperature)}°`,
          label: ctx.t('climate_overview.current', {
            value: `${degrees(ctx, ctx.attrs.current_temperature)}${ctx.unit()}`
          })
        })
      : '',
    humidity
      ? figure(ctx, {
          icon: 'mdi:water-percent',
          cls: 'ov-climate-humidity',
          text: `${ctx.formatNumber(ctx.attrs.current_humidity)}%`,
          label: ctx.t('climate_overview.humidity', {
            value: `${ctx.formatNumber(ctx.attrs.current_humidity)}%`
          })
        })
      : ''
  ].join('');
  const aria = ctx.t('climate_overview.aria', {name: ctx.rawName, caption, value});
  const flags = value === '—' ? ' ov-climate-none' : value.length > 2 ? ' ov-climate-long' : '';
  return (
    `<div class="ov-scene ov-climate-scene" data-mood="${mood}" role="group" aria-label="${ctx.esc(aria)}">` +
    header +
    `<div class="ov-climate-body">` +
    `<p class="ov-climate-caption">${ctx.esc(caption)}</p>` +
    `<div class="ov-climate-row">${step('down')}<span class="ov-climate-value${flags}">${ctx.esc(value)}</span>${step('up')}</div>` +
    `<p class="ov-climate-meta">${figures}</p>` +
    `</div>` +
    `</div>`
  );
}

/** Once a minute: the clock in the header, patched in place. */
function refresh(ctx) {
  if (!ctx.options.show_time) return;
  setText(ctx.el, '[data-ov="time"]', ctx.timeParts(ctx.now()).text);
}

export default defineOverview({
  type: 'climate',
  label: 'Thermostat view',
  order: 70,
  entity: 'required',
  domains: ['climate'],
  strings,
  // Opened from the thermostat widget, not picked from the screensaver list (a press on it would only wake).
  selectable: false,
  // A control panel: live keys in the card and in the full-page layer (docs/overview-api.md).
  interactive: true,
  controls: true,
  actions: ['up', 'down'],
  tap: {card: 'none'},

  options: {
    show_time: {type: 'boolean', default: true}
  },

  render: (ctx, mode) => sceneHTML(ctx, mode),

  afterRender: refresh,
  tick: {every: 60000, align: 'minute', run: refresh}
});
