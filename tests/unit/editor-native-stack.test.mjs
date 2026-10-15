import test from 'node:test';
import assert from 'node:assert/strict';
import './editor-env.mjs';

// A stand-in for the parts of the browser that native-stack.js talks to.
const defined = new Map();
const waiting = new Map();
globalThis.customElements = {
  get: (tag) => defined.get(tag),
  whenDefined: (tag) =>
    defined.has(tag) ? Promise.resolve() : new Promise((resolve) => waiting.set(tag, resolve)),
  define(tag, ctor) {
    defined.set(tag, ctor);
    waiting.get(tag)?.();
  }
};
globalThis.window = {};
const originalWarn = console.warn;

const {ensureNativeEditors, hasForm, hasStackEditor, nativeReady, whenNativeReady} =
  await import('../../src/editor/native-stack.js');

test('without loadCardHelpers nothing is loaded and nothing throws', async () => {
  assert.equal(await ensureNativeEditors(), false);
  assert.equal(nativeReady(), false);
});

test('a failing helper loader resolves false, warns, and can be retried', async () => {
  console.warn = () => {};
  let attempts = 0;
  globalThis.window.loadCardHelpers = async () => {
    attempts++;
    throw new Error('offline');
  };
  assert.equal(await ensureNativeEditors(), false);
  assert.equal(await ensureNativeEditors(), false);
  assert.equal(attempts, 2); // the failed promise was not cached
  console.warn = originalWarn;
});

test('loads the lazily defined card classes, asks each for its editor, caches the result', async () => {
  const requested = [];
  const created = [];
  globalThis.window.loadCardHelpers = async () => ({
    createCardElement(config) {
      created.push(config.type);
      // HA defines the real classes a moment later
      const tag = config.type === 'entities' ? 'hui-entities-card' : 'hui-vertical-stack-card';
      Promise.resolve().then(() =>
        globalThis.customElements.define(tag, {getConfigElement: async () => requested.push(tag)})
      );
    }
  });
  assert.equal(await ensureNativeEditors(), true);
  assert.deepEqual(created, ['entities', 'vertical-stack']);
  assert.deepEqual(requested.sort(), ['hui-entities-card', 'hui-vertical-stack-card']);
  await ensureNativeEditors();
  assert.equal(created.length, 2);
});

test('readiness follows the defined elements', async () => {
  assert.equal(hasForm(), false);
  assert.equal(await whenNativeReady(), false);
  globalThis.customElements.define('ha-form', class {});
  assert.equal(hasForm(), true);
  assert.equal(hasStackEditor(), false);
  globalThis.customElements.define('hui-stack-card-editor', class {});
  assert.equal(nativeReady(), true);
  assert.equal(await whenNativeReady(), true);
});
