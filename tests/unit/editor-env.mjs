// Node test support for the editor package. The editor imports modules from other packages (registry,
// i18n, events, config/convert, overview registry, screensaver form). When one of them does not exist yet, a
// small stand-in from ./editor-stubs is used; as soon as the real file exists it takes over, so the same tests
// then exercise the real modules.
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const stubs = path.join(path.dirname(fileURLToPath(import.meta.url)), 'editor-stubs');

// real path (relative to the repo) -> stub file
const STUBBED = new Map([
  ['src/core/registry.js', 'registry.mjs'],
  ['src/core/i18n.js', 'i18n.mjs'],
  ['src/core/events.js', 'events.mjs'],
  ['src/config/convert.js', 'convert.mjs'],
  ['src/core/overview-registry.js', 'overview-registry.mjs'],
  ['src/editor/screensaver-form.js', 'screensaver-form.mjs']
]);

export const usingStub = (relative) =>
  STUBBED.has(relative) && !fs.existsSync(path.join(root, relative));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      const relative = path.relative(root, target).split(path.sep).join('/');
      if (usingStub(relative)) {
        return {
          url: pathToFileURL(path.join(stubs, STUBBED.get(relative))).href,
          shortCircuit: true
        };
      }
    }
    return nextResolve(specifier, context);
  }
});

// The element classes extend HTMLElement at import time; Node has none. Pure helpers are all the Node tests use.
globalThis.HTMLElement ??= class HTMLElement {};
