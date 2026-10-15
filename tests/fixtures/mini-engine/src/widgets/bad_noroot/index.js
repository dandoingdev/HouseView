import {defineWidget} from '../../core/define-widget.js';
export default defineWidget({
  type: 'bad_noroot',
  label: 'bad_noroot',
  order: 202,
  domains: ['light'],
  render(ctx) {
    return `<div class="widget bad_noroot size-normal">${ctx.name}</div><div></div>`;
  }
});
