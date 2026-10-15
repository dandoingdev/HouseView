import {defineOverview} from '../../core/define-overview.js';
import strings from './strings.js';

export default defineOverview({
  type: '{{type}}',
  label: '{{Label}} overview',
  order: {{order}},
  entity: 'required',
  domains: [{{domains}}],
  strings,
  options: {},

  render(ctx) {
    const text = ctx.ok ? ctx.name : ctx.t('{{type}}_overview.unavailable');
    return `<div class="ov-scene ov-{{type}}-scene"><p class="ov-{{type}}-title">${ctx.esc(text)}</p></div>`;
  }
});
