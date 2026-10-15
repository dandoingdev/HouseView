import {defineWidget} from '../../core/define-widget.js';
export default defineWidget({
  type: 'bad_escape',
  label: 'bad_escape',
  order: 203,
  domains: ['light'],
  render(ctx) {
    return ctx.tile('info', `<span>${ctx.rawName}</span>`);
  }
});
