// The icon + name + state tile that was the fall-through branch of renderWidget before.
// Used by light, switch, fan and lock; the markup is byte-for-byte the original markup.

/**
 * @param {Object} ctx   render context
 * @param {{action: string, icon: string, on?: boolean, sub?: (ctx: Object) => string}} options
 *   `action` is the data-action of the tile, `icon` the default icon name, `on` marks the tile `active`
 *   (default: the entity is "on"), `sub` replaces the small state text.
 * @returns {string} one root <button> carrying data-widget
 */
export function controlTile(ctx, {action, icon, on = ctx.state?.state === 'on', sub}) {
  const text = !ctx.ok ? ctx.t('state.unavailable') : sub ? sub(ctx) : ctx.stateText();
  return ctx.tile(
    action,
    `${ctx.icon(ctx.iconName(icon))}<span>${ctx.name}</span><small>${ctx.esc(text)}</small>`,
    `control ${on ? 'active' : ''}`
  );
}
