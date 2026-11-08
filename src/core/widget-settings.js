/** Next screen opened by holding a widget, only when it differs from the pressed control's own action. */
export function settingsAction(card, widget) {
  if (widget.type === 'light') {
    // Brightness stays on hold (and the icon key) for the default view action. Toggle/off shortcuts stay tap-only.
    if (widget.action === 'toggle' || widget.action === 'off') return null;
    return 'light-view';
  }
  if (widget.type === 'climate') {
    // The temperature number opens the thermostat screen on tap; hold opens Home Assistant's dialog instead.
    // With climate_view: false the number already opens that dialog, so hold has nothing further to do.
    return card._config.climate_view === false ? null : 'info';
  }
  if (widget.type === 'plants') return 'plants-view';
  if (String(widget.entity).startsWith('scene.')) return 'scene-menu';
  return widget.entity ? 'info' : null;
}
