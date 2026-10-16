export const VOLUME_SET = 4;
export const VOLUME_MUTE = 8;
export const canSetVolume = (attrs = {}) => !!(attrs.supported_features & VOLUME_SET);
export const canMuteVolume = (attrs = {}) => !!(attrs.supported_features & VOLUME_MUTE);

export function volumeOf(state) {
  const value = state?.attributes?.volume_level;
  return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 100) : 0;
}
