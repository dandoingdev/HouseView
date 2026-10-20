import {defineWidget} from '../../core/define-widget.js';
import {canArm, canDisarm, isArmed, modeOf} from '../../core/alarm.js';

const own = (id) => typeof id === 'string' && id.startsWith('alarm_control_panel.');

const arm = (key) => {
  const mode = modeOf(key);
  return {
    guard: (ctx, id) => own(id) && canArm(ctx.stateOf(id), ctx.attrsOf(id), mode),
    run: (ctx, id) => ctx.call('alarm_control_panel', mode.service, {entity_id: id})
  };
};

// Alarm panel tile: shield icon, name, state and a hint. A tap opens the full-screen alarm view
// (src/overviews/alarm_control_panel) to arm and disarm. Hold still opens the HA more-info dialog, which holds the
// keypad for a panel that wants a code; HouseView has no keypad and never sends one. Nothing is sent by opening
// the view. `alarm_view: false` leaves a tap on more-info.
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
      ctx.config?.alarm_view === false ? 'info' : 'alarm-view',
      `${icon}<span>${ctx.name}</span><small>${ctx.esc(text)}</small>` +
        `<span class="control-note">${ctx.esc(ctx.t('alarm_control_panel.note'))}</span>`,
      `control alarm-tile ${armed ? 'active' : ''}`
    );
  },

  actions: {
    'alarm-control-panel-arm-home': arm('home'),
    'alarm-control-panel-arm-away': arm('away'),
    'alarm-control-panel-arm-night': arm('night'),
    'alarm-control-panel-arm-vacation': arm('vacation'),
    'alarm-control-panel-disarm': {
      guard: (ctx, id) => own(id) && canDisarm(ctx.stateOf(id), ctx.attrsOf(id)),
      confirm: (ctx, id) =>
        ctx.t('alarm_control_panel.confirm_disarm', {
          name: ctx.stateOf(id)?.attributes?.friendly_name || ctx.widget?.name || id
        }),
      run: (ctx, id) => ctx.call('alarm_control_panel', 'alarm_disarm', {entity_id: id})
    }
  }
});
