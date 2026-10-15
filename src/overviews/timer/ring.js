// The ring of tick marks, generated once. Plain geometry in a 100 x 100 square: tick 0 is at the top centre, the others
// follow clockwise at equal steps along a rounded square's outline (equal ARC LENGTH, so the gaps on the corners are the
// same as on the straights). Every tick lies on the line from its point on the outline towards the middle.
// No DOM, no Date, no randomness: the same numbers every time, so the markup is stable and testable.

import {TICK_COUNT} from './model.js';

/** Geometry, in percent of the stage's side (the stage is a square). */
export const RING = Object.freeze({
  count: TICK_COUNT,
  inset: 2.4, // the outer end of a tick sits this far from the stage edge
  radius: 22, // corner radius of the outline: 22 % of the side
  length: 4.6, // tick length, towards the middle
  width: 1.15 // tick thickness (rounded ends)
});

const round = (n) => Math.round(n * 1000) / 1000;

/** The outline, clockwise from the top centre: straights and quarter circles, each with its length. */
function outline({inset: m, radius: R}) {
  const far = 100 - m;
  const straight = far - m - 2 * R; // a full side minus its two corners
  const quarter = (Math.PI * R) / 2;
  const at = (cx, cy, from) => ({kind: 'arc', cx, cy, from, length: quarter});
  return [
    {kind: 'line', x: 50, y: m, dx: 1, dy: 0, nx: 0, ny: 1, length: straight / 2},
    at(far - R, m + R, -90),
    {kind: 'line', x: far, y: m + R, dx: 0, dy: 1, nx: -1, ny: 0, length: straight},
    at(far - R, far - R, 0),
    {kind: 'line', x: far - R, y: far, dx: -1, dy: 0, nx: 0, ny: -1, length: straight},
    at(m + R, far - R, 90),
    {kind: 'line', x: m, y: far - R, dx: 0, dy: -1, nx: 1, ny: 0, length: straight},
    at(m + R, m + R, 180),
    {kind: 'line', x: m + R, y: m, dx: 1, dy: 0, nx: 0, ny: 1, length: straight / 2}
  ];
}

/** The point at arc length `s` (0..perimeter) on the outline, with the unit normal pointing inward. */
function pointAt(segments, s, R) {
  let rest = s;
  for (const seg of segments) {
    if (rest > seg.length + 1e-9) {
      rest -= seg.length;
      continue;
    }
    if (seg.kind === 'line') {
      return {x: seg.x + seg.dx * rest, y: seg.y + seg.dy * rest, nx: seg.nx, ny: seg.ny};
    }
    const theta = ((seg.from + (rest / seg.length) * 90) * Math.PI) / 180;
    const c = Math.cos(theta);
    const sn = Math.sin(theta);
    return {x: seg.cx + R * c, y: seg.cy + R * sn, nx: -c, ny: -sn};
  }
  throw new Error('arc length beyond the outline');
}

/**
 * The ticks of a ring.
 * @param {typeof RING} [spec]
 * @returns {Array<{x: number, y: number, angle: number, x1: number, y1: number, x2: number, y2: number}>}
 *   x, y: the CENTRE of the tick; angle: degrees clockwise from a vertical bar (-90 <= angle < 90);
 *   (x1, y1) the outer end on the outline, (x2, y2) the inner end.
 */
export function generateTicks(spec = RING) {
  const segments = outline(spec);
  const perimeter = segments.reduce((sum, seg) => sum + seg.length, 0);
  const ticks = [];
  for (let i = 0; i < spec.count; i++) {
    const p = pointAt(segments, (i * perimeter) / spec.count, spec.radius);
    const x2 = p.x + p.nx * spec.length;
    const y2 = p.y + p.ny * spec.length;
    // a vertical bar turned clockwise by a has its axis along (sin a, -cos a): parallel to the normal
    let angle = (Math.atan2(p.nx, -p.ny) * 180) / Math.PI;
    angle = ((((angle + 90) % 180) + 180) % 180) - 90;
    ticks.push({
      x: round((p.x + x2) / 2),
      y: round((p.y + y2) / 2),
      angle: round(angle),
      x1: round(p.x),
      y1: round(p.y),
      x2: round(x2),
      y2: round(y2)
    });
  }
  return ticks;
}

/** The ring's tick geometry, computed once at import. */
export const TICKS = Object.freeze(generateTicks().map((tick) => Object.freeze(tick)));

/** Constant markup of every tick up to its class attribute, so a render only joins strings. */
const HEAD = '<i class="ov-timer-tick';
const TAILS = TICKS.map((t) => `" style="--x:${t.x};--y:${t.y};--a:${t.angle}"></i>`);

/** The 60 tick elements, the first `lit` of them with the class `on`. */
export function ringMarkup(lit) {
  let out = '';
  for (let i = 0; i < TICKS.length; i++) out += HEAD + (i < lit ? ' on' : '') + TAILS[i];
  return out;
}
