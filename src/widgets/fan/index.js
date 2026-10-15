import {defineWidget} from '../../core/define-widget.js';
import {controlTile} from '../_shared/control-tile.js';

// Fan tile: icon + name + state. A tap toggles the fan through the shared core `toggle` action
// (homeassistant.toggle), so the widget declares no actions of its own.
// docs/widget-api.md (fan).
export default defineWidget({
  type: 'fan',
  label: 'Fan',
  order: 80,
  // Joins the shared tile-proportion CSS lists with action, light, switch, lock and alarm_control_panel.
  family: 'icon-tile',

  options: {
    icon: {type: 'icon'}
  },

  render: (ctx) => controlTile(ctx, {action: 'toggle', icon: 'fan'})
});
