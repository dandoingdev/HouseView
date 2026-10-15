// States consumed by the contract and preview harnesses. The clock has no entity,
// so a variant is a widget config (and, for preview_time, a card config).
const make = (widget = {}, config) => ({widget, states: {}, ...(config ? {config} : {})});

export const variants = {
  ok: make(),
  named: make({name: 'Kitchen'}),
  // The default name is hidden; an explicit "clock" is treated the same way.
  namedClock: make({name: 'clock'}),
  hostileName: make({name: '<img src=x onerror=alert(1)> & "co"'}),
  wide: make({size: 'wide'}),
  large: make({size: 'large'}),
  previewTime: make({}, {preview_time: '2026-03-01T15:45:00'})
};
