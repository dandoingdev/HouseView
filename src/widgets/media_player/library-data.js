export const BROWSE_MEDIA = 131072;
export const PLAY_MEDIA = 512;
export const mediaKey = (item) => JSON.stringify([item.media_content_type, item.media_content_id]);
export const selectedMode = (widget) =>
  (widget.playlist_mode || (Array.isArray(widget.playlists) ? 'selected' : 'all')) === 'selected';

/** Bounded read-only request. A stalled integration must not leave the editor or browser loading forever. */
export async function browse(hass, entity, item, signal) {
  if (typeof hass?.callWS !== 'function') throw new Error('Media browsing is unavailable.');
  if (signal?.aborted) throw new Error('Cancelled');
  let timer;
  let abort;
  try {
    return await Promise.race([
      new Promise((_, reject) => {
        abort = () => reject(new Error('Cancelled'));
        signal?.addEventListener('abort', abort, {once: true});
      }),
      hass.callWS({
        type: 'media_player/browse_media',
        entity_id: entity,
        ...(item
          ? {media_content_type: item.media_content_type, media_content_id: item.media_content_id}
          : {})
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Media browsing timed out. Try again.')), 15000);
      })
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Browse only favourites and playlist folders, never crawl a music library or expand playable playlists. */
export async function loadLibrary(hass, entity, signal) {
  const root = await browse(hass, entity, undefined, signal);
  const found = new Map();
  const seen = new Set();
  const queue = [{node: root, depth: 0}];
  let requests = 0;
  let partial = false;
  while (queue.length) {
    if (signal?.aborted) throw new Error('Cancelled');
    const {node, depth} = queue.shift();
    for (const item of node.children || []) {
      if (typeof item.media_content_id !== 'string' || typeof item.media_content_type !== 'string')
        continue;
      const key = mediaKey(item);
      if (item.can_play) {
        if (!found.has(key)) found.set(key, item);
        continue;
      }
      const relevant = /favorite|favourite|playlist/i.test(
        `${item.media_content_type} ${item.media_class} ${item.title}`
      );
      if (!item.can_expand || !relevant || seen.has(key)) continue;
      seen.add(key);
      if (depth >= 3 || requests >= 24) {
        partial = true;
        continue;
      }
      requests++;
      try {
        queue.push({node: await browse(hass, entity, item, signal), depth: depth + 1});
      } catch {
        partial = true;
      }
    }
  }
  return {items: [...found.values()], partial};
}

export function shownItems(widget, items) {
  if (!selectedMode(widget)) return items;
  const byKey = new Map(items.map((item) => [mediaKey(item), item]));
  return [...new Set(widget.playlists || [])].map(
    (key) =>
      byKey.get(key) || {
        key,
        title: 'Unavailable saved item',
        can_play: false
      }
  );
}

/** Use the thumbnail returned by HA's media browser, including the music provider's original cover URL.
 * Sonos cannot proxy favourite_item_id artwork. Never invent a proxy ID or add HA authentication to a provider URL.
 */
export async function libraryArtwork(hass, _entity, item) {
  if (typeof item?.thumbnail !== 'string' || !item.thumbnail.trim()) return null;
  try {
    const base = globalThis.window?.location?.origin || hass?.hassUrl?.('/');
    const url = new URL(item.thumbnail, base);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
