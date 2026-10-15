// Locate and load the widget registry for Node-side suites, tolerating an empty src/ tree.
//
// The engine (src/core, src/widgets) is written in parallel with these tests, so every loader here returns a
// description of what it found instead of throwing. Suites turn "nothing there yet" into a clear skip message and
// real import errors into failures.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Tree whose `src/` is under test. Defaults to the repository; HV_ROOT=/some/dir points the Node suites at another
 * tree with the same layout (used to prove the harness against a throw-away reference engine).
 */
export const ROOT = process.env.HV_ROOT ? path.resolve(process.env.HV_ROOT) : REPO_ROOT;

const urlOf = (file) => pathToFileURL(file).href;
const exists = (file) => fs.existsSync(file);

/** Folder names under src/widgets that are widgets (have an index.js; not `_shared`). */
export function widgetFolders(root = ROOT) {
  const dir = path.join(root, 'src', 'widgets');
  if (!exists(dir)) return [];
  return (
    fs
      .readdirSync(dir, {withFileTypes: true})
      .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
      .map((e) => e.name)
      // like tools/gen-widgets.mjs: a folder without index.js is not a widget (yet)
      .filter((name) => exists(path.join(dir, name, 'index.js')))
      .sort()
  );
}

/** `--kind=a,b` on argv or HV_KIND=a,b in the environment restricts suites to some kinds. */
export function kindFilter(argv = process.argv, env = process.env) {
  const arg = argv.find((a) => a.startsWith('--kind='));
  const raw = arg ? arg.slice('--kind='.length) : env.HV_KIND;
  const list = (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? new Set(list) : null;
}

async function tryImport(file) {
  if (!exists(file)) return {file, missing: true, module: null, error: null};
  try {
    return {file, missing: false, module: await import(urlOf(file)), error: null};
  } catch (error) {
    return {file, missing: false, module: null, error};
  }
}

/**
 * @typedef {Object} Loaded
 * @property {boolean} available      at least one widget definition was found
 * @property {string} reason          human readable explanation when nothing is available
 * @property {Map<string, Object>} widgets   type -> frozen definition
 * @property {Object} core            {registry, context, dispatch, defineWidget} modules (null when absent)
 * @property {{file: string, error: Error}[]} errors   import failures (real failures, not "not written yet")
 */

/**
 * @param {{root?: string}} [opts]
 * @returns {Promise<Loaded>}
 */
export async function loadRegistry({root = ROOT} = {}) {
  const errors = [];
  const core = {
    registry: null,
    context: null,
    dispatch: null,
    defineWidget: null,
    coreActions: null
  };
  const widgets = new Map();
  const note = (r) => {
    if (r.error) errors.push({file: path.relative(root, r.file), error: r.error});
    return r.module;
  };

  const folders = widgetFolders(root);
  if (!folders.length) {
    return {
      available: false,
      reason: 'src/widgets has no widget folders yet (no widgets registered yet)',
      widgets,
      core,
      errors
    };
  }

  core.registry = note(await tryImport(path.join(root, 'src/core/registry.js')));
  core.context = note(await tryImport(path.join(root, 'src/core/context.js')));
  core.dispatch = note(await tryImport(path.join(root, 'src/core/dispatch.js')));
  core.defineWidget = note(await tryImport(path.join(root, 'src/core/define-widget.js')));
  core.coreActions = note(await tryImport(path.join(root, 'src/core/core-actions.js')));

  // The generated index registers every widget (side effect) and/or exports them. Import it first.
  const index = note(await tryImport(path.join(root, 'src/widgets/index.js')));

  // A widget derived by defineOverview (def.overview) lives in src/overviews and is held to the overview
  // contract (tests/overviews/overview-contract.test.mjs), not to the widget suites (docs/overview-api.md, P9).
  const add = (def) => {
    if (
      def &&
      typeof def === 'object' &&
      !def.overview &&
      typeof def.type === 'string' &&
      typeof def.render === 'function'
    )
      widgets.set(def.type, def);
  };
  if (core.registry?.widgetList) for (const def of core.registry.widgetList()) add(def);
  if (!widgets.size && index) {
    const candidates = [index.default, index.widgets, ...Object.values(index)];
    for (const c of candidates) {
      if (Array.isArray(c)) c.forEach(add);
      else if (c && typeof c === 'object') Object.values(c).forEach(add);
    }
  }
  if (!widgets.size) {
    // last resort: import each folder's index.js default export
    for (const folder of folders) {
      const m = note(await tryImport(path.join(root, 'src/widgets', folder, 'index.js')));
      add(m?.default);
    }
  }

  if (!widgets.size) {
    const why = errors.length
      ? `import errors: ${errors.map((e) => `${e.file}: ${e.error.message}`).join('; ')}`
      : 'no definitions exported by src/widgets/index.js or core/registry.js';
    return {
      available: false,
      reason: `widget folders exist but nothing is registered (${why})`,
      widgets,
      core,
      errors
    };
  }
  return {available: true, reason: '', widgets, core, errors};
}

/** Load src/widgets/<type>/fixtures.js. Returns {variants} or {missing:true} or {error}. */
export async function loadFixtures(type, root = ROOT) {
  const r = await tryImport(path.join(root, 'src/widgets', type, 'fixtures.js'));
  if (r.missing) return {missing: true, variants: null};
  if (r.error) return {error: r.error, variants: null};
  return {
    variants: r.module.variants || null,
    error: r.module.variants ? null : new Error('fixtures.js has no `variants` export')
  };
}

export async function loadStrings(type, root = ROOT) {
  const r = await tryImport(path.join(root, 'src/widgets', type, 'strings.js'));
  if (r.missing) return {missing: true, strings: null};
  if (r.error) return {error: r.error, strings: null};
  return {strings: r.module.default || null};
}

export function readWidgetFile(type, name, root = ROOT) {
  const file = path.join(root, 'src/widgets', type, name);
  return exists(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** The built-in widget kinds, in display order. */
export const BUILT_IN_KINDS = [
  'action',
  'clock',
  'date',
  'camera',
  'climate',
  'light',
  'switch',
  'fan',
  'cover',
  'lock',
  'sensor',
  'weather',
  'media_player',
  'calendar',
  'timer',
  'alarm_control_panel'
];

export const ALIASES = ['scene', 'script', 'button', 'input_button'];
