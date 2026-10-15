// Blinds / shades (the same quiet language as the thermostat): a glass widget with the name and position in
// the middle (a tap opens more-info) and three plain keys under it: up (open), stop, down (close). No borders or
// fills on the keys. The actions and their guards are the original ones.
import {defineWidget} from '../../core/define-widget.js';

// CoverEntityFeature bits in `supported_features` (Home Assistant core).
const OPEN = 1;
const CLOSE = 2;
const STOP = 8;

// The three keys in render order. `label` reads its string through a literal ctx.t so the linter can check the key.
/** Plain line glyphs drawn inline (they look the same with and without Home Assistant's icon set). */
const GLYPHS = {
  up: '<path d="M4.5 15.5 12 8l7.5 7.5"/>',
  down: '<path d="M4.5 8.5 12 16l7.5-7.5"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.2"/>'
};
const glyph = (name) =>
  `<svg class="bs-glyph" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[name]}</svg>`;

const KEYS = [
  {
    key: 'open',
    icon: 'up',
    label: (ctx) => ctx.t('cover.open'),
    bit: OPEN,
    service: 'open_cover'
  },
  {
    key: 'stop',
    icon: 'stop',
    label: (ctx) => ctx.t('cover.stop'),
    bit: STOP,
    service: 'stop_cover'
  },
  {
    key: 'close',
    icon: 'down',
    label: (ctx) => ctx.t('cover.close'),
    bit: CLOSE,
    service: 'close_cover'
  }
];

const supports = (attrs, bit) => !!(attrs.supported_features & bit);

/** Small status line under the name: position, "Position unknown", or the raw state. */
function statusText(ctx) {
  if (!ctx.ok) return ctx.t('state.unavailable');
  const position = ctx.attrs.current_position;
  if (ctx.num(position)) return ctx.t('cover.percent_open', {n: Math.round(position)});
  if (ctx.state.state === 'unknown') return ctx.t('cover.position_unknown');
  return ctx.stateText();
}

/** One blind key button; disabled unless the entity advertises the matching feature bit. */
const keyButton = (ctx, {key, icon, label, bit}) =>
  ctx.btn(
    `cover-${key}`,
    `${glyph(icon)}<span class="sr">${ctx.esc(label(ctx))} ${ctx.name}</span>`,
    `bs-key bs-${key}`,
    ctx.feature(bit)
  );

const keyAction = (bit, service) => ({
  // Blinds without position feedback report "unknown" but must stay controllable.
  availability: 'allow-unknown',
  // Only cover entities, and only when the matching feature bit is advertised.
  guard: (ctx, id) => id.startsWith('cover.') && supports(ctx.attrsOf(id), bit),
  run: (ctx, id) => ctx.call('cover', service, {entity_id: id})
});

export default defineWidget({
  type: 'cover',
  label: 'Blinds',
  order: 90,
  availability: 'allow-unknown',
  // The icon above the name (default: blinds). A name without a prefix is an mdi icon.
  options: {
    icon: {type: 'icon'}
  },
  render(ctx) {
    // The heading is the tile's "info" button (more-info). ok is true for state "unknown", so it stays usable.
    const heading = ctx.btn(
      'info',
      `${ctx.icon(ctx.iconName('blinds-horizontal'))}<span class="bs-name">${ctx.name}</span><small class="bs-status">${ctx.esc(statusText(ctx))}</small>`,
      'bs-heading',
      ctx.ok
    );
    const keys = KEYS.map((key) => keyButton(ctx, key)).join('');
    return ctx.root('section', 'blinds-simple', `${heading}<div class="bs-keys">${keys}</div>`);
  },
  actions: Object.fromEntries(
    KEYS.map(({key, bit, service}) => [`cover-${key}`, keyAction(bit, service)])
  )
});
