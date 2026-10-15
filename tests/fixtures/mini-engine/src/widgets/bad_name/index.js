import {defineWidget} from '../../core/define-widget.js';
export default defineWidget({
  type: 'bad_name',
  label: 'bad_name',
  order: 208,
  domains: ['light'],
  actions: {'wrongprefix-go': {run: () => {}}},
  render(ctx) {
    return ctx.tile('bad_name-go', 'x');
  }
});
