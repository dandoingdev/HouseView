// Shared dashboard and playlist paging gesture: a quick horizontal drag.
// Fingers rarely travel perfectly flat. A small diagonal start stays undecided, a longer drag
// resolves to whichever axis is leading, and only a clearly vertical travel yields to scrolling.
// A downward drag that begins at the top of the display is the home summary, not a scroll.
export const SWIPE_CLICK_GUARD_MS = 400;
const SLOP_PX = 10;
const DISTANCE_PX = 60;
const SCROLL_LOCK_PX = 24;
const PAGE_LOCK_PX = 36;

/** How far a top-edge drag must travel down before it opens the home summary. */
export const HOME_PULL_DISTANCE_PX = 64;
const HOME_PULL_EDGE_PX = 48;
const HOME_PULL_EDGE_SHORT_PX = 72;
const HOME_PULL_SHORT_HEIGHT_PX = 640;

/**
 * Grab band at the top of the display. A short panel gets a taller band: the home button sits in the
 * navigation, so the top edge is the easier reach.
 */
export function homePullEdgePx(displayHeight) {
  return displayHeight > 0 && displayHeight <= HOME_PULL_SHORT_HEIGHT_PX
    ? HOME_PULL_EDGE_SHORT_PX
    : HOME_PULL_EDGE_PX;
}

/** @returns {'pending' | 'horizontal' | 'vertical'} */
export function swipeAxis(dx, dy) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (Math.max(adx, ady) < SLOP_PX) return 'pending';
  // The strict cone keeps a short diagonal start undecided. Once the finger has
  // actually travelled, the leading axis wins, including a natural diagonal swipe.
  if (adx > ady * 1.5 || (adx >= PAGE_LOCK_PX && adx > ady)) return 'horizontal';
  if (ady >= SCROLL_LOCK_PX && ady > adx) return 'vertical';
  return 'pending';
}

export function swipeStep(start, end, now = Date.now()) {
  if (!start) return 0;
  const dx = end.clientX - start.x;
  const dy = end.clientY - start.y;
  if (Math.abs(dx) <= DISTANCE_PX || now - start.time >= 1400) return 0;
  if (swipeAxis(dx, dy) !== 'horizontal') return 0;
  return dx < 0 ? 1 : -1;
}

/** A completed downward pull. Horizontal travel still belongs to paging. */
export function homePullRelease(dx, dy) {
  return dy >= HOME_PULL_DISTANCE_PX && swipeAxis(dx, dy) === 'vertical';
}
