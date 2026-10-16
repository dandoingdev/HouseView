const make = (state = 'playing', attributes = {}) => ({
  options: {entity: 'media_player.test'},
  states: {
    'media_player.test': {
      state,
      attributes: {
        friendly_name: 'Living room speaker',
        volume_level: 0.4,
        supported_features: 12,
        ...attributes
      }
    }
  }
});
export const variants = {
  ok: make(),
  muted: make('playing', {is_volume_muted: true}),
  zero: make('paused', {volume_level: 0}),
  noVolume: make('playing', {supported_features: 0}),
  unavailable: make('unavailable'),
  unknown: make('unknown'),
  missing: {options: {entity: 'media_player.test'}, states: {}}
};
