// The icon + name + state tile that was the fall-through branch of renderWidget before.
// Used by light, switch, fan and lock; the markup is byte-for-byte the original markup.

/**
 * @param {Object} ctx   render context
 * @param {{action: string, icon: string, on?: boolean, sub?: (ctx: Object) => string, iconAction?: string, iconLabel?: string, extraClass?: string, note?: string}} options
 *   `action` is the data-action of the tile, `icon` the default icon name, `on` marks the tile `active`
 *   (default: the entity is "on"), `sub` replaces the small state text. `iconAction` adds a 44px icon key that
 *   opens a second screen without holding. `extraClass` and `note` support scene tiles and captions.
 * @returns {string} one root carrying data-widget; optional iconAction uses two sibling buttons
 */
export function controlTile(
  ctx,
  {action, icon, on = ctx.state?.state === 'on', sub, iconAction, iconLabel, extraClass = '', note = ''}
) {
  const text = !ctx.ok ? ctx.t('state.unavailable') : sub ? sub(ctx) : ctx.stateText();
  const noteHtml = note ? `<span class="control-note">${ctx.esc(note)}</span>` : '';
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
    const split = [
      'control',
      'control-split',
      extraClass,
      on ? 'active' : '',
      !ctx.ok ? 'control-unavailable' : ''
    ]
      .filter(Boolean)
      .join(' ');
    return ctx.root(
      'section',
      split,
      `${primary}${details}<span>${ctx.name}</span><small>${ctx.esc(text)}</small>${noteHtml}`
    );
  }
  // Keep the trailing space after `control` when inactive so existing markup contracts stay byte-identical.
  const single = `control ${on ? 'active' : ''}${extraClass ? ` ${extraClass}` : ''}`;
  return ctx.tile(
    action,
    `${ctx.icon(ctx.iconName(icon))}<span>${ctx.name}</span><small>${ctx.esc(text)}</small>${noteHtml}`,
    single
  );
}
