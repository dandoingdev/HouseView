export function controlTile(ctx, {action, icon, on = ctx.state?.state === 'on', sub}) {
  const text = !ctx.ok ? ctx.t('state.unavailable') : sub ? sub(ctx) : ctx.stateText();
  return ctx.tile(
    action,
    `${ctx.icon(ctx.iconName(icon))}<span>${ctx.name}</span><small>${ctx.esc(text)}</small>`,
    `control ${on ? 'active' : ''}`
  );
}
