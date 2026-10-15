import {defineWidget} from '../../core/define-widget.js';
import {controlTile} from '../_shared/control-tile.js';

// Switch tile: icon + name + state. A tap flips the entity through the shared core `toggle` action
// (homeassistant.toggle), so this widget owns no action of its own. Ported from the fall-through branch of
// renderWidget and _act of the original; the markup is byte-compatible.
export default defineWidget({
  type: 'switch',
  label: 'Switch',
  order: 70,
  // Joins the shared tile-proportion CSS lists with action, light, fan, lock and alarm_control_panel.
  family: 'icon-tile',

  options: {
    icon: {type: 'icon'}
  },

  render: (ctx) => controlTile(ctx, {action: 'toggle', icon: 'power'})
});
