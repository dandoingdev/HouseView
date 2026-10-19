// Vacuum tile: robot icon, name, and what it is doing now (plus battery). A tap opens the full-screen
// cleaning panel (src/overviews/vacuum). Hold still opens Home Assistant's own dialog. There is no
// single tap-to-start: sending a vacuum off across the floor is a choice made in the panel.
import {defineWidget} from '../../core/define-widget.js';
import {
  VACUUM_FEATURE,
  batteryPercent,
  canLocate,
  canPause,
  canReturn,
  canSpot,
  canStart,
  canStop,
  fanSpeeds,
  isActive,
  reportedStatus,
  startService,
  stopService,
  supports
} from '../../core/vacuum.js';
import {controlTile} from '../_shared/control-tile.js';

const own = (id) => typeof id === 'string' && id.startsWith('vacuum.');

function activityLabel(ctx) {
  const state = ctx.state?.state;
  if (state === 'cleaning') return ctx.t('vacuum.state.cleaning');
  if (state === 'docked') return ctx.t('vacuum.state.docked');
  if (state === 'idle') return ctx.t('vacuum.state.idle');
  if (state === 'paused') return ctx.t('vacuum.state.paused');
  if (state === 'returning') return ctx.t('vacuum.state.returning');
  if (state === 'error') return ctx.t('vacuum.state.error');
  if (state === 'charging') return ctx.t('vacuum.state.charging');
  return ctx.stateText();
}

/** The line under the name: the integration's status when it has one, otherwise the activity, then battery. */
function summary(ctx) {
  if (!ctx.ok) return ctx.t('state.unavailable');
  const label = reportedStatus(ctx.attrs) || activityLabel(ctx);
  const battery = batteryPercent(ctx.attrs);
  if (battery == null) return label;
  return ctx.t('vacuum.summary', {status: label, battery});
}

const command = (allowed, service) => ({
  guard: (ctx, id) => own(id) && allowed(ctx.stateOf(id), ctx.attrsOf(id)),
  run: (ctx, id) => ctx.call('vacuum', service(ctx.attrsOf(id)), {entity_id: id})
});

export default defineWidget({
  type: 'vacuum',
  label: 'Vacuum',
  order: 170,
  domains: ['vacuum'],
  family: 'icon-tile',

  options: {
    icon: {type: 'icon'}
  },

  render: (ctx) =>
    controlTile(ctx, {
      action: ctx.config?.vacuum_view === false ? 'info' : 'vacuum-view',
      icon: 'robot-vacuum',
      on: ctx.ok && isActive(ctx.state),
      sub: summary
    }),

  actions: {
    'vacuum-start': command(canStart, startService),
    'vacuum-pause': {
      guard: (ctx, id) => own(id) && canPause(ctx.stateOf(id), ctx.attrsOf(id)),
      run: (ctx, id) => ctx.call('vacuum', 'pause', {entity_id: id})
    },
    'vacuum-stop': command(canStop, stopService),
    'vacuum-return': {
      guard: (ctx, id) => own(id) && canReturn(ctx.stateOf(id), ctx.attrsOf(id)),
      run: (ctx, id) => ctx.call('vacuum', 'return_to_base', {entity_id: id})
    },
    'vacuum-spot': {
      guard: (ctx, id) => own(id) && canSpot(ctx.stateOf(id), ctx.attrsOf(id)),
      run: (ctx, id) => ctx.call('vacuum', 'clean_spot', {entity_id: id})
    },
    'vacuum-locate': {
      guard: (ctx, id) => own(id) && canLocate(ctx.stateOf(id), ctx.attrsOf(id)),
      run: (ctx, id) => ctx.call('vacuum', 'locate', {entity_id: id})
    },
    'vacuum-fan-*': {
      guard: (ctx, id) => {
        const index = Number(ctx.param);
        if (!own(id) || !Number.isInteger(index) || String(index) !== ctx.param) return false;
        const speeds = fanSpeeds(ctx.attrsOf(id));
        return supports(ctx.attrsOf(id), VACUUM_FEATURE.FAN_SPEED) && index < speeds.length;
      },
      run: (ctx, id) =>
        ctx.call('vacuum', 'set_fan_speed', {
          entity_id: id,
          fan_speed: fanSpeeds(ctx.attrsOf(id))[Number(ctx.param)]
        })
    }
  }
});
