// Which image URLs a tile may load. Camera and media-player pictures arrive as `entity_picture` attributes;
// a card must only load them from its own Home Assistant, never from a foreign origin an entity might name.
//
// Allowed origins: the page's own origin and the origin of `hass.hassUrl('/')`
// (Home Assistant's configured base URL, which differs from the page origin behind some proxies).

/** The origins a picture may come from. */
export function allowedOrigins(hass) {
  const origins = new Set();
  const own = globalThis.window?.location?.origin;
  if (own) origins.add(own);
  if (typeof hass?.hassUrl === 'function') {
    try {
      origins.add(new URL(hass.hassUrl('/')).origin);
    } catch {
      /* a malformed base URL simply adds no origin */
    }
  }
  return origins;
}

/**
 * Resolve `src` against the page origin and accept it only from an allowed origin.
 * @param {string|undefined} src
 * @param {any} [hass]
 * @returns {URL|null}
 */
export function sameOriginUrl(src, hass) {
  if (typeof src !== 'string' || !src) return null;
  try {
    const url = new URL(src, globalThis.window?.location?.origin);
    return allowedOrigins(hass).has(url.origin) ? url : null;
  } catch {
    return null;
  }
}

/** A camera snapshot or stream URL: same origin and a `/camera_proxy/` path. */
export function cameraUrl(src, hass) {
  const url = sameOriginUrl(src, hass);
  return url && url.pathname.includes('/camera_proxy/') ? url : null;
}

/** Media artwork: same origin and under `/api/media_player_proxy/`. */
export function mediaArtUrl(src, hass) {
  const url = sameOriginUrl(src, hass);
  return url && url.pathname.startsWith('/api/media_player_proxy/') ? url : null;
}
