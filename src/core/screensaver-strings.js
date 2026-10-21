// Core strings of the overview/screensaver family. Registered by core/overview-registry.js when it loads.
export default {
  en: {
    'screensaver.dismiss': 'Dismiss screensaver',
    'screensaver.more_info': 'More info: {name}',
    'screensaver.open': 'Open {name}',

    'screensaver.section': 'Screensaver',
    'screensaver.none': 'No screensaver',
    'screensaver.list_note':
      'This card has {n} screensavers. Edit the list in YAML; the first one is shown here.',
    'screensaver.field.type': 'Screensaver',
    'screensaver.field.enabled': 'Enabled',
    'screensaver.field.entity': 'Entity',
    'screensaver.field.idle_timeout': 'Start after (seconds without a touch)',
    'screensaver.field.return_timeout': 'Return to the first page (seconds)',
    'screensaver.field.start_in_edit_mode': 'Also run while editing the dashboard',
    'screensaver.helper.idle_timeout': '0 turns the automatic start off. 5 to 86400 seconds.',
    'screensaver.helper.return_timeout':
      'When a screensaver is set, the carousel returns to the first page as it appears. With no screensaver, it returns after this many seconds without a touch. 0 turns this off.'
  }
};
