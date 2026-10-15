// Editor strings. English is the original literal of each label; `fallbackLabel` in form.js reads this table
// directly when core/i18n.js does not know a key yet, so the editors never show a raw key for these.
// Widget-specific labels and helpers live in each widget's strings.js (`<type>.option.<name>.label|helper`).

export default {
  en: {
    // carousel editor
    'editor.appearance': 'Appearance',
    'editor.palette': 'Palette',
    'editor.wallpaper': 'Background',
    'editor.bedtime': 'Night mode and dim button',
    'editor.high_contrast': 'High contrast',
    'editor.performance': 'Performance',
    'editor.helper.performance':
      'Automatic uses the lite look on tablets with 2 GB of memory or less, 4 cores or fewer, or an old Android WebView. Lite switches off the glass blur and decorative animation; full keeps them.',
    'editor.editor_preview': 'Preview shape',
    'editor.helper.editor_preview':
      'How this preview is drawn while you edit: as a landscape tablet (default), a portrait tablet, or auto (the box as it is). Only affects the editor.',
    'editor.automatic_displays': 'Automatic displays',
    'editor.timer_display': 'Show the timer display while a timer runs',
    'editor.music_screensaver': 'Show album art when music has been playing for a while',
    'editor.home_overview': 'Add a home button that opens the home overview',
    'editor.helper.home_overview':
      'A scrollable home screen built from the widgets on this dashboard: lights, climate and lock chips, cameras and scenes. A small home button at the bottom left opens it full screen. Set the title with home_title in YAML.',
    'editor.helper.timer_display':
      'Every timer widget on the dashboard gets a full-screen countdown while it runs. It replaces the screensaver and returns control when the timer ends. A list of timer entities in YAML replaces the widgets.',
    'editor.helper.music_screensaver':
      'Every media player widget on the dashboard can show its album cover when the screensaver would start and it is playing. Your screensaver stays the default when nothing plays. A list of media players in YAML replaces the widgets.',
    'editor.page_name': 'Page name',
    'editor.surface': 'Page background',
    'editor.columns': 'Landscape columns (optional)',
    'editor.helper.columns':
      'Maximum columns on a wide landscape screen, 2 to 5. Phones and portrait tablets always use 2.',
    'editor.camera_grid': 'Camera grid',
    'editor.camera_slot.0': 'Top left camera',
    'editor.camera_slot.1': 'Top right camera',
    'editor.camera_slot.2': 'Bottom left camera',
    'editor.camera_slot.3': 'Bottom right camera',
    'editor.add_page': 'Add page',
    'editor.stream': 'Use camera stream',
    'editor.height': 'Standalone height (pixels)',
    // shared field names (core also defines widget_type, entity, name, size and icon)
    'editor.widget_type': 'Widget type',
    'editor.entity': 'Entity',
    'editor.name': 'Label',
    'editor.size': 'Size',
    'editor.icon': 'Icon',
    // fallbacks for widget options whose strings.js has no label of its own
    'editor.note': 'Caption',
    'editor.room': 'Room / thermostat caption',
    'editor.action': 'Light tap action',
    // select option labels
    'editor.value.auto': 'Automatic',
    'editor.value.full': 'Full',
    'editor.value.lite': 'Lite (no blur, no animation)',
    'editor.value.page': 'Use page backgrounds',
    // messages
    'editor.select_camera': 'Select a camera entity.',
    'editor.camera_duplicate': 'That camera is already selected in another position.',
    'editor.page_name_invalid': 'Page names must be unique and not empty.',
    'editor.degraded':
      'Open this card in Home Assistant’s visual editor to load native forms and card editing. YAML editing remains available.',
    'editor.degraded_cards':
      'Home Assistant’s card editor is not available here. Edit this page’s cards in YAML.'
  }
};
