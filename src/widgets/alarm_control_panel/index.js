import {defineWidget} from '../../core/define-widget.js';

const isArmed = (state) => !!state?.state?.startsWith('armed');

// Alarm panel tile: shield icon, name, state and a hint. A tap only opens the HA more-info dialog, which holds the
// arming keypad; HouseView never arms or disarms, so there are no actions of its own (root action is core `info`).
export default defineWidget({
  type: 'alarm_control_panel',
  label: 'Alarm panel',
  order: 160,
  // Joins the shared tile-proportion CSS lists with action, light, switch, fan and lock.
  family: 'icon-tile',

  render(ctx) {
    const armed = isArmed(ctx.state);
    // The widget ignores `icon`: the shield reflects the armed state.
    const icon = ctx.icon(armed ? 'shield-check-outline' : 'shield-moon-outline');
    const text = ctx.ok ? ctx.stateText() : ctx.t('state.unavailable');
    return ctx.tile(
      'info',
      `${icon}<span>${ctx.name}</span><small>${ctx.esc(text)}</small>` +
        `<span class="control-note">${ctx.esc(ctx.t('alarm_control_panel.note'))}</span>`,
      `control alarm-tile ${armed ? 'active' : ''}`
    );
  }
});
