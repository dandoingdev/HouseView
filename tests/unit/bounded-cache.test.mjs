import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheValue, cachedValue} from '../../src/core/bounded-cache.js';

test('bounded caches retain false/null hits, refresh recency and dispose evicted values', () => {
  const cache = new Map();
  const disposed = [];
  const put = (key, value) => cacheValue(cache, key, value, 2, (old) => disposed.push(old));
  put('a', null);
  put('b', false);
  assert.equal(cachedValue(cache, 'a'), null);
  assert.equal(cachedValue(cache, 'missing'), undefined);
  put('c', 3);
  assert.deepEqual(
    [...cache],
    [
      ['a', null],
      ['c', 3]
    ]
  );
  assert.deepEqual(disposed, [false]);
  put('a', 4);
  put('d', 5);
  assert.deepEqual(
    [...cache],
    [
      ['a', 4],
      ['d', 5]
    ]
  );
  assert.deepEqual(disposed, [false, 3]);
});
