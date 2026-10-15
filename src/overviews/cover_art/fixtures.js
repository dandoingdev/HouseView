// Variants for tests, previews and screenshots. Data only, imports nothing (the browser harness loads this file
// unbundled).
//
//   options  flat overview options (entity first), as in a screensaver block or an overview card
//   states   the hass.states the face reads
const entity = 'media_player.living_room';
export const ART = '/api/media_player_proxy/media_player.living_room?token=abc123&cache=7f3a';
/** Second track: Home Assistant changes the token/cache query when the picture changes. */
export const ART_NEXT = '/api/media_player_proxy/media_player.living_room?token=abc123&cache=91be';

/** @param {string} state @param {Object} [attributes] */
const player = (state, attributes = {}) => ({
  [entity]: {
    state,
    attributes: {
      friendly_name: 'Living room',
      media_title: 'Questions',
      media_artist: 'Maisie Peters',
      media_album_name: 'The Good Witch',
      entity_picture: ART,
      supported_features: 0,
      ...attributes
    }
  }
});

const make = (states) => ({options: {entity}, states});

export const variants = {
  // the reference picture: a track with a cover
  ok: make(player('playing')),

  // paused keeps the same face
  paused: make(player('paused')),

  // between two tracks
  buffering: make(player('buffering')),

  // two lines of title, clamped
  longTitle: make(
    player('playing', {
      media_title:
        'The Rise and Fall of a Midwest Princess (Deluxe Edition) [Remastered 2024] and an even longer subtitle that cannot fit',
      media_artist: 'Chappell Roan'
    })
  ),

  // one line of artist, ellipsis
  longArtist: make(
    player('playing', {
      media_title: 'Questions',
      media_artist:
        'Maisie Peters, Ed Sheeran, Gracie Abrams, Dua Lipa, Billie Eilish, Taylor Swift, Olivia Rodrigo and The Orchestra'
    })
  ),

  // text, never markup
  hostile: make(
    player('playing', {
      friendly_name: '<script>alert(1)</script>',
      media_title: '<img src=x onerror=alert(1)> & "quotes"',
      media_artist: '</p><b onclick="x()">Mallory</b>',
      entity_picture: ART
    })
  ),

  // playing but the cover is missing: dark tile with a music note, not eligible as a screensaver
  noArt: make(player('playing', {entity_picture: undefined})),

  // the picture names another origin (protocol-relative: the contract linter allows no http(s) URL in a fixture):
  // rejected, same as no artwork
  foreignArt: make(player('playing', {entity_picture: '//images.example.com/cover.jpg?id=1'})),

  // Home Assistant's remote address in entity_picture and the proxy address in entity_picture_local: the local one is used
  remoteWithLocal: make(
    player('playing', {
      entity_picture: '//images.example.com/cover.jpg?id=1',
      entity_picture_local: ART
    })
  ),

  // a player that reports no metadata at all still says which one it is
  noMetadata: make(
    player('playing', {
      media_title: undefined,
      media_artist: undefined,
      media_album_name: undefined
    })
  ),

  // nothing playing
  idle: make(player('idle')),
  off: make(player('off', {entity_picture: undefined, media_title: undefined})),
  unavailable: make({[entity]: {state: 'unavailable', attributes: {}}}),
  unknown: make({[entity]: {state: 'unknown', attributes: {}}}),
  missing: make({})
};
