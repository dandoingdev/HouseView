// Pure data mapping: a Home Assistant media_player entity -> what the cover art face shows.
// No DOM, no Date.now, no Intl, no strings: words are chosen in index.js. The only outside rule is the shared
// same-origin artwork rule of core/media-url.js, so this overview can never load a foreign picture.
import {mediaArtUrl} from '../../core/media-url.js';

/** States in which the face stays up: a track is playing, paused, or the speaker is between two tracks. */
const LIVE = new Set(['playing', 'paused', 'buffering']);

/** The attributes that may name a picture, in the order they are tried (see artworkOf). */
const ART_ATTRIBUTES = ['entity_picture', 'entity_picture_local'];

/** One line of text from an attribute: strings and numbers only, whitespace collapsed, '' for anything else. */
export function lineOf(value) {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * The usable artwork URL (an absolute href on an allowed origin under /api/media_player_proxy/), or null.
 * `entity_picture` comes first. Home Assistant puts the remote address there when a player's pictures can be reached
 * from outside and keeps the proxy address in `entity_picture_local`: that one is tried second. A foreign address
 * is never returned, whichever attribute it sits in.
 * @param {Object} attrs   the entity's attributes
 * @param {any} hass       for the extra origin of hass.hassUrl
 * @returns {string|null}
 */
export function artworkOf(attrs, hass) {
  for (const key of ART_ATTRIBUTES) {
    const url = mediaArtUrl(attrs?.[key], hass);
    if (url) return url.href;
  }
  return null;
}

/** playing, paused or buffering: the entity is in the middle of something and the face has a reason to stay. */
export const isLive = (state) => LIVE.has(state?.state);

/**
 * @typedef {Object} CoverModel
 * @property {'playing'|'paused'|'buffering'|'idle'|'unavailable'} status
 *   idle = the entity exists but plays nothing (off, on, idle, standby); unavailable = missing, unavailable or unknown
 * @property {string} title    the track; the entity's name when it reports none; '' unless live
 * @property {string} artist   '' when unknown
 * @property {string|null} art usable same-origin artwork href, or null
 */

/**
 * @param {Object} input
 * @param {{state?: string, attributes?: Object}|undefined} input.state
 * @param {Object} [input.attrs]       state.attributes
 * @param {any} [input.hass]
 * @param {string} [input.name]        what to call the speaker when it names no track (unescaped)
 * @returns {CoverModel}
 */
export function coverModel({state, attrs = {}, hass, name = ''}) {
  const raw = state?.state;
  if (!state || !raw || raw === 'unavailable' || raw === 'unknown') {
    return {status: 'unavailable', title: '', artist: '', art: null};
  }
  if (!LIVE.has(raw)) return {status: 'idle', title: '', artist: '', art: null};
  const title = lineOf(attrs.media_title) || lineOf(attrs.media_channel);
  const artist =
    lineOf(attrs.media_artist) ||
    lineOf(attrs.media_album_artist) ||
    lineOf(attrs.media_series_title);
  return {
    status: raw,
    // a player that reports no track at all is still playing: say which one
    title: title || (artist ? '' : lineOf(name)),
    artist,
    art: artworkOf(attrs, hass)
  };
}
