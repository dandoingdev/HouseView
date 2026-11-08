import {browse, mediaRequest} from './library-data.js';

/** Only Sonos entities may use Sonos services; another speaker must never be substituted. */
export function hasSonosQueue(hass, entity) {
  const attrs = hass?.states?.[entity]?.attributes || {};
  const platform = hass?.entities?.[entity]?.platform;
  return !!(
    hass?.services?.sonos?.get_queue &&
    hass.services.sonos.play_queue &&
    (platform
      ? platform === 'sonos'
      : Number.isInteger(attrs.queue_size) && Number.isInteger(attrs.queue_position))
  );
}

export async function readQueue(hass, entity, signal) {
  const result = await mediaRequest(
    hass,
    {
      type: 'call_service',
      domain: 'sonos',
      service: 'get_queue',
      service_data: {entity_id: entity},
      return_response: true
    },
    signal
  );
  const queue = result?.response?.[entity];
  if (!Array.isArray(queue)) throw new Error('Invalid queue response');
  // Keep positions intact, including incomplete metadata and repeated tracks.
  return queue.map((item, position) => ({
    title: item.media_title || '',
    artist: item.media_artist || '',
    album: item.media_album_name || '',
    media_content_id: item.media_content_id,
    position,
    can_play: typeof item.media_content_id === 'string'
  }));
}

/** Generic players expose tracks only when their selected playlist is expandable. No library crawling. */
export async function readPlaylist(hass, entity, playlist, signal) {
  if (!playlist?.can_expand) return [];
  const result = await browse(hass, entity, playlist, signal);
  return (result.children || [])
    .filter(
      (item) =>
        !item.can_expand &&
        item.can_play === true &&
        typeof item.media_content_id === 'string' &&
        typeof item.media_content_type === 'string'
    )
    .map((item) => ({...item, artist: item.media_artist || item.artist || ''}));
}
