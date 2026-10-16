/** Shared chrome for entity control panels. Services still go through the ordinary action dispatcher. */
export function panelKey(ctx, {action, icon, label, cls = '', disabled = false}) {
  return `<button type="button" class="ov-panel-key ${cls}" data-action="${action}" data-entity="${ctx.esc(ctx.entityId)}" aria-label="${ctx.esc(label)}"${disabled ? ' disabled' : ''}>${ctx.icon(icon).replace('<ha-icon', '<ha-icon class="ov-panel-icon"')}</button>`;
}

/** Reserve both corners even in card mode, so the title stays centred and details always stay top right. */
export function panelHeader(ctx, mode, {closeLabel, detailsLabel, time = '', showDetails = true}) {
  const prefix = `ov-${ctx.overview}`;
  const close =
    mode === 'screensaver'
      ? panelKey(ctx, {
          action: 'overview-close',
          icon: 'close',
          label: closeLabel,
          cls: `ov-panel-close ${prefix}-close`
        })
      : '';
  const details = showDetails
    ? panelKey(ctx, {
        action: 'info',
        icon: 'dots-horizontal',
        label: detailsLabel,
        cls: `ov-panel-info ${prefix}-info`,
        disabled: !ctx.state
      })
    : '';
  return (
    `<header class="ov-panel-head ${prefix}-head">${close}<h2 class="ov-panel-title ${prefix}-title">${ctx.name}</h2>${details}` +
    (time
      ? `<span class="ov-panel-time ${prefix}-time" data-ov="time">${ctx.esc(time)}</span>`
      : '') +
    '</header>'
  );
}
