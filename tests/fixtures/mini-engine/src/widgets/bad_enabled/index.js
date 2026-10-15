import {defineWidget} from '../../core/define-widget.js';
export default defineWidget({
  type: 'bad_enabled',
  label: 'bad_enabled',
  order: 206,
  domains: ['light'],
  render(ctx) {
    return ctx.btn('info', 'x', `tile widget bad_enabled size-normal`, true, {
      attrs: ctx.attr + ' '
    });
  }
});
