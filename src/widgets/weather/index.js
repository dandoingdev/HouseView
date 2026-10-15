import {defineWidget} from '../../core/define-widget.js';

// weather.* state -> mdi icon. `clear` is the night-time state, hence the moon. Anything not listed
// (exceptional, hail, lightning, ...) falls back to partly cloudy.
const ICONS = {
  sunny: 'weather-sunny',
  clear: 'weather-night',
  partlycloudy: 'weather-partly-cloudy',
  cloudy: 'weather-cloudy',
  rainy: 'weather-rainy',
  pouring: 'weather-pouring',
  snowy: 'weather-snowy',
  fog: 'weather-fog',
  windy: 'weather-windy'
};
const FALLBACK_ICON = 'weather-partly-cloudy';

// Weather tile: condition icon, temperature with unit, name and the condition text. A tap opens the full-screen
// weather overview (src/overviews/weather), or more-info when the card says `weather_view: false`.
export default defineWidget({
  type: 'weather',
  label: 'Weather',
  order: 120,

  render(ctx) {
    const {state, attrs, ok} = ctx;
    // Temperatures are shown as HA reports them. A non-number (string, missing) shows a dash.
    const temperature = ok && ctx.num(attrs.temperature) ? ctx.esc(attrs.temperature) : '—';
    // The entity's own unit wins, then the system unit; never convert.
    const unit = ctx.esc(attrs.temperature_unit || ctx.unit());
    // State names use '-' as separator (`lightning-rainy`), shown with spaces. Not ctx.stateText, which
    // replaces '_' only.
    const condition = ok ? state.state.replaceAll('-', ' ') : ctx.t('state.unavailable');
    // A press opens the full-screen weather view (`weather_view: false` keeps the more-info dialog).
    return ctx.tile(
      ctx.config?.weather_view === false ? 'info' : 'weather-view',
      `${ctx.icon(ICONS[state?.state] || FALLBACK_ICON)}<span class="widget-value">${temperature}<sup>${unit}</sup></span><span>${ctx.name}</span><small>${ctx.esc(condition)}</small>`,
      'control'
    );
  }
});
