// Wallpaper looks. Teal is the folded-glass picture. The others are the same satin ribbons in different colours.
// `glass` and `soft` are drawn in CSS and are not pictures. One `wallpaper` applies behind every page.

/** Picture backgrounds (inlined wallpapers). */
export const WALLPAPER_SURFACES = ['teal', 'silver', 'champagne', 'sage', 'slate', 'dusk', 'blush'];

/** Satin ribbons: silver, champagne, and the later colourways. Teal is a different picture. */
export const SATIN_SURFACES = ['silver', 'champagne', 'sage', 'slate', 'dusk', 'blush'];

/** Every background the editor offers for the whole carousel. */
export const PAGE_SURFACES = ['glass', 'soft', ...WALLPAPER_SURFACES];

/**
 * The one background behind every page. Unknown or legacy `page` values fall back to the first page's old
 * `surface` (when still present), then teal.
 */
export function resolveWallpaper(config) {
  if (PAGE_SURFACES.includes(config?.wallpaper)) return config.wallpaper;
  const fromPage = config?.pages?.find((page) => PAGE_SURFACES.includes(page?.surface))?.surface;
  return fromPage || 'teal';
}
