import {defineWidget} from '../../core/define-widget.js';
import {controlTile} from '../_shared/control-tile.js';
export default defineWidget({
  type: 'light',
  label: 'Light',
  order: 60,
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
  normalize: (widget) => (widget.action === false ? {...widget, action: 'off'} : widget),
  editor: {
    toForm: (widget) => ({action: widget.action === false ? 'off' : widget.action || 'toggle'})
  },
  render: (ctx) =>
    controlTile(ctx, {
      action: ctx.widget.action === 'off' ? 'light-off' : 'light',
      icon: 'lightbulb-outline'
    }),
  actions: {
    light: {run: (ctx, id) => ctx.call('light', 'toggle', {entity_id: id})},
    'light-off': {run: (ctx, id) => ctx.call('light', 'turn_off', {entity_id: id})}
  }
});
