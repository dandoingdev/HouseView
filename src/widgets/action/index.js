import {defineWidget} from '../../core/define-widget.js';

// Action widget: one kind for scene, script, button and input_button entities. The config types `scene`,
// `script`, `button` and `input_button` are aliases that the registry folds into `action` (docs/widget-api.md).
const DOMAINS = ['scene', 'script', 'button', 'input_button'];
const ENTITY_PATTERN = /^(scene|script|button|input_button)\.[a-z0-9_]+$/;

// Default icon per domain (the "mdi:" prefix is stripped and re-added: the "mdi:" prefix; render strips and re-adds it).
const DEFAULT_ICONS = {
  scene: 'mdi:weather-sunny',
  script: 'mdi:script-text-play-outline',
  button: 'mdi:gesture-tap-button',
  input_button: 'mdi:gesture-tap-button'
};

const domainOf = (id) => String(id).split('.')[0];

// Caption under the name when the entity is usable and idle: Scene / Run / Press. Literal keys keep strings checkable.
const idleLabel = (ctx, domain) =>
  domain === 'scene'
    ? ctx.t('action.scene')
    : domain === 'script'
      ? ctx.t('action.run')
      : ctx.t('action.press');

export default defineWidget({
  type: 'action',
  label: 'Action',
  order: 10,
  // Joins the shared tile-proportion CSS lists with light, switch, fan, lock and alarm_control_panel.
  family: 'icon-tile',
  // validate owns every entity check: the generic rule would demand an `action.*` entity.
  entity: 'custom',
  domains: DOMAINS,
  aliases: DOMAINS,
  // Scenes and buttons never leave "unknown" until first used; they must stay pressable.
  unknownOkDomains: ['scene', 'button', 'input_button'],

  options: {
    icon: {type: 'icon'},
    note: {type: 'text'}
  },

  // `widget.type` is still the original (possibly alias) type here. A non-string entity (a config bug) gets the
  // readable message of its type instead of a raw TypeError.
  validate(widget) {
    const entity = typeof widget.entity === 'string' ? widget.entity : '';
    if (widget.type === 'action') {
      if (!ENTITY_PATTERN.test(entity)) {
        throw new Error('Action widget needs a scene, script, button or input_button entity.');
      }
    } else if (!entity.startsWith(`${widget.type}.`)) {
      // Alias types (scene, script, ...) keep the generic "<type> widget needs a <type> entity." rule.
      throw new Error(`${widget.type} widget needs a ${widget.type} entity.`);
    }
  },

  render(ctx) {
    const {widget, state, attrs, ok} = ctx;
    const domain = domainOf(widget.entity);
    // A running script cannot be started again: show "Running" and disable the widget.
    const running = domain === 'script' && state?.state === 'on';
    // The icon name is taken without "mdi:" and re-added, so a foreign prefix ("hass:x") becomes "mdi:hass:x"
    // (a name containing ':' is used verbatim by ctx.icon).
    const icon = String(widget.icon || attrs.icon || DEFAULT_ICONS[domain]);
    const label = !ok
      ? ctx.t('state.unavailable')
      : running
        ? ctx.t('action.running')
        : idleLabel(ctx, domain);
    const note = widget.note ? `<span class="control-note">${ctx.esc(widget.note)}</span>` : '';
    return ctx.btn(
      'run-action',
      `${ctx.icon(`mdi:${icon.replace('mdi:', '')}`)}<span>${ctx.name}</span><small>${ctx.esc(label)}</small>${note}`,
      `tile ${ctx.cls} ${domain} control ${running ? 'active' : ''}`,
      ok && !running,
      {attrs: `${ctx.attr} `}
    );
  },

  actions: {
    'run-action': {
      // Only entities that a configured action widget owns may be run, and a script only while it is off.
      guard: (ctx, id) =>
        !!ctx.widget &&
        DOMAINS.includes(domainOf(id)) &&
        !(id.startsWith('script.') && ctx.stateOf(id)?.state !== 'off'),
      run: (ctx, id) => {
        const domain = domainOf(id);
        const service = domain === 'button' || domain === 'input_button' ? 'press' : 'turn_on';
        return ctx.call(domain, service, {entity_id: id});
      }
    },
    // Also dispatched by a removed config shape (ctx.widget is undefined there), so no guard.
    scene: {run: (ctx, id) => ctx.call('scene', 'turn_on', {entity_id: id})}
  }
});
