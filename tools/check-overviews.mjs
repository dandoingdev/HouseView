// Overview contract linter (`npm run check:overviews`), docs/overview-api.md and 10.
//
//   node tools/check-overviews.mjs [--root=<dir>] [--kind=a,b] [--strict] [--json] [--quiet]
//
//   --root    lint <dir>/src/overviews instead of the repository
//   --kind    only these overview folders (cross checks still see every folder)
//   --strict  warnings fail the run too
//   --json    machine readable findings on stdout
//
// Exit codes: 0 clean (or nothing registered yet), 1 findings at error level, 2 the linter itself failed.
//
// Source files are parsed with acorn (a dependency of ESLint), the CSS with the small reader shared with
// tools/check-widgets.mjs. Values that need evaluation (type, order, strings) come from importing the overview in
// plain Node, which the contract requires to work without a DOM; an overview that cannot be imported is an error.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  Report,
  chain,
  classesOf,
  compoundsOf,
  exists,
  frontMatter,
  importOrReport,
  parse,
  parseCss,
  read,
  specificity,
  splitTop,
  walk
} from './check-widgets.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_FILES = [
  'index.js',
  'strings.js',
  'fixtures.js',
  'test.js',
  'README.md',
  'style.css'
];
const NO_PREFERENCE = /prefers-reduced-motion:\s*no-preference/;
/** Properties an animation may change: they stay on the compositor. */
const ANIMATABLE = new Set(['transform', 'opacity', 'animation-timing-function']);

// ---------------------------------------------------------------------------------------------------------------------
// JavaScript

/** Globals that must not be touched while a module is being imported (plain Node has none of them). */
const IMPORT_TIME_GLOBALS = new Set([
  'window',
  'document',
  'HTMLElement',
  'customElements',
  'navigator',
  'location'
]);
/** Identifiers an overview never uses, anywhere (docs/overview-api.md). */
const FORBIDDEN_IDENTIFIERS = {
  callService: 'an overview cannot call a service',
  localStorage: 'overviews keep no browser storage',
  sessionStorage: 'overviews keep no browser storage',
  fetch: 'overviews never fetch; the card owns network access',
  XMLHttpRequest: 'overviews never fetch; the card owns network access',
  setInterval: 'timed work goes through the `tick` hook on the shared ticker',
  requestAnimationFrame: 'no JS per frame: animate in CSS',
  confirm: 'an overview cannot ask for confirmation'
};
/** Member chains that are forbidden, with the reason. */
const FORBIDDEN_MEMBERS = {
  'ctx.call': 'the overview context has no `call`',
  'Math.random': 'render must be pure; use data from the context',
  'Date.now': 'use ctx.now() so preview_time and tests work',
  'window.confirm': 'an overview cannot ask for confirmation'
};
const NETWORK_URL = /\bhttps?:\/\/(?!www\.w3\.org\/)/i;

/** Call fn(node, parent, functionDepth) for every node; the depth counts enclosing functions. */
function walkDepth(node, fn, parent = null, depth = 0) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parent, depth);
  const inner = /^(Function|ArrowFunction)/.test(node.type) ? depth + 1 : depth;
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) for (const child of value) walkDepth(child, fn, node, inner);
    else if (value && typeof value.type === 'string') walkDepth(value, fn, node, inner);
  }
}

const isReference = (node, parent) =>
  node.type === 'Identifier' &&
  !(parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) &&
  !(parent?.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) &&
  !(parent?.type === 'MethodDefinition' && parent.key === node);

function checkImports(ast, file, folder, overviewsDir, report, {none = false} = {}) {
  const srcDir = path.dirname(overviewsDir);
  const bad = (spec, message, line) =>
    report.error('imports', file, `import "${spec}": ${message}`, line);
  const check = (spec, line) => {
    if (typeof spec !== 'string') return;
    if (none)
      return bad(
        spec,
        'fixtures.js imports nothing (the browser harness loads it unbundled)',
        line
      );
    if (!spec.startsWith('.')) {
      return bad(
        spec,
        'overviews have no runtime dependencies; only relative imports are allowed',
        line
      );
    }
    const target = path.resolve(path.dirname(file), spec);
    const inside = (dir) => target === dir || target.startsWith(dir + path.sep);
    if (inside(folder)) return;
    if (inside(path.join(srcDir, 'core')) || inside(path.join(overviewsDir, '_shared'))) return;
    const rel = path.relative(srcDir, target).split(path.sep);
    if (rel[0] === 'overviews') {
      return bad(
        spec,
        `crosses into another overview (${rel[1]}); share code through overviews/_shared or core`,
        line
      );
    }
    bad(
      spec,
      `${rel[0] || spec} is not importable from an overview (controller/, elements/, editor/, widgets/ are off limits)`,
      line
    );
  };
  walk(ast, (n) => {
    if (
      (n.type === 'ImportDeclaration' ||
        n.type === 'ExportAllDeclaration' ||
        (n.type === 'ExportNamedDeclaration' && n.source)) &&
      n.source
    ) {
      check(n.source.value, n.loc.start.line);
    }
    if (n.type === 'ImportExpression') {
      check(n.source.type === 'Literal' ? n.source.value : null, n.loc.start.line);
    }
  });
}

/** Forbidden identifiers, members, `new Date`, network URLs and import-time DOM access. */
function checkSource(ast, file, report) {
  walkDepth(ast, (n, parent, depth) => {
    const line = n.loc?.start.line;
    if (isReference(n, parent)) {
      if (FORBIDDEN_IDENTIFIERS[n.name]) {
        report.error('forbidden', file, `\`${n.name}\`: ${FORBIDDEN_IDENTIFIERS[n.name]}`, line);
      } else if (depth === 0 && IMPORT_TIME_GLOBALS.has(n.name)) {
        report.error(
          'import-time',
          file,
          `\`${n.name}\` is touched while the module is imported; use it inside a hook only`,
          line
        );
      }
    }
    if (n.type === 'MemberExpression') {
      const name = chain(n);
      if (name && FORBIDDEN_MEMBERS[name]) {
        report.error('forbidden', file, `\`${name}\`: ${FORBIDDEN_MEMBERS[name]}`, line);
      }
      if (!n.computed && n.property.name === 'callService') {
        report.error('forbidden', file, '`callService`: an overview cannot call a service', line);
      }
    }
    if (n.type === 'NewExpression' && n.callee.name === 'Date' && !n.arguments.length) {
      report.error(
        'forbidden',
        file,
        '`new Date()`: use ctx.now() so preview_time and tests work',
        line
      );
    }
    if (n.type === 'Literal' && typeof n.value === 'string' && NETWORK_URL.test(n.value)) {
      report.error('forbidden', file, `network URL in a string: ${n.value.slice(0, 60)}`, line);
    }
    if (n.type === 'TemplateElement' && NETWORK_URL.test(n.value.cooked ?? '')) {
      report.error('forbidden', file, 'network URL in a template string', line);
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// CSS

/** Index ranges of the `@media (prefers-reduced-motion: no-preference) {...}` blocks in the text. */
function noPreferenceRanges(text) {
  const ranges = [];
  for (const m of text.matchAll(/@media[^{]*\{/g)) {
    if (!NO_PREFERENCE.test(m[0])) continue;
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    ranges.push([m.index, i]);
  }
  return ranges;
}

/** `@keyframes name {...}` blocks: [{name, index, body}]. */
function keyframesOf(text) {
  const out = [];
  for (const m of text.matchAll(/@keyframes\s+([^\s{]+)\s*\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    out.push({name: m[1], index: m.index, body: text.slice(start, i - 1)});
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const propertiesOf = (block) => [...block.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:/g)].map((m) => m[1]);

function checkCss(kind, file, text, phases, report, {shared = false} = {}) {
  const parsed = parseCss(text);
  const owns = new Set();
  let ownsMarker = false;
  for (const m of parsed.markers) {
    const o = /@owns\s+([^*]*?)\s*(\*\/|$)/.exec(m.comment);
    if (!o) continue;
    ownsMarker = true;
    for (const c of o[1].split(/\s+/).filter(Boolean)) owns.add(c.replace(/^\./, ''));
  }
  if (!parsed.rules.length && !/@keyframes/.test(text)) {
    if (!ownsMarker)
      report.warn('css', file, 'style.css has no @owns marker; add `/* @owns <classes> */`');
    return;
  }
  if (!ownsMarker)
    report.error('css', file, 'style.css has rules but no `/* @owns <classes> */` marker');
  for (const c of owns) {
    if (!shared && !/^ov-/.test(c)) {
      report.error('css', file, `owned class "${c}" must start with ov- (docs/overview-api.md)`);
    }
  }

  // every section starts /* @phase overviews */ (a file without a marker would land in carousel-widgets)
  const phaseMarkers = parsed.markers.filter((m) => /@phase\b/.test(m.comment));
  if (!phaseMarkers.length) {
    report.error(
      'css',
      file,
      'missing `/* @phase overviews */` (an unmarked file lands in carousel-widgets)'
    );
  }
  for (const m of phaseMarkers) {
    const phase = /@phase\s+([a-z0-9-]+)/.exec(m.comment)?.[1];
    if (phase !== 'overviews') {
      report.error(
        'css',
        file,
        `@phase "${phase}": overview CSS uses the phase "overviews" only`,
        m.line
      );
    }
  }
  if (phases && !phases.includes('overviews')) {
    report.error(
      'css',
      file,
      'src/styles/phases.json has no "overviews" phase (integration patch P7)'
    );
  }
  const firstRule = Math.min(
    ...parsed.rules.map((r) => r.line),
    ...keyframesOf(text).map((k) => lineOf(text, k.index))
  );
  if (phaseMarkers.length && phaseMarkers[0].line > firstRule) {
    report.error(
      'css',
      file,
      'a rule appears before the first `@phase overviews` marker',
      firstRule
    );
  }

  for (const a of parsed.atRules) {
    if (/^@import\b/.test(a.prelude)) report.error('css', file, '@import is not allowed', a.line);
    if (/^@layer\b/.test(a.prelude)) report.error('css', file, '@layer is not allowed', a.line);
  }
  if (/feTurbulence/i.test(text))
    report.error('css', file, 'SVG filters (feTurbulence) re-rasterise on a weak GPU');

  for (const rule of parsed.rules) {
    const selectors = splitTop(rule.selector, ',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const selector of selectors) {
      // `.contrast`, `.dark` and `.perf-lite` (the card's `performance` mode) may be ancestors that only switch a condition
      const compounds = compoundsOf(selector);
      const rooted = compounds.filter((c) => !/^\.(contrast|dark|perf-lite)$/.test(c));
      const subject = rooted[rooted.length - 1] || '';
      const first = rooted[0] || '';
      const ours = (c) =>
        classesOf(c).some(
          (name) => name === 'ov' || /^ov-/.test(name) || name === 'hv-screensaver'
        );
      if (!ours(first)) {
        report.error(
          'css',
          file,
          `selector "${selector}" must be rooted at .ov, .ov-* or .hv-screensaver`,
          rule.line
        );
      }
      if (!ours(subject)) {
        report.error(
          'css',
          file,
          `selector "${selector}": its subject must be an ov-* class, never an existing class or element`,
          rule.line
        );
      }
      if (ownsMarker && !shared && !compounds.flatMap(classesOf).some((c) => owns.has(c))) {
        report.error(
          'css',
          file,
          `selector "${selector}" names no class from @owns (${[...owns].join(' ') || 'none'})`,
          rule.line
        );
      }
      const [ids, cls, types] = specificity(selector);
      if (ids || cls > 3 || (cls === 3 && types > 0)) {
        report.error(
          'css',
          file,
          `selector "${selector}" has specificity (${ids},${cls},${types}), budget is (0,3,0)`,
          rule.line
        );
      }
    }
    const body = rule.body;
    if (/!important/.test(body))
      report.error('css', file, '`!important` is not allowed in overview CSS', rule.line);
    if (/url\s*\(/i.test(body))
      report.error('css', file, 'url() is not allowed (no images, no network)', rule.line);
    if (/(^|[;\s])filter\s*:[^;]*blur\s*\(/i.test(body))
      report.error(
        'css',
        file,
        'filter: blur() re-rasterises large areas on a weak GPU',
        rule.line
      );
    if (/backdrop-filter/i.test(body))
      report.error('css', file, 'backdrop-filter is not allowed (paint budget)', rule.line);
    if (/mix-blend-mode/i.test(body))
      report.error('css', file, 'mix-blend-mode is not allowed (paint budget)', rule.line);
    for (const m of body.matchAll(/will-change\s*:\s*([^;]+)/gi)) {
      // `auto` is the default: it promotes nothing (a `.perf-lite` rule uses it to undo a promotion)
      if (!/^(auto|(transform|opacity)(\s*,\s*(transform|opacity))*)$/.test(m[1].trim())) {
        report.error(
          'css',
          file,
          `will-change: ${m[1].trim()} (only transform and opacity layers may be promoted)`,
          rule.line
        );
      }
    }
    if (/(^|[;\s])animation(-name)?\s*:/i.test(body) && !NO_PREFERENCE.test(rule.context ?? '')) {
      report.error(
        'css',
        file,
        'animations are declared only inside `@media (prefers-reduced-motion: no-preference)`',
        rule.line
      );
    }
  }

  const ranges = noPreferenceRanges(text);
  for (const k of keyframesOf(text)) {
    const line = lineOf(text, k.index);
    if (!ranges.some(([from, to]) => k.index > from && k.index < to)) {
      report.error(
        'css',
        file,
        `@keyframes ${k.name} must sit inside \`@media (prefers-reduced-motion: no-preference)\``,
        line
      );
    }
    if (!shared && !k.name.startsWith(`ov-${kind}-`)) {
      report.error('css', file, `@keyframes ${k.name}: names are ov-${kind}-*`, line);
    }
    const bad = [...new Set(propertiesOf(k.body))].filter((p) => !ANIMATABLE.has(p));
    if (bad.length) {
      report.error(
        'css',
        file,
        `@keyframes ${k.name} animates ${bad.join(', ')}; only transform and opacity may animate`,
        line
      );
    }
  }
}

/**
 * `_shared/performance.css` holds the speed rules of the card (the covered screensaver and `performance: lite`). It styles
 * existing classes on purpose, so the overview selector rules do not apply to it. What is checked instead is that it stays
 * inert: every selector is conditioned on `[data-covered]` or `.perf-lite`, nothing else (no @import, @layer, url, no
 * animations), and the file sits in the `overviews` phase.
 */
function checkPerformanceCss(file, text, report) {
  const parsed = parseCss(text);
  if (!parsed.markers.some((m) => /@phase\s+overviews\b/.test(m.comment))) {
    report.error('css', file, 'missing `/* @phase overviews */`');
  }
  for (const rule of parsed.rules) {
    for (const selector of splitTop(rule.selector, ',').map((s) => s.trim())) {
      if (!/\[data-covered\]|\.perf-lite\b/.test(selector)) {
        report.error(
          'css',
          file,
          `selector "${selector}" must be conditioned on [data-covered] or .perf-lite (the file stays inert otherwise)`,
          rule.line
        );
      }
    }
    if (/url\s*\(/i.test(rule.body)) report.error('css', file, 'url() is not allowed', rule.line);
  }
  for (const a of parsed.atRules) {
    if (/^@(import|layer|keyframes)\b/.test(a.prelude)) {
      report.error('css', file, `${a.prelude.split(/\s/)[0]} is not allowed here`, a.line);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// one overview

async function checkOverview(kind, ctx, report) {
  const {overviewsDir, phases} = ctx;
  const folder = path.join(overviewsDir, kind);
  const indexFile = path.join(folder, 'index.js');

  for (const f of REQUIRED_FILES) {
    if (!exists(path.join(folder, f)))
      report.error('files', path.join(folder, f), `missing required file ${f}`);
  }
  if (!exists(indexFile)) return null;

  const jsFiles = fs
    .readdirSync(folder)
    .filter((f) => f.endsWith('.js'))
    .sort();
  for (const f of jsFiles) {
    const file = path.join(folder, f);
    const ast = parse(read(file), file, report);
    if (!ast) continue;
    checkImports(ast, file, folder, overviewsDir, report, {none: f === 'fixtures.js'});
    // test.js runs in a browser against the bundle: it may use window, document and timers
    if (f !== 'test.js') checkSource(ast, file, report);
  }

  const mod = await importOrReport(indexFile, report, 'import');
  const def = mod?.default;
  if (mod && (!def || typeof def !== 'object' || !def.widget)) {
    report.error(
      'define-overview',
      indexFile,
      'index.js must default-export defineOverview({...})'
    );
    return null;
  }
  if (!def) return null;

  if (def.type !== kind)
    report.error('identity', indexFile, `type "${def.type}" must equal the folder name "${kind}"`);
  if (!Object.isFrozen(def))
    report.error('define-overview', indexFile, 'the module is not frozen; use defineOverview');
  if (!Number.isInteger(def.order)) report.error('identity', indexFile, 'order must be an integer');

  const stringsFile = path.join(folder, 'strings.js');
  if (exists(stringsFile)) {
    const strings = (await importOrReport(stringsFile, report, 'strings'))?.default;
    if (strings) {
      if (!strings.en) report.error('strings', stringsFile, 'strings.js must export {en: {...}}');
      const prefix = `${kind}_overview.`;
      for (const [lang, table] of Object.entries(strings)) {
        for (const key of Object.keys(table)) {
          if (!key.startsWith(prefix))
            report.error(
              'strings',
              stringsFile,
              `[${lang}] key "${key}" must start with "${prefix}"`
            );
          if (lang !== 'en' && !(key in (strings.en || {})))
            report.error('strings', stringsFile, `[${lang}] key "${key}" has no English original`);
        }
      }
      for (const key of ['label', 'description']) {
        if (!strings.en?.[prefix + key])
          report.error('strings', stringsFile, `missing English string ${prefix}${key}`);
      }
      // enum values are shown in the editor: each needs a label
      for (const [name, spec] of Object.entries(def.options ?? {})) {
        for (const value of spec.type === 'enum' || spec.type === 'enum_list' ? spec.values : []) {
          const key = `${prefix}option.${name}.value.${value}`;
          if (!strings.en?.[key])
            report.warn('strings', stringsFile, `missing editor label ${key}`);
        }
      }
    }
  }

  const readme = path.join(folder, 'README.md');
  if (exists(readme)) {
    const fm = frontMatter(read(readme));
    if (!fm) {
      report.error(
        'readme',
        readme,
        'README.md must start with a --- front matter block (type, label, entity, domains, since)'
      );
    } else {
      for (const k of ['type', 'label', 'entity', 'since']) {
        if (!fm[k]) report.error('readme', readme, `front matter lacks \`${k}\``);
      }
      if (fm.type && fm.type !== kind)
        report.error('readme', readme, `front matter type "${fm.type}" differs from the folder`);
      if (fm.label && fm.label !== def.label)
        report.error(
          'readme',
          readme,
          `front matter label "${fm.label}" differs from the definition label "${def.label}"`
        );
    }
  }

  const css = path.join(folder, 'style.css');
  if (exists(css)) checkCss(kind, css, read(css), phases, report);
  return def;
}

// ---------------------------------------------------------------------------------------------------------------------
// across overviews and the generated files

function checkCross(defs, folders, ctx, report) {
  const {overviewsDir, root} = ctx;
  const seen = {type: new Map(), order: new Map(), tag: new Map()};
  const claim = (what, key, owner, file) => {
    if (seen[what].has(key)) {
      report.error(
        'duplicates',
        file,
        `${what} "${key}" is used by both ${seen[what].get(key)} and ${owner}`
      );
    } else seen[what].set(key, owner);
  };
  for (const [name, def] of defs) {
    const file = path.join(overviewsDir, name, 'index.js');
    claim('type', def.type, name, file);
    claim('order', def.order, name, file);
    claim('tag', def.widget?.tag, name, file);
  }

  const shared = path.join(overviewsDir, '_shared');
  if (exists(shared)) {
    for (const f of fs.readdirSync(shared).filter((f) => f.endsWith('.css'))) {
      if (f === 'performance.css') {
        checkPerformanceCss(path.join(shared, f), read(path.join(shared, f)), report);
        continue;
      }
      checkCss('shared', path.join(shared, f), read(path.join(shared, f)), ctx.phases, report, {
        shared: true
      });
    }
  }

  const indexFile = path.join(overviewsDir, 'index.js');
  if (!exists(indexFile)) {
    report.error('generated', indexFile, 'src/overviews/index.js is missing; run `npm run gen`');
  } else {
    const imported = [...read(indexFile).matchAll(/from\s+['"]\.\/([\w-]+)\/index\.js['"]/g)]
      .map((m) => m[1])
      .sort();
    const missing = folders.filter((f) => !imported.includes(f));
    const extra = imported.filter((f) => !folders.includes(f));
    if (missing.length || extra.length) {
      report.error(
        'generated',
        indexFile,
        `src/overviews/index.js does not match the folders (missing: ${missing.join(', ') || 'none'}; stale: ${extra.join(', ') || 'none'}); run \`npm run gen\``
      );
    }
  }
  const manifest = path.join(root, 'tests/overviews/manifest.js');
  if (exists(manifest)) {
    const text = read(manifest);
    const missing = folders.filter(
      (f) => exists(path.join(overviewsDir, f, 'test.js')) && !text.includes(`/${f}/test.js`)
    );
    if (missing.length) {
      report.error(
        'generated',
        manifest,
        `tests/overviews/manifest.js lacks: ${missing.join(', ')}; run \`npm run gen\``
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------

export async function lint({root = REPO, kinds = null} = {}) {
  root = path.resolve(root);
  const report = new Report(root);
  const overviewsDir = path.join(root, 'src', 'overviews');
  const folders = exists(overviewsDir)
    ? fs
        .readdirSync(overviewsDir, {withFileTypes: true})
        .filter((e) => e.isDirectory() && !/^[._]/.test(e.name))
        .map((e) => e.name)
        .sort()
    : [];
  if (!folders.length) return {report, folders, checked: [], empty: true};

  let phases = null;
  const phasesFile = path.join(root, 'src/styles/phases.json');
  if (exists(phasesFile)) {
    try {
      const raw = JSON.parse(read(phasesFile));
      phases = (Array.isArray(raw) ? raw : raw.phases || []).map((p) =>
        typeof p === 'string' ? p : p.name
      );
    } catch (e) {
      report.warn('css', phasesFile, `cannot read phases.json: ${e.message}`);
    }
  }
  const ctx = {root, overviewsDir, phases};
  const defs = new Map();
  const checked = [];
  for (const name of folders) {
    if (kinds && !kinds.has(name)) continue;
    checked.push(name);
    const def = await checkOverview(name, ctx, report);
    if (def) defs.set(name, def);
  }
  checkCross(defs, folders, ctx, report);
  return {report, folders, checked, empty: false};
}

function printReport({report, checked}, {strict, quiet}) {
  const errors = report.findings.filter((f) => f.level === 'error');
  const warns = report.findings.filter((f) => f.level === 'warn');
  for (const f of report.findings) {
    if (quiet && f.level === 'warn') continue;
    console.log(
      `${f.level === 'error' ? 'error' : 'warn '} [${f.rule}] ${f.file}${f.line ? `:${f.line}` : ''}  ${f.message}`
    );
  }
  console.log(
    `check-overviews: ${checked.length} overview(s) checked, ${errors.length} error(s), ${warns.length} warning(s)${strict && warns.length ? ' (strict: warnings fail)' : ''}`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const flags = {
    strict: args.includes('--strict'),
    json: args.includes('--json'),
    quiet: args.includes('--quiet')
  };
  const kindList = opt('kind');
  try {
    const result = await lint({
      root: opt('root') || REPO,
      kinds: kindList ? new Set(kindList.split(',')) : null
    });
    if (result.empty) {
      if (flags.json) console.log(JSON.stringify({overviews: 0, findings: []}));
      else
        console.log(
          'check-overviews: no overview folders yet (src/overviews has none); nothing to check'
        );
      process.exit(0);
    }
    if (flags.json)
      console.log(
        JSON.stringify({overviews: result.checked, findings: result.report.findings}, null, 2)
      );
    else printReport(result, flags);
    const errors = result.report.findings.filter((f) => f.level === 'error').length;
    const warns = result.report.findings.filter((f) => f.level === 'warn').length;
    process.exit(errors || (flags.strict && warns) ? 1 : 0);
  } catch (e) {
    console.error(`check-overviews crashed: ${e.stack || e.message}`);
    process.exit(2);
  }
}
