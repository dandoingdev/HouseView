// States consumed by the contract and preview harnesses.
const entity = 'media_player.test';
const ALL = 4 | 16 | 32; // volume set, previous, next
const make = (state, attributes, widget = {}) => ({
  widget: {entity, ...widget},
  states: {[entity]: {state, attributes}}
});

export const variants = {
  ok: make('playing', {
    friendly_name: 'Kitchen speaker',
    media_title: 'Blue in Green',
    media_artist: 'Miles Davis',
    media_album_name: 'Kind of Blue',
    volume_level: 0.4,
    supported_features: ALL
  }),
  paused: make('paused', {
    media_title: 'Blue in Green',
    volume_level: 0.4,
    supported_features: ALL
  }),
  idle: make('idle', {volume_level: 0.4, supported_features: ALL}),
  off: make('off', {supported_features: ALL}),
  noVolume: make('playing', {media_title: 'Track', supported_features: 16 | 32}),
  volumeZero: make('playing', {volume_level: 0, supported_features: ALL}),
  volumeHigh: make('playing', {volume_level: 0.98, supported_features: ALL}),
  volumeFraction: make('playing', {volume_level: 0.555, supported_features: ALL}),
  prevOnly: make('playing', {supported_features: 16}),
  nextOnly: make('playing', {supported_features: 32}),
  volumeOnly: make('playing', {volume_level: 0.5, supported_features: 4}),
  noFeatures: make('playing', {media_title: 'Track'}),
  artwork: make('playing', {
    media_title: 'Track',
    entity_picture: '/api/media_player_proxy/media_player.test?token=abc&cache=1',
    supported_features: ALL
  }),
  artworkForeign: make('playing', {
    media_title: 'Track',
    entity_picture: 'https://evil.example/api/media_player_proxy/x.png',
    supported_features: ALL
  }),
  artworkOtherPath: make('playing', {
    media_title: 'Track',
    entity_picture: '/local/cover.png',
    supported_features: ALL
  }),
  named: make(
    'playing',
    {
      media_title: 'A & <b>B</b>',
      media_artist: '<i>Artist</i>',
      media_album_name: '"Album"',
      supported_features: ALL
    },
    {name: 'Den <script>'}
  ),
  // 95 s into a 154 s track, reported at the preview time so the position does not drift in tests
  progress: make('paused', {
    media_title: 'Fever Dream',
    media_artist: 'Alex Warren',
    media_duration: 154,
    media_position: 95,
    media_position_updated_at: '2026-10-15T10:00:00+01:00',
    supported_features: ALL
  }),
  shuffleRepeat: make('playing', {
    shuffle: true,
    repeat: 'all',
    supported_features: ALL | 32768 | 262144
  }),
  unavailable: make('unavailable', {}),
  unknown: make('unknown', {supported_features: ALL}),
  missing: {widget: {entity}, states: {}}
};
