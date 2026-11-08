/** Refresh an existing Map entry's recency, including cached null/false values. */
export function cachedValue(cache, key) {
  const value = cache.get(key);
  if (cache.has(key)) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

/** Retain at most `limit` entries. Owners define the cache lifetime and optional eviction cleanup. */
export function cacheValue(cache, key, value, limit, dispose) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    const evicted = cache.get(oldest);
    cache.delete(oldest);
    dispose?.(evicted);
  }
  return value;
}
