// Shared dashboard and playlist paging gesture: a quick, predominantly horizontal drag.
export const SWIPE_CLICK_GUARD_MS = 400;

export function swipeStep(start, end, now = Date.now()) {
  if (!start) return 0;
  const dx = end.clientX - start.x;
  const dy = end.clientY - start.y;
  return Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && now - start.time < 1400
    ? dx < 0
      ? 1
      : -1
    : 0;
}
