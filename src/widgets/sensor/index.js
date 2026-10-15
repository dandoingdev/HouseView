import {defineWidget} from '../../core/define-widget.js';

// Sensor tile: a big value with its unit (small, raised) and the name underneath. Display only: the whole tile is
// the "info" button, which opens the more-info dialog. Ported from renderWidget (sensor branch) of the original.
// No action is owned here; `info` belongs to core.
export default defineWidget({
  type: 'sensor',
  label: 'Sensor',
  order: 110,

  options: {
    // A name without a prefix is an mdi icon; "mdi:thermometer" and other prefixed ids are used as they are.
    icon: {type: 'icon'}
  },

  render(ctx) {
    // Unavailable, unknown and missing entities show a dash instead of the raw state text.
    const value = ctx.ok ? ctx.state.state : '—';
    // The unit is shown even for an unavailable entity (it is simply empty when the entity is missing).
    const unit = ctx.attrs.unit_of_measurement || '';
    return ctx.tile(
      'info',
      `${ctx.icon(ctx.iconName('gauge'))}` +
        `<span class="widget-value">${ctx.esc(value)}<sup>${ctx.esc(unit)}</sup></span>` +
        `<span>${ctx.name}</span>`,
      'control'
    );
  }
});
