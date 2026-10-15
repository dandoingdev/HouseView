import {defineWidget} from '../../core/define-widget.js';
export default defineWidget({
  type: 'bad_clock',
  label: 'bad_clock',
  order: 205,
  domains: ['light'],
  render(ctx) {
    return ctx.tile('info', String(Date.now()));
  }
});
