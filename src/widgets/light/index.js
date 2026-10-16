import {defineWidget} from '../../core/define-widget.js';
import {canDim} from '../../core/light.js';
import {controlTile} from '../_shared/control-tile.js';

// Light tile: the icon opens brightness and the rest of the tile toggles; explicit toggle/off actions keep
// direct service behaviour for shortcuts and bedtime buttons. Reference widget: docs/widget-api.md
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
      values: ['view', 'toggle', 'off'],
      default: 'view',
      error: 'Light action must be view, off or toggle.'
    }
  },

  // YAML reads an unquoted `action: off` as boolean false. Keep it meaning "turn off". The enum check only looks at
  // truthy values (config/validate.js), so false reaches this point instead of being rejected.
  normalize: (widget) => (widget.action === false ? {...widget, action: 'off'} : widget),

  // The editor form shows the same mapping for configs saved before normalisation.
  editor: {
    toForm: (widget) => ({action: widget.action === false ? 'off' : widget.action || 'view'})
  },

  render: (ctx) =>
    controlTile(ctx, {
      action:
        ctx.widget.action === 'off'
          ? 'light-off'
          : ctx.widget.action === 'toggle'
            ? 'light'
            : 'light',
      icon: 'lightbulb-outline',
      ...(!ctx.widget.action || ctx.widget.action === 'view'
        ? {
            iconAction: 'light-view',
            iconLabel: ctx.t('light.brightness', {name: ctx.rawName})
          }
        : {})
    }),

  actions: {
    // `ctx.widget` may be undefined (a direct card._act call), so run only uses the entity id it is given.
    // Action names kept un-prefixed for compatibility (docs/widget-api.md).
    'light-brightness-*': {
      guard: (ctx, id) =>
        /^\d{1,3}$/.test(ctx.param) && Number(ctx.param) <= 100 && canDim(ctx.attrsOf(id)),
      run: (ctx, id) =>
        Number(ctx.param) === 0
          ? ctx.call('light', 'turn_off', {entity_id: id})
          : ctx.call('light', 'turn_on', {entity_id: id, brightness_pct: Number(ctx.param)})
    },
    light: {run: (ctx, id) => ctx.call('light', 'toggle', {entity_id: id})},
    'light-off': {run: (ctx, id) => ctx.call('light', 'turn_off', {entity_id: id})}
  }
});
