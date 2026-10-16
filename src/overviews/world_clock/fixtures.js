const base = {
  options: {entities: 'sensor.cupertino'},
  states: {
    'sensor.cupertino': {
      state: '1:47 PM',
      attributes: {friendly_name: 'Cupertino', time_zone: 'America/Los_Angeles'}
    }
  },
  config: {preview_time: '2026-10-16T20:47:00Z'},
  hass: {
    locale: {language: 'en-US', time_format: '12', time_zone: 'server'},
    config: {time_zone: 'America/New_York', unit_system: {temperature: '°C'}}
  }
};
export const variants = {
  ok: base,
  unavailable: {
    ...base,
    states: {'sensor.cupertino': {state: 'unavailable', attributes: {friendly_name: 'Cupertino'}}}
  },
  missing: {...base, states: {}},
  empty: {...base, options: {show_local: false}, states: {}},
  noLocal: {...base, options: {...base.options, show_local: false}},
  hostileName: {
    ...base,
    states: {
      'sensor.cupertino': {
        state: '1:47 PM',
        attributes: {friendly_name: '<b>City</b>', time_zone: 'America/Los_Angeles'}
      }
    }
  },
  auto: {
    ...base,
    options: {},
    states: {'sensor.singapore': {state: '04:47', attributes: {friendly_name: 'Singapore'}}}
  }
};
