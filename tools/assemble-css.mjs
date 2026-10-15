// Phase assembler: turns the CSS sources under src/ into ONE stylesheet whose cascade equals the original
// (docs/architecture.md).
//
// Usage: node tools/assemble-css.mjs [--root=<dir>] [--out=<file>] [--list] [--no-banners]
//   (default)  print the assembled stylesheet
//   --list     print the section order instead (phase, pin, group, file)
//   --out      write the stylesheet to a file
//
// As a module: `assembleCss({root})` -> `{css, watchFiles, sections, warnings, familySource}`; that is the
// entry point tools/build.mjs calls. `assembleSources(sources, options)` is the same thing on in-memory
// sources (used by the tests and by css-split to verify its own output).
//
// Source files are sequences of sections, each introduced by a marker comment at the top level:
//     /* @phase <name> [@pin N] */
// Sections of a file must follow the order of src/styles/phases.json. A file without any marker lands in
// `carousel-widgets` (the default phase for a new widget); an overview file must carry markers. Rules
// before the first marker are an error. `/* @owns ... */` and every other comment are inert.
//
// Assembly: for each phase in phases.json order, its sections are concatenated sorted by
//     (pin, group, sub-order, file path)
// with the groups in this order: core, layouts, surfaces, control-family, widgets, overviews. Inside
// `overviews` the `_shared` folder sorts before the kinds, kinds alphabetically. An @media/@supports/
// @container block lives inside exactly one section, so it never spans files.
//
// Expansion: `@family(<name>)` becomes `.type, .type, ...` for every widget whose definition says
// `family: '<name>'` (read from the widget modules, falling back to a text scan of the module). It is only
// meaningful inside `:is(...)`. No class is ever added to the markup for it.
//
// Hard errors (the build must not produce a stylesheet with a different cascade): unknown phase, sections out
// of order, rules outside a section, `@import`, `@layer`, `url` outside src/styles/surfaces, a `url`
// target that does not exist, a non-overview section in the overviews group and vice versa.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {blankComments, parseStylesheet} from './css-parse.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Group order of docs/architecture.md plus the `overviews` group. */
export const GROUPS = ['core', 'layouts', 'surfaces', 'control-family', 'widgets', 'overviews'];
/** Families the widget contract knows (tests/fixtures/contract-rules.mjs FAMILIES); each exists even when empty. */
export const KNOWN_FAMILIES = ['icon-tile'];
/** Phase of a file without markers. */
export const DEFAULT_PHASE = 'carousel-widgets';
export const OVERVIEWS_PHASE = 'overviews';

const posix = (p) => p.split(path.sep).join('/');
const exists = (f) => fs.existsSync(f);

// ---------------------------------------------------------------------------------------------------------------------
// Phases

/** @returns {string[]} phase names in cascade order */
export function loadPhases(root = REPO) {
  const file = path.join(root, 'src/styles/phases.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = (Array.isArray(raw) ? raw : raw.phases).map((p) =>
    typeof p === 'string' ? p : p.name
  );
  if (new Set(list).size !== list.length) throw new Error(`${file}: duplicate phase name`);
  return list;
}

// ---------------------------------------------------------------------------------------------------------------------
// Source discovery

/**
 * @typedef {Object} Source
 * @property {string} path    repo-relative, forward slashes
 * @property {string} group   one of GROUPS
 * @property {number} sub     order inside the group (overviews: `_shared` 0, kinds 1)
 * @property {string} text
 */

function listFiles(dir, predicate) {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir, {withFileTypes: true})
    .filter((e) => e.isFile() && predicate(e.name))
    .map((e) => path.join(dir, e.name))
    .sort();
}

function listKindStyles(dir) {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir, {withFileTypes: true})
    .filter((e) => e.isDirectory() && !/^[._]/.test(e.name))
    .map((e) => path.join(dir, e.name, 'style.css'))
    .filter(exists)
    .sort();
}

/** All CSS sources of a tree, unordered (ordering is the assembler's job). */
export function discoverSources(root = REPO) {
  const rel = (f) => posix(path.relative(root, f));
  const make = (group, sub) => (f) => ({
    path: rel(f),
    group,
    sub,
    text: fs.readFileSync(f, 'utf8')
  });
  const isCss = (n) => n.endsWith('.css');
  const styles = path.join(root, 'src/styles');
  const widgets = path.join(root, 'src/widgets');
  const overviews = path.join(root, 'src/overviews');
  return [
    ...listFiles(path.join(styles, 'core'), isCss).map(make('core', 0)),
    ...listFiles(path.join(styles, 'layouts'), isCss).map(make('layouts', 0)),
    ...listFiles(path.join(styles, 'surfaces'), isCss).map(make('surfaces', 0)),
    ...listFiles(styles, (n) => n === 'control-family.css').map(make('control-family', 0)),
    ...listKindStyles(widgets).map(make('widgets', 0)),
    ...listFiles(path.join(overviews, '_shared'), isCss).map(make('overviews', 0)),
    ...listKindStyles(overviews).map(make('overviews', 1))
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Families

/** `family: 'icon-tile'` and `type: 'light'` in a widget module, for when importing it is not possible. */
function scanModule(text, folder) {
  const clean = blankComments(text);
  const family = /\bfamily\s*:\s*['"]([\w-]+)['"]/.exec(clean)?.[1] ?? null;
  const type = /\btype\s*:\s*['"]([\w]+)['"]/.exec(clean)?.[1] ?? folder;
  const order = Number(/\border\s*:\s*(\d+)/.exec(clean)?.[1] ?? Infinity);
  return {type, family, order};
}

/**
 * Widget families: `{name: [type, ...]}` ordered by registry `order`, then type.
 * Each widget module is imported fresh (a definition is a plain object; nothing is registered) and read for
 * `family`; if a module cannot be imported its source is scanned instead. `source` says which happened.
 */
export async function resolveFamilies(root = REPO) {
  const dir = path.join(root, 'src/widgets');
  const rows = [];
  const how = new Set();
  const folders = exists(dir)
    ? fs
        .readdirSync(dir, {withFileTypes: true})
        .filter((e) => e.isDirectory() && !/^[._]/.test(e.name))
        .map((e) => e.name)
        .filter((name) => exists(path.join(dir, name, 'index.js')))
        .sort()
    : [];
  for (const folder of folders) {
    const file = path.join(dir, folder, 'index.js');
    try {
      const mod = await import(`${pathToFileURL(file).href}?families=${Date.now()}`);
      const def = mod.default;
      if (!def || typeof def !== 'object') throw new Error('no default export');
      rows.push({
        type: def.type ?? folder,
        family: def.family ?? null,
        order: def.order ?? Infinity
      });
      how.add('modules');
    } catch {
      rows.push(scanModule(fs.readFileSync(file, 'utf8'), folder));
      how.add('scan');
    }
  }
  const families = Object.fromEntries(KNOWN_FAMILIES.map((name) => [name, []]));
  for (const row of rows.sort((a, b) => a.order - b.order || a.type.localeCompare(b.type))) {
    if (row.family) (families[row.family] ||= []).push(row.type);
  }
  return {families, source: how.size ? [...how].sort().join('+') : 'none', widgets: folders.length};
}

/** [start, end) offsets of every comment in `text` (strings are skipped, so "/*" inside a string is not one). */
function commentRanges(text) {
  const ranges = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
      i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      const stop = close === -1 ? text.length : close + 2;
      ranges.push([i, stop]);
      i = stop;
    } else i++;
  }
  return ranges;
}

/**
 * Replace `@family(name)` outside comments. An unknown or empty family expands to `:not(*)`, which matches
 * nothing, so a selector like `:is(@family(x))` stays valid while the registry is empty.
 */
export function expandFamilies(text, families, onProblem = () => {}) {
  const comments = commentRanges(text);
  return text.replace(/@family\(\s*([A-Za-z0-9_-]+)\s*\)/g, (match, name, offset) => {
    if (comments.some(([from, to]) => offset >= from && offset < to)) return match;
    const members = families?.[name];
    if (!members) onProblem(`unknown family "${name}"`);
    return members?.length ? members.map((type) => `.${type}`).join(',') : ':not(*)';
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Sections

const MARKER = /^@phase\s+([a-z0-9-]+)(?:\s+@pin\s+(-?\d+))?$/;

/**
 * @typedef {Object} Section
 * @property {string} phase
 * @property {number} pin
 * @property {string} file       source path
 * @property {string} group
 * @property {number} sub
 * @property {number} index      position inside the file
 * @property {string} text       CSS of the section (markers removed, families not yet expanded)
 * @property {number} line       line of the marker (1 for an implicit section)
 */

/**
 * Split one source file into sections. Throws with `file:line` on any structural problem.
 * @param {Source} source
 * @param {string[]} phases
 * @returns {Section[]}
 */
export function parseSections(source, phases) {
  const {path: file, text, group, sub} = source;
  const fail = (line, message) => {
    throw new Error(`${file}:${line}: ${message}`);
  };
  let parsed;
  try {
    parsed = parseStylesheet(text);
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
  const markers = [];
  for (const node of parsed.nodes) {
    if (node.type !== 'comment') continue;
    const body = node.text.trim();
    if (!/^@(phase|pin)\b/.test(body)) continue;
    const m = MARKER.exec(body);
    if (!m)
      fail(node.line, `malformed marker "/* ${body} */"; expected /* @phase <name> [@pin N] */`);
    if (!phases.includes(m[1]))
      fail(node.line, `unknown phase "${m[1]}" (see src/styles/phases.json)`);
    markers.push({phase: m[1], pin: m[2] ? Number(m[2]) : 0, node});
  }

  const sections = [];
  if (!markers.length) {
    if (group === 'overviews') {
      fail(1, `overview CSS must start with /* @phase ${OVERVIEWS_PHASE} */`);
    }
    sections.push({phase: DEFAULT_PHASE, pin: 0, file, group, sub, index: 0, text, line: 1});
  } else {
    const head = text.slice(0, markers[0].node.start);
    const stray = parseStylesheet(head).nodes.find((n) => n.type !== 'comment');
    if (stray) fail(stray.line, 'rules before the first /* @phase */ marker');
    let last = -1;
    markers.forEach((marker, i) => {
      const rank = phases.indexOf(marker.phase);
      if (rank < last) {
        fail(
          marker.node.line,
          `phase "${marker.phase}" is out of order: sections must follow phases.json order`
        );
      }
      last = rank;
      const end = i + 1 < markers.length ? markers[i + 1].node.start : text.length;
      sections.push({
        phase: marker.phase,
        pin: marker.pin,
        file,
        group,
        sub,
        index: i,
        text: text.slice(marker.node.end, end),
        line: marker.node.line
      });
    });
  }

  for (const section of sections) {
    if (group === 'overviews' && section.phase !== OVERVIEWS_PHASE) {
      fail(
        section.line,
        `overview CSS may only use phase "${OVERVIEWS_PHASE}", found "${section.phase}"`
      );
    }
    if (group !== 'overviews' && section.phase === OVERVIEWS_PHASE) {
      fail(section.line, `phase "${OVERVIEWS_PHASE}" is reserved for src/overviews`);
    }
    validateSection(section, fail);
  }
  return sections;
}

/** Rules that would change the cascade or break the contract (docs/architecture.md). */
function validateSection(section, fail) {
  let nodes;
  try {
    nodes = parseStylesheet(section.text).nodes;
  } catch (error) {
    fail(section.line, error.message);
  }
  const visit = (list) => {
    for (const node of list) {
      if (node.type === 'statement' || node.type === 'at') {
        if (['import', 'layer', 'charset'].includes(node.name)) {
          fail(section.line + node.line - 1, `@${node.name} is not allowed`);
        }
      }
      if (node.children) visit(node.children);
      if (node.decls) {
        for (const d of node.decls) {
          if (/\burl\s*\(/i.test(d.value) && !section.file.startsWith('src/styles/surfaces/')) {
            fail(
              section.line + node.line - 1,
              `url() is only allowed in src/styles/surfaces/*.css, found in "${d.prop}"`
            );
          }
        }
      }
    }
  };
  visit(nodes);
}

/** `url(...)` targets that are not data:/http:/fragment references. */
export function urlTargets(text) {
  const out = [];
  for (const m of blankComments(text).matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
    const target = m[2].trim();
    if (target && !/^(data:|https?:|\/\/|#)/i.test(target)) out.push(target);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Assembly

const sectionOrder = (phases) => (a, b) =>
  phases.indexOf(a.phase) - phases.indexOf(b.phase) ||
  a.pin - b.pin ||
  GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) ||
  a.sub - b.sub ||
  (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
  a.index - b.index;

/**
 * Assemble in-memory sources.
 * @param {Source[]} sources
 * @param {{phases: string[], families?: Object<string,string[]>, banners?: boolean, assetRoot?: string}} options
 *        `assetRoot`: directory url targets are resolved against (src/styles); omit to skip the existence check
 * @returns {{css: string, sections: Section[], warnings: string[]}}
 */
export function assembleSources(sources, {phases, families = {}, banners = true, assetRoot} = {}) {
  const warnings = [];
  const sections = sources.flatMap((source) => parseSections(source, phases));
  sections.sort(sectionOrder(phases));
  const parts = [];
  let currentPhase = null;
  for (const section of sections) {
    const body = expandFamilies(section.text, families, (problem) =>
      warnings.push(`${section.file}: ${problem}`)
    ).trim();
    if (!blankComments(body).trim()) continue; // a section of comments only (an empty widget file)
    if (assetRoot) {
      for (const target of urlTargets(body)) {
        if (!exists(path.resolve(assetRoot, target))) {
          throw new Error(
            `${section.file}: url(${target}) does not exist (urls are relative to ${posix(path.relative(REPO, assetRoot))})`
          );
        }
      }
    }
    if (banners) {
      if (section.phase !== currentPhase) {
        parts.push(`/* ==== phase: ${section.phase} ==== */`);
        currentPhase = section.phase;
      }
      const pin = section.pin ? ` pin ${section.pin}` : '';
      parts.push(
        `/* -- ${section.file}${section.index ? ` #${section.index + 1}` : ''}${pin} -- */`
      );
    }
    parts.push(body);
  }
  return {css: `${parts.join('\n\n')}\n`, sections, warnings};
}

/**
 * Entry point for tools/build.mjs: assemble the CSS of a tree on disk.
 * @param {{root?: string, families?: Object<string,string[]>, banners?: boolean, groups?: string[]}} [options]
 *        `families` overrides the registry lookup (tests, scratch verification); `groups` limits the sources to
 *        some of GROUPS
 */
export async function assembleCss({root = REPO, families, banners = true, groups} = {}) {
  const phases = loadPhases(root);
  const sources = discoverSources(root).filter((s) => !groups || groups.includes(s.group));
  const resolved = families
    ? {families, source: 'option', widgets: 0}
    : await resolveFamilies(root);
  const assembled = assembleSources(sources, {
    phases,
    families: resolved.families,
    banners,
    assetRoot: path.join(root, 'src/styles')
  });
  // a family nobody declares expands to nothing: the shared rules that use it would match no tile
  for (const [name, members] of Object.entries(resolved.families)) {
    if (members.length || !sources.some((s) => s.text.includes(`@family(${name})`))) continue;
    assembled.warnings.push(
      resolved.widgets
        ? `family "${name}" has no members: no widget declares family: '${name}'`
        : `family "${name}" has no members: src/widgets has no modules yet`
    );
  }
  const watchFiles = [
    path.join(root, 'src/styles/phases.json'),
    ...sources.map((s) => path.join(root, s.path))
  ];
  return {...assembled, watchFiles, familySource: resolved.source, families: resolved.families};
}

export default assembleCss;

// ---------------------------------------------------------------------------------------------------------------------
// CLI

function cli(argv) {
  const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const root = arg('root') ? path.resolve(arg('root')) : REPO;
  return assembleCss({root, banners: !argv.includes('--no-banners')}).then((result) => {
    for (const warning of result.warnings) console.error(`warning: ${warning}`);
    if (argv.includes('--list')) {
      let n = 0;
      for (const s of result.sections.filter((x) => blankComments(x.text).trim())) {
        const pin = s.pin ? ` @pin ${s.pin}` : '';
        console.log(
          `${String(++n).padStart(3)}  ${s.phase.padEnd(16)} ${s.group.padEnd(14)} ${s.file}${pin}`
        );
      }
      console.log(`families: ${JSON.stringify(result.families)} (${result.familySource})`);
      return;
    }
    if (arg('out')) fs.writeFileSync(path.resolve(arg('out')), result.css);
    else process.stdout.write(result.css);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(`assemble-css: ${error.message}`);
    process.exit(1);
  });
}
