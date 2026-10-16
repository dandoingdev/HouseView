const make = (options = {}, config = {}) => ({options, states: {}, config});
export const variants = {
  ok: make(),
  sculpted: make({
    face: 'sculpted',
    background_color: '#e0bcb9',
    second_color: '#ee4eb9',
    show_date: false
  }),
  digital: make({face: 'digital', background_color: '#202725', second_color: '#b9edc7'}),
  digitalStacked: make({
    face: 'digital_stacked',
    background_color: '#e0bcb9',
    second_color: '#a33565'
  }),
  digital12: {
    ...make({face: 'digital'}, {preview_time: '2026-10-16T23:05:09Z'}),
    hass: {
      locale: {language: 'en-US', time_format: '12', time_zone: 'server'},
      config: {time_zone: 'America/New_York'}
    }
  },
  digitalNoSeconds: make({face: 'digital', show_seconds: false}),
  digitalNoDate: make({face: 'digital_stacked', show_date: false}),
  dark: make({background_color: '#202725'}),
  light: make({background_color: '#fff'}),
  noSeconds: make({show_seconds: false}),
  noDate: make({show_date: false}),
  midnight: make({}, {preview_time: '2026-10-17T00:00:00Z'})
};
