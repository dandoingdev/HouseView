import {defineWidget} from '../../core/define-widget.js';
const KEYS = [
  ['open', 'chevron-up', 'cover.open', 1, 'open_cover'],
  ['stop', 'stop', 'cover.stop', 8, 'stop_cover'],
  ['close', 'chevron-down', 'cover.close', 2, 'close_cover']
];
const supports = (attrs, bit) => !!(attrs.supported_features & bit);
const keyAction = (bit, service) => ({
  availability: 'allow-unknown',
  guard: (ctx, id) => id.startsWith('cover.') && supports(ctx.attrsOf(id), bit),
  run: (ctx, id) => ctx.call('cover', service, {entity_id: id})
});
export default defineWidget({
  type: 'cover',
  label: 'Blinds',
  order: 90,
  availability: 'allow-unknown',
  render(ctx) {
    const {state, attrs, ok, name} = ctx;
    const status = !ok
      ? ctx.t('state.unavailable')
      : ctx.num(attrs.current_position)
        ? ctx.t('cover.percent_open', {n: Math.round(attrs.current_position)})
        : state.state === 'unknown'
          ? ctx.t('cover.position_unknown')
          : ctx.stateText();
    const heading = ctx.btn(
      'info',
      `${ctx.icon('blinds-horizontal')}<span>${name}</span><small>${ctx.esc(status)}</small>`,
      'blinds-heading',
      ok
    );
    const keys = KEYS.map(([key, icon, label, bit]) =>
      ctx.btn(
        `cover-${key}`,
        `${ctx.icon(icon)}<span>${ctx.esc(ctx.t(label))}</span><span class="sr"> ${name}</span>`,
        'blind-key',
        ctx.feature(bit)
      )
    ).join('');
    return ctx.root(
      'section',
      'blinds-panel',
      `${heading}<div class="blinds-controls">${keys}</div>`
    );
  },
  actions: Object.fromEntries(
    KEYS.map(([key, , , bit, service]) => [`cover-${key}`, keyAction(bit, service)])
  )
});
