// The photo library: lists the images of a Home Assistant media folder and turns one of them into a URL the browser
// can load. Everything goes through the frontend's own websocket (`hass.callWS`): `media_source/browse_media` for the
// folder and `media_source/resolve_media` for a signed URL. Nothing is polled; a folder listing is cached for a quarter
// of an hour and a signed URL until shortly before it expires. Pure of the DOM, so it is unit tested in Node.

export const LIST_TTL_MS = 15 * 60 * 1000;
export const URL_EXPIRES_S = 3600;
const URL_MARGIN_S = 300;
const MAX_DEPTH = 3;
const MAX_PHOTOS = 2000;

const IMAGE_NAME = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;

/**
 * Whatever the user typed or picked -> a media-source id, or '' when there is none.
 *   media-source://media_source/local/Photos   kept
 *   /media/Photos, media/Photos                -> media-source://media_source/local/Photos
 *   local/Photos, Photos                       -> media-source://media_source/local/Photos
 */
export function normalizeFolder(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.startsWith('media-source://')) return text.replace(/\/+$/, '');
  const path = text
    .replace(/^\/?media\//, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^local\//, '');
  return path ? `media-source://media_source/local/${path}` : '';
}

const isImage = (child) =>
  child.media_class === 'image' ||
  /^image\//.test(child.media_content_type || '') ||
  IMAGE_NAME.test(child.title || '') ||
  IMAGE_NAME.test(child.media_content_id || '');

const isFolder = (child) => child.media_class === 'directory' || child.can_expand === true;

/** @type {Map<string, {at: number, promise: Promise<{id: string, title: string}[]>}>} */
const lists = new Map();
/** @type {Map<string, {until: number, promise: Promise<string>}>} */
const urls = new Map();

async function browse(hass, id, recursive, depth, out) {
  const result = await hass.callWS({type: 'media_source/browse_media', media_content_id: id});
  for (const child of result?.children || []) {
    if (out.length >= MAX_PHOTOS) return;
    if (isImage(child) && !isFolder(child)) {
      out.push({id: child.media_content_id, title: child.title || ''});
    } else if (recursive && isFolder(child) && depth < MAX_DEPTH) {
      await browse(hass, child.media_content_id, recursive, depth + 1, out);
    }
  }
}

/**
 * The images of a folder, sorted by name. Cached per folder; a failed listing is not cached.
 * @returns {Promise<{id: string, title: string}[]>}
 */
export function listPhotos(hass, folder, {recursive = false, now} = {}) {
  const key = `${folder}|${recursive}`;
  const cached = lists.get(key);
  if (cached && now - cached.at < LIST_TTL_MS) return cached.promise;
  const promise = (async () => {
    const out = [];
    await browse(hass, folder, recursive, 0, out);
    return out.sort((a, b) => a.title.localeCompare(b.title, undefined, {numeric: true}));
  })();
  lists.set(key, {at: now, promise});
  promise.catch(() => lists.get(key)?.promise === promise && lists.delete(key));
  return promise;
}

/** Only this origin and Home Assistant's own may serve a photo: a folder listing cannot point the card elsewhere. */
function allowed(href, hass) {
  try {
    const url = new URL(href, window.location.origin);
    const own = [window.location.origin];
    if (typeof hass?.hassUrl === 'function') own.push(new URL(hass.hassUrl('/')).origin);
    return own.includes(url.origin) ? url.href : '';
  } catch {
    return '';
  }
}

/** A loadable URL for one photo (signed, cached until shortly before it expires). */
export function photoUrl(hass, photo, {now} = {}) {
  const cached = urls.get(photo.id);
  if (cached && now < cached.until) return cached.promise;
  const promise = (async () => {
    const result = await hass.callWS({
      type: 'media_source/resolve_media',
      media_content_id: photo.id,
      expires: URL_EXPIRES_S
    });
    const href = allowed(
      typeof hass.hassUrl === 'function' ? hass.hassUrl(result?.url) : result?.url,
      hass
    );
    if (!href) throw new Error('Photo URL is not served by Home Assistant');
    return href;
  })();
  urls.set(photo.id, {until: now + (URL_EXPIRES_S - URL_MARGIN_S) * 1000, promise});
  promise.catch(() => urls.get(photo.id)?.promise === promise && urls.delete(photo.id));
  return promise;
}

/** Deterministic shuffle: the same folder gives the same order on every device, so a card and the screensaver agree. */
export function shuffled(list, seedText) {
  let seed = 2166136261;
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Which photo is on show at `nowMs`: the wall clock decides, so every instance shows the same one and nothing drifts. */
export const slotAt = (nowMs, intervalSeconds) =>
  Math.floor(nowMs / (Math.max(1, intervalSeconds) * 1000));

/** Test hook: forget everything cached. */
export function resetPhotoCache() {
  lists.clear();
  urls.clear();
}
