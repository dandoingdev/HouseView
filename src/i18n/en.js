// Core English strings. The text is the exact literal (middle dots and ellipses included), keyed so a
// language file can replace it. Widgets keep their own strings in src/widgets/<type>/strings.js.
// `{name}` marks an interpolation.
export default {
  // States any widget may show (docs/widget-api.md)
  'state.unavailable': 'Unavailable',
  'state.offline': 'Offline',
  'common.on': 'On',
  'common.off': 'Off',
  'calendar_view.open': 'Show the calendar',

  // Service call failures: "Could not complete action: <reason>"
  'error.action': 'Could not complete action: {reason}',
  'error.try_again': 'please try again',

  // Card chrome
  'face.label': '{title} dashboard',
  'face.default_title': 'Home',
  'page.label': '{label} page',
  'nav.label': 'HouseView pages',
  'nav.previous': 'Previous page',
  'nav.next': 'Next page',
  'nav.go_to': 'Go to {label}',
  'empty.cards': 'Add cards using Edit dashboard → Edit card.',
  'native.loading': 'Loading card…',
  'dim.dim': 'Dim',
  'dim.dim_screen': 'Dim screen',
  'dim.brighter': 'Brighter',
  'dim.restore': 'Restore brightness',

  // Confirmation sheet (confirm_mode: inline)
  'confirm.default': 'Are you sure?',
  'confirm.yes': 'Confirm',
  'confirm.no': 'Cancel',

  // Editor labels shared by every widget (field names of the original editors)
  'editor.appearance': 'Appearance',
  'editor.palette': 'Palette',
  'editor.wallpaper': 'Background',
  'editor.bedtime': 'Night mode and dim button',
  'editor.high_contrast': 'High contrast',
  'editor.name': 'Label',
  'editor.page_name': 'Page name',
  'editor.surface': 'Page background',
  'editor.columns': 'Landscape columns (optional)',
  'editor.widget_type': 'Widget type',
  'editor.entity': 'Entity',
  'editor.size': 'Size',
  'editor.icon': 'Icon',
  'editor.note': 'Caption',
  'editor.room': 'Room / thermostat caption',
  'editor.action': 'Light tap action',
  'editor.height': 'Standalone height (pixels)',
  'editor.stream': 'Use camera stream',

  // Choices of the editor selects that are not widget labels
  'option.auto': 'Automatic',
  'option.page': 'Use page backgrounds'
};
