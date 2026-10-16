// The icon + name + state tile that was the fall-through branch of renderWidget before.
// Used by light, switch, fan and lock; the markup is byte-for-byte the original markup.

/**
 * @param {Object} ctx   render context
 * @param {{action: string, icon: string, on?: boolean, sub?: (ctx: Object) => string, iconAction?: string, iconLabel?: string}} options
 *   `action` is the data-action of the tile, `icon` the default icon name, `on` marks the tile `active`
 *   (default: the entity is "on"), `sub` replaces the small state text.
 * @returns {string} one root carrying data-widget; optional iconAction uses two sibling buttons
 */
export function controlTile(
  ctx,
  {action, icon, on = ctx.state?.state === 'on', sub, iconAction, iconLabel}
) {
  const text = !ctx.ok ? ctx.t('state.unavailable') : sub ? sub(ctx) : ctx.stateText();
  if (iconAction) {
    // Two sibling buttons: the icon opens details while the full-tile primary button keeps tap/hold semantics.
    const primary = ctx.btn(
      action,
      `<span class="sr">${ctx.name} ${ctx.esc(text)}</span>`,
      'control-tap',
      ctx.ok,
      {attrs: `${ctx.attr} `}
    );
    const details = ctx.btn(iconAction, ctx.icon(ctx.iconName(icon)), 'control-icon', ctx.ok, {
      attrs: `aria-label="${ctx.esc(iconLabel)}" `
    });
    return ctx.root(
      'section',
      `control control-split ${on ? 'active' : ''} ${!ctx.ok ? 'control-unavailable' : ''}`,
      `${primary}${details}<span>${ctx.name}</span><small>${ctx.esc(text)}</small>`
    );
  }
  return ctx.tile(
    action,
    `${ctx.icon(ctx.iconName(icon))}<span>${ctx.name}</span><small>${ctx.esc(text)}</small>`,
    `control ${on ? 'active' : ''}`
  );
}
