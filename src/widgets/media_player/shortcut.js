/** One stable speaker across pages while playing. Configured players are the only candidates. */
export function shortcutPlayer(ctx) {
  const widgets = ctx.config?.widgets || [];
  let playing = null;
  for (const widget of widgets) {
    if (widget.type !== 'media_player') continue;
    const state = ctx.stateOf(widget.entity)?.state;
    if (state !== 'playing') continue;
    if (widget.entity === ctx.ext.shortcutEntity) return widget;
    playing ||= widget;
  }
  return playing;
}

export function dashboardControl(ctx) {
  const widget = shortcutPlayer(ctx);
  if (!widget) return null;
  const name =
    widget.name || ctx.attrsOf(widget.entity).friendly_name || ctx.t('media_player.label');
  return {
    action: 'media-player-quick-toggle',
    entity: widget.entity,
    icon: 'pause',
    label: ctx.t('media_player.pause_speaker', {name})
  };
}

export const shortcutActions = {
  'media-player-quick-toggle': {
    guard: (ctx, id) => shortcutPlayer(ctx)?.entity === id,
    run: (ctx, id) => ctx.call('media_player', 'media_play_pause', {entity_id: id})
  }
};
