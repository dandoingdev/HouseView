import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL_EDGE_PX,
  clientYForPercent,
  levelEdge,
  percentFromPointer
} from '../../src/overviews/_shared/vertical-level.js';

const rectOf = (height, top = 0) => ({top, bottom: top + height, height});

describe('vertical level edge buffer', () => {
  it('keeps a fingertip band and never spends more than a fifth of a short control', () => {
    assert.equal(levelEdge(480), LEVEL_EDGE_PX);
    assert.equal(levelEdge(320), LEVEL_EDGE_PX);
    assert.equal(levelEdge(200), 40);
    assert.equal(levelEdge(0), 0);
  });

  it('selects the extremes anywhere in the end bands, including off the glass', () => {
    const rect = rectOf(480, 10);
    assert.equal(percentFromPointer(rect, rect.top + 1), 100);
    assert.equal(percentFromPointer(rect, rect.top + LEVEL_EDGE_PX), 100);
    assert.equal(percentFromPointer(rect, rect.top - 20), 100);
    assert.equal(percentFromPointer(rect, rect.bottom - 1), 0);
    assert.equal(percentFromPointer(rect, rect.bottom - LEVEL_EDGE_PX), 0);
    assert.equal(percentFromPointer(rect, rect.bottom + 30), 0);
  });

  it('maps the live span and round-trips every percent on panel and card heights', () => {
    for (const height of [200, 320, 480, 600]) {
      const rect = rectOf(height);
      for (let percent = 0; percent <= 100; percent++) {
        assert.equal(percentFromPointer(rect, clientYForPercent(rect, percent)), percent);
      }
      assert.equal(percentFromPointer(rect, clientYForPercent(rect, 50)), 50);
    }
  });

  it('returns zero when the control has no height', () => {
    assert.equal(percentFromPointer(rectOf(0), 0), 0);
  });
});
