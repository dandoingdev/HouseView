// Wallpaper looks. Teal is the folded-glass picture. The others are the same satin ribbons in different colours.
// `surface` on a page can also be glass or soft, which are drawn in CSS and are not wallpapers.

/** One picture behind every page (`wallpaper`), or behind one page (`surface`). */
export const WALLPAPER_SURFACES = ['teal', 'silver', 'champagne', 'sage', 'slate', 'dusk', 'blush'];

/** Satin ribbons: silver, champagne, and the later colourways. Teal is a different picture. */
export const SATIN_SURFACES = ['silver', 'champagne', 'sage', 'slate', 'dusk', 'blush'];

/** Every page background, in the order the page editor shows them. */
export const PAGE_SURFACES = ['glass', 'soft', ...WALLPAPER_SURFACES];
