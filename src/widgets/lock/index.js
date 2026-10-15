import {defineWidget} from '../../core/define-widget.js';
import {controlTile} from '../_shared/control-tile.js';

// Lock tile: icon + name + raw state. A tap locks or unlocks; unlocking a locked door asks for confirmation first.
// Reference widgets: light and cover (docs/widget-api.md).

// States a lock can be toggled from. Anything else (locking, unlocking, jammed, open, ...) is transitional or
// faulty, so a tap opens the more-info dialog instead of sending a second command.
const TOGGLEABLE = ['locked', 'unlocked'];

const stateOf = (ctx, id) => ctx.stateOf(id)?.state;

export default defineWidget({
  type: 'lock',
  label: 'Lock',
  order: 100,
  // Joins the shared tile-proportion CSS lists with action, light, switch, fan and alarm_control_panel.
  family: 'icon-tile',

  options: {
    icon: {type: 'icon'}
  },

  // The tile is "active" only while the state is "on", which a lock never reports, so it is never highlighted
  // (same as the original fall-through branch).
  render: (ctx) =>
    controlTile(ctx, {
      action: 'lock',
      icon: ctx.state?.state === 'unlocked' ? 'lock-open' : 'lock'
    }),

  actions: {
    // `lock` is a un-prefixed action name kept for compatibility (docs/widget-api.md).
    lock: {
      guard: (ctx, id) => (TOGGLEABLE.includes(stateOf(ctx, id)) ? true : 'info'),
      confirm: (ctx, id) =>
        stateOf(ctx, id) === 'locked' ? `Unlock ${ctx.widget?.name || 'this door'}?` : null,
      run: (ctx, id) =>
        ctx.call('lock', stateOf(ctx, id) === 'locked' ? 'unlock' : 'lock', {
          entity_id: id
        })
    }
  }
});
