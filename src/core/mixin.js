// Attach plain-object mixins to a class prototype without losing getters and setters.
// `Object.assign` would call getters and copy their values; this copies the property descriptors instead.

/**
 * Copy every own property (including symbols) of each source onto `target`.
 * Throws when a name is already defined on the target, so two mixins can never silently override each other.
 * @template T
 * @param {T} target   usually `SomeClass.prototype`
 * @param {...object} sources
 * @returns {T}
 */
export function mixin(target, ...sources) {
  for (const source of sources) {
    for (const key of Reflect.ownKeys(source)) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        throw new Error(`mixin: duplicate member "${String(key)}"`);
      }
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
    }
  }
  return target;
}
