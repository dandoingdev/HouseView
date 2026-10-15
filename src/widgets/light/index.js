import {defineWidget} from '../../core/define-widget.js';
import {controlTile} from '../_shared/control-tile.js';

// Light tile: icon + name + state. A tap toggles the light, or (action: off) always turns it off, which is what
// bedtime buttons want. Reference widget: docs/widget-api.md
export default defineWidget({
  type: 'light',
  label: 'Light',
  order: 60,
  // Joins the shared tile-proportion CSS lists with action, switch, fan, lock and alarm_control_panel.
  family: 'icon-tile',

  options: {
    icon: {type: 'icon'},
    action: {
      type: 'enum',
      values: ['toggle', 'off'],
      default: 'toggle',
      error: 'Light action must be off or toggle.'
    }
  },

  // YAML reads an unquoted `action: off` as boolean false. Keep it meaning "turn off". The enum check only looks at
  // truthy values (config/validate.js), so false reaches this point instead of being rejected.
  normalize: (widget) => (widget.action === false ? {...widget, action: 'off'} : widget),

  // The editor form shows the same mapping for configs saved before normalisation.
  editor: {
    toForm: (widget) => ({action: widget.action === false ? 'off' : widget.action || 'toggle'})
  },

  render: (ctx) =>
    controlTile(ctx, {
      action: ctx.widget.action === 'off' ? 'light-off' : 'light',
      icon: 'lightbulb-outline'
    }),

  actions: {
    // `ctx.widget` may be undefined (a direct card._act call), so run only uses the entity id it is given.
    // Action names kept un-prefixed for compatibility (docs/widget-api.md).
    light: {run: (ctx, id) => ctx.call('light', 'toggle', {entity_id: id})},
    'light-off': {run: (ctx, id) => ctx.call('light', 'turn_off', {entity_id: id})}
  }
});
