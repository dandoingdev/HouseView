import {defineWidget} from '../../core/define-widget.js';
export default defineWidget({
  type: 'bad_mutate',
  label: 'bad_mutate',
  order: 207,
  domains: ['light'],
  render(ctx) {
    ctx.widget.size = 'wide';
    return ctx.tile('info', 'x');
  }
});
