// Variants for tests, previews and screenshots. Data only, imports nothing. The clock is fixed by the harness.
// The time zone is part of the fixture: the face shows the user's display zone, and CI machines run in UTC.
const base = {
  locale: {language: 'en-GB', time_format: '24', time_zone: 'server'},
  config: {time_zone: 'Europe/London', unit_system: {temperature: '°C'}}
};
const make = (options = {}, hass = {}) => ({
  options,
  states: {},
  config: {preview_time: '2026-10-15T10:09:00+01:00'},
  hass: {locale: {...base.locale, ...hass.locale}, config: base.config}
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
