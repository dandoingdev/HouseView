// Variants for tests, previews and screenshots. Data only, imports nothing. The clock is fixed by the harness.
const make = (options = {}, hass) => ({
  options,
  states: {},
  config: {preview_time: '2026-10-15T10:09:00+01:00'},
  ...(hass ? {hass} : {})
});

export const variants = {
  ok: make(),
  sunday: make({week_start: 'sunday'}),
  noTime: make({show_time: false}),
  profileSunday: make(
    {},
    {locale: {language: 'en-GB', time_format: '24', first_weekday: 'sunday'}}
  ),
  german: make({}, {locale: {language: 'de', time_format: '24'}})
};
