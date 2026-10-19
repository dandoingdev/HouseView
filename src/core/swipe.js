// Shared dashboard and playlist paging gesture: a quick horizontal drag.
// Fingers rarely travel perfectly flat. A small diagonal start stays undecided, a longer drag
// resolves to whichever axis is leading, and only a clearly vertical travel yields to scrolling.
export const SWIPE_CLICK_GUARD_MS = 400;
const SLOP_PX = 10;
const DISTANCE_PX = 60;
const SCROLL_LOCK_PX = 24;
const PAGE_LOCK_PX = 36;

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
