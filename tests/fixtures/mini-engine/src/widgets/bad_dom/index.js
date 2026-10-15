import {defineWidget} from '../../core/define-widget.js';
export default defineWidget({
  type: 'bad_dom',
  label: 'bad_dom',
  order: 201,
  domains: ['light'],
  render(ctx) {
    document.createElement('p');
    return ctx.tile('info', 'x');
  }
});
