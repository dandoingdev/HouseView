/** Default full-screen controls, or Home Assistant entity settings, opened by holding a widget. */
export function settingsAction(card, widget) {
  if (widget.type === 'light') return 'light-view';
  if (widget.type === 'climate')
    return card._config.climate_view === false ? 'info' : 'climate-view';
  return widget.entity ? 'info' : null;
}
