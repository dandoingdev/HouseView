// English is the source text and the last fallback. The caption is written in capitals on purpose (it is a label on a
// dark display), so the units carry their own case: a language can change the words, the shape stays.
export default {
  en: {
    'timer_overview.label': 'Timer display',
    'timer_overview.description':
      'A black full-screen countdown ring that appears by itself while a timer is running.',
    'timer_overview.unavailable': 'Timer unavailable',
    'timer_overview.ready': 'READY',
    'timer_overview.paused': 'PAUSED',
    'timer_overview.paused_caption': 'PAUSED · {duration}',

    'timer_overview.unit.h': '{n} H',
    'timer_overview.unit.min': '{n} MIN',
    'timer_overview.unit.sec': '{n} SEC',

    'timer_overview.aria.running': '{name}, {time} remaining',
    'timer_overview.aria.paused': '{name}, paused, {time} remaining',
    'timer_overview.aria.idle': '{name}, ready, {time}',
    'timer_overview.aria.unavailable': '{name}, unavailable'
  }
};
