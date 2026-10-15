import {defineWidget} from '../../core/define-widget.js';
export default defineWidget({
  type: 'bad_action',
  label: 'bad_action',
  order: 204,
  domains: ['light'],
  render(ctx) {
    return ctx.tile('nonexistent-thing', 'x');
  }
});
