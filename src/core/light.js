/** Home Assistant brightness is 0–255; an off light may retain its last nonzero brightness. */
export function brightnessOf(state) {
  if (state?.state !== 'on') return 0;
  const value = state.attributes?.brightness;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round((Math.max(0, Math.min(255, value)) / 255) * 100)
    : 100;
}

export function canDim(attrs = {}) {
  const modes = attrs.supported_color_modes;
  if (Array.isArray(modes) && modes.length)
    return modes.some((mode) => !['onoff', 'unknown'].includes(mode));
  return !!(attrs.supported_features & 1) || Number.isFinite(attrs.brightness);
}

/** White-light RGB describes the lamp's white point, not a useful colour for the brightness fill. */
export function colorOf(attrs = {}) {
  const yellow = '#f2c200';
  if (['color_temp', 'white', 'brightness', 'onoff'].includes(attrs.color_mode)) return yellow;
  const rgb = attrs.rgb_color;
  if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every(Number.isFinite)) return yellow;
  // Near-white RGB can also arrive without color_mode (or from an RGB light set to white).
  // Keep enough contrast with the pale background to make the filled area visible.
  const channels = rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))));
  const highest = Math.max(...channels);
  if (highest === 0 || (highest - Math.min(...channels)) / highest < 0.12) return yellow;
  return `rgb(${channels.join(',')})`;
}
