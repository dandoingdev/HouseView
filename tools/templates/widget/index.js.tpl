import {defineWidget} from '../../core/define-widget.js';
import {controlTile} from '../_shared/control-tile.js';

// {{Label}} widget. Contract: docs/widget-api.md. Touch only this folder (plus `npm run gen`).
export default defineWidget({
  type: '{{type}}',
  label: '{{Label}}',
  // Picker/editor order: the next free multiple of 10. Duplicates are rejected.
  order: {{order}},
  domains: [{{domains}}],
  // family: 'icon-tile', // join the shared tile-proportion CSS lists (no class is added)

  options: {
    icon: {type: 'icon'}
  },

  // Pure: returns ONE root element string carrying data-widget. Escape dynamic text with ctx.esc.
  render: (ctx) => controlTile(ctx, {action: '{{type}}-toggle', icon: 'help-circle-outline'}),

  actions: {
    // Action names are one global namespace: always `<type>-<verb>`. Service calls go through ctx.call only.
    '{{type}}-toggle': {
      run: (ctx, id) => ctx.call('{{firstDomain}}', 'toggle', {entity_id: id})
    }
  }
});
