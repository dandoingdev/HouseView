/** One stable speaker across pages and pause/resume. Configured players are the only candidates. */
export function shortcutPlayer(ctx) {
  const widgets = ctx.config?.widgets || [];
  let playing = null;
  let paused = null;
  for (const widget of widgets) {
    if (widget.type !== 'media_player') continue;
    const state = ctx.stateOf(widget.entity)?.state;
    if (state !== 'playing' && state !== 'paused') continue;
    if (widget.entity === ctx.ext.shortcutEntity) return widget;
    if (state === 'playing') playing ||= widget;
    else paused ||= widget;
  }
  return playing || paused;
}

export function dashboardControl(ctx) {
  const widget = shortcutPlayer(ctx);
  if (!widget) return null;
  const playing = ctx.stateOf(widget.entity)?.state === 'playing';
  const name =
    widget.name || ctx.attrsOf(widget.entity).friendly_name || ctx.t('media_player.label');
  return {
    action: 'media-player-quick-toggle',
    entity: widget.entity,
    icon: playing ? 'pause' : 'play',
    label: playing
      ? ctx.t('media_player.pause_speaker', {name})
      : ctx.t('media_player.play_speaker', {name})
  };
}

export const shortcutActions = {
  'media-player-quick-toggle': {
    guard: (ctx, id) => shortcutPlayer(ctx)?.entity === id,
    run: (ctx, id) => ctx.call('media_player', 'media_play_pause', {entity_id: id})
  }
};
