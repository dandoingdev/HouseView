// Constants of the widget contract (docs/widget-api.md) shared by the contract suite and tools/check-widgets.mjs.
// One place to change when the contract changes.

/** Action names kept from that do not follow the `<type>-<verb>` rule. */
export const GRANDFATHERED_ACTIONS = [
  'up',
  'down',
  'light',
  'light-off',
  'lock',
  'media',
  'scene',
  'run-action',
  // Kept from and assigned to widgets by docs/widget-api.md (also listed in section 4):
  'media-prev',
  'media-next',
  'volume-up',
  'volume-down',
  'dismiss-alarm'
];

/** Owned by core, never by a widget. */
export const CORE_ACTIONS = ['info', 'toggle'];

/** Registered with registerFeature: card-level, owned by no widget. */
export const FEATURE_ACTIONS = [
  'dim',
  'overview-open',
  'calendar-view',
  'goto-widget',
  'page-prev',
  'page-next',
  'page-select'
];

export const ACTION_NAME = /^[a-z][a-z0-9-]*\*?$/;
export const TYPE_NAME = /^[a-z][a-z0-9_]*$/;

/** Classes every widget root may carry besides `widget`, its type and `size-*`: rendered by core helpers or shared CSS. */
export const SHARED_ROOT_CLASSES = ['widget', 'tile', 'control', 'active', 'sr'];

/** String keys any widget may use besides its own `<type>.` keys (docs/widget-api.md). */
export const CORE_STRING_KEYS = [
  'state.unavailable',
  'state.offline',
  'common.on',
  'common.off',
  'editor.widget_type',
  'editor.entity',
  'editor.name',
  'editor.size',
  'editor.icon',
  'error.action',
  'error.try_again'
];
export const CORE_STRING_PREFIXES = ['state.', 'common.', 'editor.', 'error.'];

export const SIZES = ['normal', 'wide', 'tall', 'large'];
export const ENTITY_POLICIES = ['required', 'none', 'custom'];
export const AVAILABILITY_POLICIES = ['entity', 'always', 'allow-unknown'];
// `entity` and `enum_list` are the overview option types (docs/widget-api.md, docs/overview-api.md).
export const OPTION_TYPES = ['text', 'icon', 'enum', 'boolean', 'number', 'entity', 'enum_list'];
export const FAMILIES = ['icon-tile'];

/** Widgets whose output legitimately depends on the clock (pinned by the harness). */
export const CLOCK_DEPENDENT = ['date', 'calendar'];

/** Variants every widget with an entity must provide (docs/widget-api.md). */
export const REQUIRED_VARIANTS = ['ok', 'unavailable', 'missing'];

/** Identifiers that must not appear in a render function (docs/widget-api.md). */
export const RENDER_FORBIDDEN = {
  identifiers: [
    'callService',
    'localStorage',
    'sessionStorage',
    'fetch',
    'confirm',
    'document',
    'window',
    'XMLHttpRequest',
    'setTimeout',
    'setInterval',
    'requestAnimationFrame'
  ],
  members: ['ctx.card', 'Math.random', 'Date.now', 'performance.now']
};

/** Widgets allowed to read the clock in render in the contract suite. */
export const RENDER_DATE_EXEMPT = CLOCK_DEPENDENT;

/** The shared tile-proportion family as shipped (docs/widget-api.md `family`). */
export const ICON_TILE_FAMILY = ['light', 'action', 'switch', 'fan', 'lock', 'alarm_control_panel'];
