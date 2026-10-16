// HA's native colour selector uses RGB arrays; existing YAML may still use hex.
export const isColour = (value) =>
  (typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) ||
  (Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));

export function colourRgb(value) {
  if (!isColour(value)) return undefined;
  if (Array.isArray(value)) return [...value];
  let hex = value.slice(1);
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

export function colourFormData(options, config) {
  return Object.fromEntries(
    Object.entries(options || {})
      .filter(([, spec]) => spec.type === 'colour')
      .map(([key, spec]) => [key, colourRgb(config[key] ?? spec.default)])
  );
}
