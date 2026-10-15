import {getWidget, getStrings, unknownOkDomains} from './registry.js';
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]
  );
const num = (v) => typeof v === 'number' && Number.isFinite(v);
function base(card) {
  const hass = card._hass;
  const stateOf = (id) => hass?.states?.[id];
  const availableOf = (id) => {
    const s = stateOf(id);
    return (
      !!s &&
      s.state !== 'unavailable' &&
      (unknownOkDomains().includes(id.split('.')[0]) || s.state !== 'unknown')
    );
  };
  const t = (key, vars = {}) => {
    const table = getStrings();
    const text = table.en?.[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  };
  const icon = (name) =>
    `<ha-icon icon="${name.includes(':') ? esc(name) : `mdi:${esc(name)}`}" aria-hidden="true"></ha-icon>`;
  return {
    hass,
    config: card._config,
    stateOf,
    attrsOf: (id) => stateOf(id)?.attributes || {},
    availableOf,
    esc,
    num,
    t,
    unit: () => hass?.config?.unit_system?.temperature || '°C',
    lang: () => hass?.locale?.language,
    icon,
    isPending: (id) => card._pending.has(id),
    now: () => Date.now(),
    call: (d, s, data) => hass.callService(d, s, data),
    info: (id) => card._info(id)
  };
}
export function createRenderContext(card, widget, index) {
  const def = getWidget(widget.type);
  const ctx = base(card);
  const entityId = widget.entity;
  const state = ctx.stateOf(entityId);
  const attrs = state?.attributes || {};
  const ok =
    def.availability === 'always' || def.entity === 'none'
      ? true
      : def.availability === 'allow-unknown' && state?.state === 'unknown'
        ? true
        : ctx.availableOf(entityId);
  const rawName = widget.name || attrs.friendly_name || widget.type.replaceAll('_', ' ');
  const size = widget.size || def.defaultSize;
  const cls = `widget ${widget.type} size-${size}`;
  const attr = `data-widget="${index}"`;
  const btn = (action, content, c = '', enabled = ok, {entity = entityId, attrs: a = ''} = {}) =>
    `<button ${a}class="${c}" data-action="${action}" data-entity="${esc(entity)}" ${!enabled || ctx.isPending(entity) ? 'disabled' : ''}>${content}</button>`;
  return Object.assign(ctx, {
    widget,
    index,
    type: widget.type,
    entityId,
    state,
    attrs,
    ok,
    name: esc(rawName),
    rawName,
    size,
    cls,
    attr,
    btn,
    tile: (action, content, extra = '') =>
      btn(action, content, `tile ${cls} ${extra}`, ok, {attrs: `${attr} `}),
    root: (tag, extra, inner) => `<${tag} ${attr} class="tile ${cls} ${extra}">${inner}</${tag}>`,
    feature: (bit) => ok && !!(attrs.supported_features & bit),
    iconName: (fallback) => widget.icon || fallback,
    stateText: (s = state) => String(s?.state ?? '').replaceAll('_', ' ')
  });
}
export function createActionContext(card, action, id) {
  const widget = card._config?.widgets?.find((w) => w.entity === id);
  return Object.assign(base(card), {action, param: '', widget});
}
