// Editor strings. English is the original literal of each label; `fallbackLabel` in form.js reads this table
// directly when core/i18n.js does not know a key yet, so the editors never show a raw key for these.
// Widget-specific labels and helpers live in each widget's strings.js (`<type>.option.<name>.label|helper`).

export default {
  en: {
    // carousel editor
    'editor.line_alert_entity': 'Line disruption sensor',
    'editor.helper.line_alert_entity':
      'Choose a London Underground line-status sensor. An alert appears only for a reported disruption; tap it for details. Clear to disable.',
    'editor.line_alert_name': 'Line alert name',
    'editor.helper.line_alert_name':
      'Optional short name, such as Piccadilly. Defaults to the sensor’s friendly name.',
    'editor.show_header': 'Show time and date header',
    'editor.helper.show_header':
      'Date on the left, time centred above every page. Uses your Home Assistant language, time format and time zone.',
    'editor.tablet_mode': 'Tablet mode',
    'editor.helper.tablet_mode':
      'Hide Home Assistant’s sidebar and header on a touch panel. A desktop with a mouse keeps them so you can still edit.',
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
    'editor.doorbell_section': 'Doorbell camera',
    'editor.doorbell_entity': 'Doorbell',
    'editor.doorbell_camera': 'Camera',
    'editor.doorbell_duration': 'Show for (seconds)',
    'editor.helper.doorbell_entity':
      'A binary sensor, event, button or input boolean that goes on when the doorbell is pressed.',
    'editor.helper.doorbell_camera': 'The camera shown full screen when the doorbell rings.',
    'editor.helper.doorbell_duration':
      'How long the camera stays up. A tap on the screen closes it sooner. Default 30.',
    'editor.timer_display': 'Show the timer display while a timer runs',
    'editor.music_screensaver': 'Show album art when music has been playing for a while',
    'editor.home_section': 'Home summary',
    'editor.home_overview': 'Show a home button in the footer',
    'editor.quick_actions_section': 'Quick actions · Swipe up',
    'editor.quick_actions_swipe': 'Open quick actions with an upward swipe',
    'editor.quick_actions_title': 'Quick actions title',
    'editor.flow': 'Action type',
    'editor.quick_actions': 'Choose and order quick actions',
    'editor.helper.quick_actions':
      'Up to six shortcuts on one fixed screen. Choose Leaving home or Good night as a guided routine, or choose a light group for all lights off, or a script, scene or helper for routines and guest mode. Automatic runs scripts/scenes/buttons and toggles other entities. Swipe down to close; Alt+↑ opens with a keyboard.',
    'editor.home_swipe': 'Open the home summary with a downward swipe',
    'editor.house_modes_section': 'House modes · Swipe from left',
    'editor.house_routines_suggest': 'Use dashboard devices for readiness checks',
    'editor.house_routines_suggested':
      'Suggestions added to empty Away and Sleeping checklists. Review their expected states before saving; climate defaults to off and alarm defaults to armed away or armed home.',
    'editor.house_routines_no_suggestions':
      'No supported dashboard devices found. Add checks to Away and Sleeping below.',
    'editor.house_modes_setup': 'Set up house modes',
    'editor.helper.house_modes_setup':
      '1. Create the five-mode helper below, or choose an existing selector. 2. Choose a script for each mode and explain what it changes. 3. Save, then review and swipe right from the left edge to review and activate a mode. Creating the helper does not change your devices. Helper creation needs a Home Assistant administrator.',
    'editor.house_modes_create': 'Create house mode helper',
    'editor.house_modes_creating': 'Connecting your house mode helper…',
    'editor.house_modes_ready':
      'Helper connected. Add your mode scripts and explanations below, including Home to restore everyday behaviour.',
    'editor.house_modes_helpers': 'Open Helpers',
    'editor.house_modes_scripts': 'Create or edit scripts',
    'editor.house_mode_entity': 'House mode selector',
    'editor.helper.house_mode_entity':
      'An input_select or select with the five house modes. Choose scripts below, or use Home Assistant automations triggered by this selector.',
    'editor.house_modes': 'Mode options and explanations',
    'editor.helper.house_modes':
      'Match each option exactly to your selector. Describe the actual changes before enabling it, including Home so other modes can be ended.',
    'editor.home_title': 'Title',
    'editor.helper.home_title': 'The large heading on the home summary. Empty uses "Home".',
    'editor.home_battery_auto': 'Find low batteries automatically',
    'editor.helper.home_battery_auto':
      'Uses Home Assistant battery device classes. Shows levels at or below 20% and active low-battery sensors; hides percentage warnings while the device is charging. Hidden entities are excluded.',
    'editor.home_attention': 'House needs attention',
    'editor.helper.home_attention':
      'Choose only devices to monitor. Opening: open doors/windows; battery: at or below 20% by default; light: on for 120 minutes; device: unavailable or unknown for 5 minutes. After changes the minute threshold; Below changes the battery threshold. Tap an issue to inspect it.',
    'editor.home_bins': 'Bins sensor',
    'editor.helper.home_bins':
      'A waste_collection_schedule sensor. The home summary shows an icon for each bin going out in the next 7 days.',
    'editor.home_transport': 'Transport chips',
    'editor.helper.home_transport':
      'Departure sensors (for example from the London TfL integration). Each shows your label, the icon and the next time, and turns amber when nothing is running.',
    'editor.helper.home_overview':
      'A scrollable home screen built from the widgets on this dashboard. The button sits at the bottom left and can be hidden while the downward swipe stays on.',
    'editor.helper.home_swipe':
      'Swipe down from the top of the display to open the home summary. Turn this on by itself to skip the footer button. On a short panel the top band is taller.',
    'editor.helper.timer_display':
      'Every timer widget on the dashboard gets a full-screen countdown while it runs. It replaces the screensaver and returns control when the timer ends. A list of timer entities in YAML replaces the widgets.',
    'editor.helper.music_screensaver':
      'Every media player widget on the dashboard can show its album cover when the screensaver would start and it is playing. Your screensaver stays the default when nothing plays. A list of media players in YAML replaces the widgets.',
    'editor.page_name': 'Page name',
    'editor.columns': 'Landscape columns (optional)',
    'editor.helper.columns':
      'Maximum columns on a wide landscape screen, 2 to 5. Phones and portrait tablets always use 2.',
    'editor.camera_grid': 'Camera grid',
    'editor.camera_slot.0': 'Top left camera',
    'editor.camera_slot.1': 'Top right camera',
    'editor.camera_slot.2': 'Bottom left camera',
    'editor.camera_slot.3': 'Bottom right camera',
    'editor.add_page': 'Add page',
    'editor.remove_page': 'Remove page',
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
