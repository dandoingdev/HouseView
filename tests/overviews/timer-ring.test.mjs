import test from 'node:test';
import assert from 'node:assert/strict';
import {RING, TICKS, generateTicks, ringMarkup} from '../../src/overviews/timer/ring.js';

const dist = (a, b) => Math.hypot(a.x1 - b.x1, a.y1 - b.y1);

test('60 ticks, deterministic: the same numbers on every call', () => {
  assert.equal(TICKS.length, 60);
  assert.deepEqual(generateTicks(), generateTicks());
  assert.deepEqual([...TICKS], generateTicks());
  assert.ok(Object.isFrozen(TICKS));
});

test('tick 0 is at the top centre; the ring runs clockwise', () => {
  const first = TICKS[0];
  assert.equal(first.x1, 50);
  assert.equal(first.y1, RING.inset);
  // the next tick is to the right of the first, on the top edge
  assert.ok(TICKS[1].x1 > 50 && TICKS[1].y1 === RING.inset);
  // a quarter of the way round (15) is on the right, half way (30) at the bottom centre, 45 on the left
  assert.ok(TICKS[15].x1 > 90, 'right side');
  assert.equal(TICKS[30].x1, 50);
  assert.equal(TICKS[30].y1, 100 - RING.inset);
  assert.ok(TICKS[45].x1 < 10, 'left side');
  // the last tick is just left of the top centre
  assert.ok(TICKS[59].x1 < 50 && TICKS[59].y1 === RING.inset);
});

test('the ticks are evenly spaced by arc length: equal chord on straights, equal arc on corners', () => {
  const m = RING.inset;
  const far = 100 - m;
  const perimeter = 4 * (far - m - 2 * RING.radius) + 2 * Math.PI * RING.radius;
  const step = perimeter / 60;
  // on a straight, the gap between neighbours is the step exactly
  const straight = [TICKS[1], TICKS[2]];
  assert.ok(Math.abs(dist(straight[0], straight[1]) - step) < 0.01);
  // along the whole outline, the polyline through the tick points is within 1 % of N steps (chords are shorter on arcs)
  let sum = 0;
  for (let i = 0; i < 60; i++) sum += dist(TICKS[i], TICKS[(i + 1) % 60]);
  assert.ok(sum <= perimeter + 0.01 && sum > perimeter * 0.99, `${sum} vs ${perimeter}`);
  // every chord is at most one step and at least 99 % of it
  for (let i = 0; i < 60; i++) {
    const d = dist(TICKS[i], TICKS[(i + 1) % 60]);
    assert.ok(d <= step + 0.01 && d > step * 0.99, `gap ${i}: ${d} vs ${step}`);
  }
});

test('the outer ends lie on the rounded square: straights at the inset, corners on the arcs', () => {
  const {inset: m, radius: R} = RING;
  const far = 100 - m;
  for (const t of TICKS) {
    const edge = [t.x1 - m, far - t.x1, t.y1 - m, far - t.y1];
    const nearEdge = Math.min(...edge) < 1e-6;
    const inCorner = (cx, cy) => Math.abs(Math.hypot(t.x1 - cx, t.y1 - cy) - R) < 0.01;
    const onArc =
      (t.x1 >= far - R && t.y1 <= m + R && inCorner(far - R, m + R)) ||
      (t.x1 >= far - R && t.y1 >= far - R && inCorner(far - R, far - R)) ||
      (t.x1 <= m + R && t.y1 >= far - R && inCorner(m + R, far - R)) ||
      (t.x1 <= m + R && t.y1 <= m + R && inCorner(m + R, m + R));
    assert.ok(nearEdge || onArc, `(${t.x1}, ${t.y1}) is on the outline`);
    assert.ok(t.x1 >= m - 1e-6 && t.x1 <= far + 1e-6 && t.y1 >= m - 1e-6 && t.y1 <= far + 1e-6);
  }
});

test('every tick is perpendicular to the outline and points inward by its length', () => {
  const {inset: m, radius: R, length} = RING;
  const far = 100 - m;
  for (const t of TICKS) {
    const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
    assert.ok(Math.abs(len - length) < 0.01, 'tick length');
    // the inward end is nearer to the middle than the outer end
    assert.ok(Math.hypot(t.x2 - 50, t.y2 - 50) < Math.hypot(t.x1 - 50, t.y1 - 50) + 1e-6);
    // on a straight the tick is along the axis; on a corner it points at the arc's centre
    const dx = (t.x2 - t.x1) / len;
    const dy = (t.y2 - t.y1) / len;
    const centre = [
      [far - R, m + R],
      [far - R, far - R],
      [m + R, far - R],
      [m + R, m + R]
    ].find(
      ([cx, cy]) =>
        Math.abs(Math.hypot(t.x1 - cx, t.y1 - cy) - R) < 0.01 &&
        Math.abs(t.x1 - m) > 1e-6 &&
        Math.abs(t.x1 - far) > 1e-6 &&
        Math.abs(t.y1 - m) > 1e-6 &&
        Math.abs(t.y1 - far) > 1e-6
    );
    if (centre) {
      const toCentre = [centre[0] - t.x1, centre[1] - t.y1].map((v) => v / R);
      assert.ok(
        Math.abs(dx - toCentre[0]) < 0.01 && Math.abs(dy - toCentre[1]) < 0.01,
        'towards the arc centre'
      );
    } else {
      assert.ok(
        Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6,
        `straight tick (${dx}, ${dy}) is axis aligned`
      );
    }
  }
});

test('the rotation turns a vertical bar onto the tick axis', () => {
  for (const t of TICKS) {
    const axis = [Math.sin((t.angle * Math.PI) / 180), -Math.cos((t.angle * Math.PI) / 180)];
    const dx = t.x2 - t.x1;
    const dy = t.y2 - t.y1;
    const cross = axis[0] * dy - axis[1] * dx; // 0 when parallel
    assert.ok(Math.abs(cross) < 0.01, `tick at (${t.x1}, ${t.y1}) angle ${t.angle}`);
    assert.ok(t.angle >= -90 && t.angle < 90);
    // the centre is the midpoint of the tick
    assert.ok(
      Math.abs(t.x - (t.x1 + t.x2) / 2) < 0.001 && Math.abs(t.y - (t.y1 + t.y2) / 2) < 0.001
    );
  }
});

test('the ring is symmetric about the vertical axis', () => {
  for (let i = 1; i < 30; i++) {
    const a = TICKS[i];
    const b = TICKS[60 - i];
    assert.ok(Math.abs(a.x1 + b.x1 - 100) < 0.002, `ticks ${i} and ${60 - i}`);
    assert.ok(Math.abs(a.y1 - b.y1) < 0.002);
  }
});

test('ringMarkup lights the first n ticks and writes nothing else that changes', () => {
  for (const lit of [0, 1, 44, 60]) {
    const html = ringMarkup(lit);
    assert.equal((html.match(/<i /g) ?? []).length, 60);
    assert.equal((html.match(/ on"/g) ?? []).length, lit);
    // lit ones come first: the first dim tick is number `lit`
    const classes = [...html.matchAll(/class="ov-timer-tick( on)?"/g)].map((m) => !!m[1]);
    assert.deepEqual(
      classes,
      Array.from({length: 60}, (_, i) => i < lit)
    );
  }
  assert.equal(ringMarkup(44), ringMarkup(44));
});
