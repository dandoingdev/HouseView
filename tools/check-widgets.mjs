// Widget contract linter (`npm run check:widgets`), docs/widget-api.md
//
//   node tools/check-widgets.mjs [--root=<dir>] [--kind=a,b] [--strict] [--json] [--quiet]
//
//   --root    lint <dir>/src/widgets instead of the repository (the harness self-tests use tests/fixtures/mini-engine)
//   --kind    only these widget folders (cross-widget checks still see every folder)
//   --strict  warnings fail the run too (the escaping heuristic is a warning by default)
//   --json    machine readable findings on stdout
//
// Exit codes: 0 clean (or nothing registered yet), 1 findings at error level, 2 the linter itself failed.
//
// The static checks parse sources with acorn (already installed as a dependency of ESLint); values that need
// evaluation (type, order, aliases, action names, strings) come from importing the widget in plain Node, which the
// contract requires to work without a DOM. If a widget cannot be imported that is itself an error.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as acorn from 'acorn';
import * as rules from '../tests/fixtures/contract-rules.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------------------------------------------------
// findings

/** @typedef {{level: 'error'|'warn', rule: string, file: string, line?: number, message: string}} Finding */

export class Report {
  constructor(root) {
    this.root = root;
    /** @type {Finding[]} */
    this.findings = [];
  }
  add(level, rule, file, message, line) {
    this.findings.push({
      level,
      rule,
      file: path.relative(this.root, file).split(path.sep).join('/'),
      ...(line ? {line} : {}),
      message
    });
  }
  error(rule, file, message, line) {
    this.add('error', rule, file, message, line);
  }
  warn(rule, file, message, line) {
    this.add('warn', rule, file, message, line);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// tiny AST helpers

export function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) for (const child of value) walk(child, visit, node);
    else if (value && typeof value.type === 'string') walk(value, visit, node);
  }
}

export const propName = (p) =>
  p.key?.type === 'Identifier' && !p.computed
    ? p.key.name
    : p.key?.type === 'Literal'
      ? String(p.key.value)
      : null;
export const isFn = (n) =>
  n && ['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration'].includes(n.type);

/** `a.b.c` -> 'a.b.c' for a non-computed member chain rooted at an identifier, else null. */
export function chain(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    const left = chain(node.object);
    return left && `${left}.${node.property.name}`;
  }
  return null;
}

export function parse(source, file, report) {
  try {
    return acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true});
  } catch (e) {
    report.error('syntax', file, `cannot parse: ${e.message}`, e.loc?.line);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// render analysis

/** The object literal passed to defineWidget(...) in a module AST. */
function definitionObject(ast) {
  let found = null;
  walk(ast, (n) => {
    if (
      !found &&
      n.type === 'CallExpression' &&
      n.callee.type === 'Identifier' &&
      n.callee.name === 'defineWidget' &&
      n.arguments[0]?.type === 'ObjectExpression'
    )
      found = n.arguments[0];
  });
  return found;
}

/** render function node plus every same-file helper function reachable from it. */
function renderFunctions(ast, definition) {
  const renderProp = definition?.properties.find(
    (p) => p.type === 'Property' && propName(p) === 'render'
  );
  if (!renderProp || !isFn(renderProp.value)) return [];
  const helpers = new Map();
  for (const stmt of ast.body) {
    const decl =
      stmt.type === 'ExportNamedDeclaration' && stmt.declaration ? stmt.declaration : stmt;
    if (decl.type === 'FunctionDeclaration') helpers.set(decl.id.name, decl);
    if (decl.type === 'VariableDeclaration') {
      for (const d of decl.declarations)
        if (d.id.type === 'Identifier' && isFn(d.init)) helpers.set(d.id.name, d.init);
    }
  }
  const out = [renderProp.value];
  const seen = new Set();
  for (let i = 0; i < out.length; i++) {
    walk(out[i], (n, parent) => {
      if (n.type !== 'Identifier' || seen.has(n.name) || !helpers.has(n.name)) return;
      if (parent?.type === 'MemberExpression' && parent.property === n && !parent.computed) return;
      seen.add(n.name);
      out.push(helpers.get(n.name));
    });
  }
  return out;
}

const RAW_ROOTS = new Set(['widget', 'attrs', 'state', 'a', 's', 'w', 'attributes']);
const SAFE_CTX = new Set(['name', 'cls', 'attr', 'size', 'index', 'type', 'ok', 'entityId']);
const SAFE_CALLS = new Set([
  'ctx.esc',
  'esc',
  'ctx.icon',
  'icon',
  'ctx.btn',
  'btn',
  'ctx.tile',
  'tile',
  'ctx.root',
  'root',
  'String',
  'Number',
  'Boolean',
  'parseInt',
  'parseFloat'
]);
const UNESCAPED_CALLS = new Set(['ctx.t', 't', 'ctx.stateText', 'stateText', 'ctx.unit', 'unit']);

/** Why an interpolated expression looks like unescaped user data, or null. */
function unsafeReason(node) {
  if (!node) return null;
  switch (node.type) {
    case 'CallExpression': {
      const callee = chain(node.callee);
      if (callee && SAFE_CALLS.has(callee)) return null;
      if (callee && callee.startsWith('Math.')) return null;
      if (callee && UNESCAPED_CALLS.has(callee))
        return `${callee}() output must be wrapped in ctx.esc()`;
      if (node.callee.type === 'MemberExpression') {
        const method = node.callee.property.name;
        if (method === 'join' || method === 'map') return null;
        return unsafeReason(node.callee.object);
      }
      return null;
    }
    case 'MemberExpression': {
      const c = chain(node);
      if (!c) return null;
      const [root, second] = c.split('.');
      if (root === 'ctx') {
        if (SAFE_CTX.has(second)) return null;
        if (second === 'rawName')
          return 'ctx.rawName is unescaped, use ctx.name or ctx.esc(ctx.rawName)';
        if (['widget', 'attrs', 'state'].includes(second))
          return `${c} is raw entity/config data, wrap in ctx.esc()`;
        return null;
      }
      return RAW_ROOTS.has(root) ? `${c} is raw entity/config data, wrap in ctx.esc()` : null;
    }
    case 'ConditionalExpression':
      return unsafeReason(node.consequent) || unsafeReason(node.alternate);
    case 'LogicalExpression':
      return unsafeReason(node.left) || unsafeReason(node.right);
    case 'BinaryExpression':
      return node.operator === '+' ? unsafeReason(node.left) || unsafeReason(node.right) : null;
    case 'TemplateLiteral':
      for (const e of node.expressions) {
        const r = unsafeReason(e);
        if (r) return r;
      }
      return null;
    default:
      return null;
  }
}

function checkRender(ast, file, type, report) {
  const definition = definitionObject(ast);
  if (!definition) {
    report.error('define-widget', file, 'index.js must default-export defineWidget({...})');
    return;
  }
  const functions = renderFunctions(ast, definition);
  if (!functions.length) {
    report.error('render', file, 'defineWidget() has no render function');
    return;
  }
  const dateExempt = rules.RENDER_DATE_EXEMPT.includes(type);
  const forbidden = new Set(rules.RENDER_FORBIDDEN.identifiers);
  const reported = new Set();
  const flag = (rule, node, message, level = 'error') => {
    const key = `${rule}:${node.loc.start.line}:${message}`;
    if (reported.has(key)) return;
    reported.add(key);
    report.add(level, rule, file, message, node.loc.start.line);
  };
  for (const fn of functions) {
    walk(fn, (n, parent) => {
      if (n.type === 'Identifier') {
        const isKey =
          (parent?.type === 'MemberExpression' && parent.property === n && !parent.computed) ||
          (parent?.type === 'Property' &&
            parent.key === n &&
            !parent.computed &&
            !parent.shorthand);
        if (isKey) return;
        if (forbidden.has(n.name))
          flag(
            'render-purity',
            n,
            `render must not reference \`${n.name}\` (use ctx helpers; side effects belong in hooks)`
          );
        if (n.name === 'Date')
          flag(
            'render-purity',
            n,
            'render must not read the clock: use ctx.now()',
            dateExempt ? 'warn' : 'error'
          );
        if (n.name === 'Intl' && !dateExempt)
          flag(
            'render-purity',
            n,
            'render uses Intl directly; formatting must go through ctx (locale, time zone)',
            'warn'
          );
      }
      if (n.type === 'MemberExpression') {
        const c = chain(n);
        if (c && rules.RENDER_FORBIDDEN.members.includes(c) && !(dateExempt && c === 'Date.now'))
          flag('render-purity', n, `render must not use \`${c}\``);
        if (
          c === 'ctx.card' ||
          (n.object.type === 'Identifier' && n.object.name === 'ctx' && n.property.name === 'card')
        )
          flag('render-purity', n, 'ctx.card is not part of the widget API');
      }
      if (
        (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression') ||
        (n.type === 'UpdateExpression' && n.argument.type === 'MemberExpression')
      ) {
        const target = n.type === 'AssignmentExpression' ? n.left : n.argument;
        let root = target;
        while (root.type === 'MemberExpression') root = root.object;
        if (
          root.type === 'Identifier' &&
          ['ctx', 'hass', 'config', 'widget', 'attrs', 'state'].includes(root.name)
        )
          flag(
            'render-purity',
            n,
            `render must not mutate its inputs (${chain(target) || root.name})`
          );
      }
      if (
        n.type === 'ObjectPattern' &&
        n.properties.some((p) => p.type === 'Property' && propName(p) === 'card')
      )
        flag('render-purity', n, 'destructuring `card` from the context is not allowed');
      if (n.type === 'TemplateLiteral') {
        for (const e of n.expressions) {
          const reason = unsafeReason(e);
          if (reason) flag('escape', e, reason, 'warn');
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// imports

function checkImports(ast, file, folder, widgetsDir, report) {
  const srcDir = path.dirname(widgetsDir);
  const bad = (spec, message, line) =>
    report.error('imports', file, `import "${spec}": ${message}`, line);
  const check = (spec, line) => {
    if (typeof spec !== 'string') return;
    if (!spec.startsWith('.'))
      return bad(
        spec,
        'widgets have no runtime dependencies; only relative imports from ../../core, ../_shared and the widget folder are allowed',
        line
      );
    const target = path.resolve(path.dirname(file), spec);
    const inside = (dir) => target === dir || target.startsWith(dir + path.sep);
    if (inside(folder)) return;
    if (inside(path.join(srcDir, 'core')) || inside(path.join(widgetsDir, '_shared'))) return;
    const rel = path.relative(srcDir, target).split(path.sep);
    if (rel[0] === 'widgets')
      return bad(
        spec,
        `crosses into another widget (${rel[1]}); share code through widgets/_shared or core`,
        line
      );
    bad(
      spec,
      `${rel[0] || spec} is not importable from a widget (controller/, elements/, editor/ and friends are off limits)`,
      line
    );
  };
  walk(ast, (n) => {
    if (
      (n.type === 'ImportDeclaration' ||
        n.type === 'ExportAllDeclaration' ||
        (n.type === 'ExportNamedDeclaration' && n.source)) &&
      n.source
    )
      check(n.source.value, n.loc.start.line);
    if (n.type === 'ImportExpression')
      check(n.source.type === 'Literal' ? n.source.value : null, n.loc.start.line);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// strings

function stringKeysUsed(ast) {
  const keys = [];
  walk(ast, (n) => {
    if (n.type !== 'CallExpression') return;
    const callee = chain(n.callee);
    if (callee !== 'ctx.t' && callee !== 't') return;
    const first = n.arguments[0];
    if (first?.type === 'Literal' && typeof first.value === 'string')
      keys.push({key: first.value, line: n.loc.start.line});
    else if (first?.type === 'TemplateLiteral' && !first.expressions.length)
      keys.push({key: first.quasis[0].value.cooked, line: n.loc.start.line});
    else if (first) keys.push({key: null, line: n.loc.start.line});
  });
  return keys;
}

function checkStrings(type, ast, file, strings, report) {
  const en = strings?.en;
  for (const {key, line} of stringKeysUsed(ast)) {
    if (key === null) {
      report.warn(
        'strings',
        file,
        'ctx.t() called with a computed key; keep keys literal so they can be checked',
        line
      );
      continue;
    }
    const core =
      rules.CORE_STRING_KEYS.includes(key) ||
      rules.CORE_STRING_PREFIXES.some((p) => key.startsWith(p));
    if (!core && !key.startsWith(`${type}.`))
      report.error(
        'strings',
        file,
        `string key "${key}" must start with "${type}." (or be a core key)`,
        line
      );
    else if (!core && en && !(key in en))
      report.error('strings', file, `string key "${key}" is missing from strings.js (en)`, line);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// CSS

/** Split text on a separator at paren/bracket depth 0. */
export function splitTop(text, separators) {
  const out = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const c of text) {
    if (quote) {
      current += c;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      current += c;
    } else if (c === '(' || c === '[') {
      depth++;
      current += c;
    } else if (c === ')' || c === ']') {
      depth--;
      current += c;
    } else if (depth === 0 && separators.includes(c)) {
      out.push(current);
      current = '';
    } else current += c;
  }
  out.push(current);
  return out;
}

/** Minimal CSS reader: rules with line numbers, nested @media/@supports, comment markers. */
export function parseCss(text) {
  const rulesOut = [];
  const markers = [];
  const atRules = [];
  const lineAt = (i) => text.slice(0, i).split('\n').length;
  function readBlock(start, end, context) {
    let i = start;
    let lastComment = '';
    while (i < end) {
      const rest = text.slice(i, end);
      const ws = /^\s+/.exec(rest);
      if (ws) {
        i += ws[0].length;
        continue;
      }
      if (rest.startsWith('/*')) {
        const close = text.indexOf('*/', i + 2);
        const stop = close === -1 ? end : close + 2;
        const comment = text.slice(i, stop);
        lastComment = comment;
        if (/@phase|@pin|@owns/.test(comment)) markers.push({comment, line: lineAt(i), context});
        i = stop;
        continue;
      }
      // prelude up to '{' or ';'
      let j = i;
      let depth = 0;
      let quote = null;
      while (j < end) {
        const c = text[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (depth === 0 && (c === '{' || c === ';')) break;
        j++;
      }
      const prelude = text.slice(i, j).trim();
      if (text[j] === ';' || j >= end) {
        if (prelude) atRules.push({prelude, line: lineAt(i)});
        i = j + 1;
        continue;
      }
      // matching close brace
      let level = 1;
      let k = j + 1;
      quote = null;
      while (k < end && level > 0) {
        const c = text[k];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '/' && text[k + 1] === '*') {
          const close = text.indexOf('*/', k + 2);
          k = close === -1 ? end : close + 1;
        } else if (c === '{') level++;
        else if (c === '}') level--;
        k++;
      }
      const body = text.slice(j + 1, k - 1);
      if (prelude.startsWith('@')) {
        atRules.push({prelude, line: lineAt(i)});
        if (/^@(media|supports|container)\b/.test(prelude)) readBlock(j + 1, k - 1, prelude);
      } else {
        rulesOut.push({
          selector: prelude,
          body,
          line: lineAt(i),
          precedingComment: lastComment,
          context
        });
      }
      lastComment = '';
      i = k;
    }
  }
  readBlock(0, text.length, null);
  return {rules: rulesOut, markers, atRules};
}

export const compoundsOf = (selector) =>
  splitTop(selector.replace(/\s*([>+~])\s*/g, ' $1 '), ' ').filter(
    (s) => s && !['>', '+', '~'].includes(s)
  );
export const classesOf = (compound) =>
  [...compound.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);

/** (ids, classes+attrs+pseudo-classes, types). Rough: good enough for the (0,3,0) budget warning. */
export function specificity(selector) {
  const s = selector
    .replace(/:(is|where|not|has)\(/g, '(')
    .replace(/::?[\w-]+(\([^)]*\))?/g, (m) => (m.startsWith('::') ? ' x' : '.p'));
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const cls = (s.match(/\.[\w-]+/g) || []).length + (s.match(/\[[^\]]*\]/g) || []).length;
  const types = (
    s
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[.#][\w-]+/g, '')
      .match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g) || []
  ).length;
  return [ids, cls, types];
}

function checkCss(type, file, text, phases, report) {
  const parsed = parseCss(text);
  const owns = new Set();
  let ownsMarker = false;
  for (const m of parsed.markers) {
    const o = /@owns\s+([^*]*?)\s*(\*\/|$)/.exec(m.comment);
    if (o) {
      ownsMarker = true;
      o[1]
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => owns.add(c.replace(/^\./, '')));
    }
  }
  if (!parsed.rules.length) {
    if (!ownsMarker)
      report.warn(
        'css',
        file,
        'style.css has no @owns marker; add `/* @owns <classes> */` even if the file has no rules yet'
      );
    return;
  }
  if (!ownsMarker)
    report.error(
      'css',
      file,
      'style.css has rules but no `/* @owns <classes> */` marker',
      parsed.rules[0].line
    );

  // phase markers: known names, in order
  let lastIndex = -1;
  for (const m of parsed.markers) {
    const p = /@phase\s+([a-z0-9-]+)/.exec(m.comment);
    if (!p) continue;
    if (phases) {
      const idx = phases.indexOf(p[1]);
      if (idx === -1)
        report.error(
          'css',
          file,
          `unknown @phase "${p[1]}" (not in src/styles/phases.json)`,
          m.line
        );
      else if (idx < lastIndex)
        report.error(
          'css',
          file,
          `@phase "${p[1]}" is out of order: sections must follow phases.json order`,
          m.line
        );
      else lastIndex = idx;
    }
  }

  for (const a of parsed.atRules) {
    if (/^@import\b/.test(a.prelude)) report.error('css', file, '@import is not allowed', a.line);
    if (/^@layer\b/.test(a.prelude)) report.error('css', file, '@layer is not allowed', a.line);
  }

  for (const rule of parsed.rules) {
    const selectors = splitTop(rule.selector, ',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const selector of selectors) {
      const compounds = compoundsOf(selector);
      const subject = compounds[compounds.length - 1] || '';
      const all = compounds.flatMap(classesOf);
      if (ownsMarker && !all.some((c) => owns.has(c)))
        report.error(
          'css',
          file,
          `selector "${selector}" names no class from @owns (${[...owns].join(' ') || 'none'})`,
          rule.line
        );
      for (const c of classesOf(subject)) {
        if (/^surface-|^layout-/.test(c) || c === 'night-mode')
          report.error(
            'css',
            file,
            `selector "${selector}": a surface/layout/night class must not be the subject`,
            rule.line
          );
      }
      const [ids, cls, types] = specificity(selector);
      if (ids || cls > 3 || (cls === 3 && types > 0))
        report.warn(
          'css',
          file,
          `selector "${selector}" has specificity (${ids},${cls},${types}), budget is (0,3,0)`,
          rule.line
        );
    }
    if (/!important/.test(rule.body) && !/@important/.test(rule.precedingComment + rule.body))
      report.error(
        'css',
        file,
        '`!important` needs a `/* @important <reason> */` comment',
        rule.line
      );
    if (/url\s*\(/i.test(rule.body))
      report.error('css', file, 'url() is only allowed in surfaces/*.css', rule.line);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// per-widget checks

export const exists = (f) => fs.existsSync(f);
export const read = (f) => fs.readFileSync(f, 'utf8');

export function frontMatter(markdown) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!m) return null;
  return Object.fromEntries(
    m[1]
      .split('\n')
      .map((l) => l.split(/:\s*/))
      .filter((p) => p.length >= 2)
      .map(([k, ...v]) => [k.trim(), v.join(': ').trim()])
  );
}

export async function importOrReport(file, report, rule) {
  try {
    return await import(`${pathToFileURL(file).href}?lint=${Date.now()}`);
  } catch (error) {
    report.error(
      rule,
      file,
      `cannot import in plain Node (widgets must not touch the DOM at import time): ${error.message.split('\n')[0]}`
    );
    return null;
  }
}

async function checkWidget(folderName, ctx, report) {
  const {widgetsDir, phases} = ctx;
  const folder = path.join(widgetsDir, folderName);
  const indexFile = path.join(folder, 'index.js');

  for (const f of ['index.js', 'strings.js', 'fixtures.js', 'test.js', 'README.md', 'style.css']) {
    if (!exists(path.join(folder, f)))
      report.error('files', path.join(folder, f), `missing required file ${f}`);
  }
  if (!exists(indexFile)) return null;

  // sources: static checks on every .js in the folder (parts included)
  const jsFiles = fs
    .readdirSync(folder)
    .filter((f) => f.endsWith('.js'))
    .sort();
  const asts = {};
  for (const f of jsFiles) {
    const file = path.join(folder, f);
    const ast = parse(read(file), file, report);
    if (!ast) continue;
    asts[f] = ast;
    checkImports(ast, file, folder, widgetsDir, report);
  }
  if (asts['index.js']) checkRender(asts['index.js'], indexFile, folderName, report);

  // evaluated definition
  const mod = await importOrReport(indexFile, report, 'import');
  const def = mod?.default;
  if (mod && (!def || typeof def !== 'object'))
    report.error('define-widget', indexFile, 'index.js must default-export defineWidget({...})');
  let strings = null;
  const stringsFile = path.join(folder, 'strings.js');
  if (exists(stringsFile)) {
    strings = (await importOrReport(stringsFile, report, 'strings'))?.default ?? null;
    if (strings) {
      for (const [lang, table] of Object.entries(strings)) {
        for (const key of Object.keys(table)) {
          if (!key.startsWith(`${folderName}.`))
            report.error(
              'strings',
              stringsFile,
              `[${lang}] key "${key}" must start with "${folderName}."`
            );
          if (lang !== 'en' && !(key in (strings.en || {})))
            report.error('strings', stringsFile, `[${lang}] key "${key}" has no English original`);
        }
      }
      if (!strings.en) report.error('strings', stringsFile, 'strings.js must export {en: {...}}');
    }
  }
  for (const f of jsFiles.filter((f) => !['strings.js', 'fixtures.js', 'test.js'].includes(f))) {
    if (asts[f]) checkStrings(folderName, asts[f], path.join(folder, f), strings, report);
  }

  if (def && typeof def === 'object') {
    if (def.type !== folderName)
      report.error(
        'identity',
        indexFile,
        `type "${def.type}" must equal the folder name "${folderName}"`
      );
    if (typeof def.label !== 'string' || !def.label)
      report.error('identity', indexFile, 'label must be a non-empty string');
    if (!Number.isInteger(def.order))
      report.error('identity', indexFile, 'order must be an integer');
    if (def.family && !rules.FAMILIES.includes(def.family))
      report.error(
        'family',
        indexFile,
        `family "${def.family}" is unknown (known: ${rules.FAMILIES.join(', ')})`
      );
    if (def.type !== undefined && !rules.TYPE_NAME.test(def.type))
      report.error('identity', indexFile, `type "${def.type}" must be snake_case`);
    for (const [table, actions] of [
      ['actions', def.actions],
      ['extension.actions', def.extension?.actions]
    ]) {
      for (const name of Object.keys(actions || {})) {
        if (!rules.ACTION_NAME.test(name))
          report.error('actions', indexFile, `${table}["${name}"] is not a valid action name`);
        else if (rules.CORE_ACTIONS.includes(name) || rules.FEATURE_ACTIONS.includes(name))
          report.error('actions', indexFile, `${table}["${name}"] is owned by core`);
        else if (
          !rules.GRANDFATHERED_ACTIONS.includes(name) &&
          !name.startsWith(`${folderName}-`) &&
          !name.startsWith(`${folderName.replaceAll('_', '-')}-`)
        )
          report.error(
            'actions',
            indexFile,
            `${table}["${name}"] must be named "${folderName.replaceAll('_', '-')}-<verb>" (names kept for compatibility are listed in tests/fixtures/contract-rules.mjs)`
          );
      }
    }
    if (
      strings?.en &&
      def.label &&
      strings.en[`${folderName}.label`] !== undefined &&
      strings.en[`${folderName}.label`] !== def.label
    ) {
      report.error(
        'strings',
        stringsFile,
        `en "${folderName}.label" differs from the definition label "${def.label}"`
      );
    }
  }

  // fixtures
  const fixturesFile = path.join(folder, 'fixtures.js');
  if (exists(fixturesFile)) {
    const fx = await importOrReport(fixturesFile, report, 'fixtures');
    if (fx) {
      const variants = fx.variants;
      if (!variants || typeof variants !== 'object')
        report.error('fixtures', fixturesFile, 'fixtures.js must export `variants`');
      else {
        const names = Object.keys(variants);
        const required = def?.entity === 'none' ? ['ok'] : rules.REQUIRED_VARIANTS;
        for (const r of required)
          if (!names.includes(r))
            report.error('fixtures', fixturesFile, `missing required variant "${r}"`);
        for (const [n, v] of Object.entries(variants))
          if (!v || typeof v.widget !== 'object' || typeof v.states !== 'object')
            report.error('fixtures', fixturesFile, `variant "${n}" must be {widget, states}`);
      }
    }
  }

  // README
  const readme = path.join(folder, 'README.md');
  if (exists(readme)) {
    const fm = frontMatter(read(readme));
    if (!fm)
      report.error(
        'readme',
        readme,
        'README.md must start with a --- front matter block (type, label, entity, since)'
      );
    else {
      for (const k of ['type', 'label', 'entity', 'since'])
        if (!fm[k]) report.error('readme', readme, `front matter lacks \`${k}\``);
      if (fm.type && fm.type !== folderName)
        report.error('readme', readme, `front matter type "${fm.type}" differs from the folder`);
      if (def && fm.label && fm.label !== def.label)
        report.warn(
          'readme',
          readme,
          `front matter label "${fm.label}" differs from the definition label "${def.label}"`
        );
    }
  }

  // CSS
  const css = path.join(folder, 'style.css');
  if (exists(css)) checkCss(folderName, css, read(css), phases, report);

  return def && typeof def === 'object' ? def : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// cross-widget checks

function checkCross(defs, ctx, report) {
  const {widgetsDir} = ctx;
  const seen = {order: new Map(), tag: new Map(), alias: new Map(), action: new Map()};
  const claim = (kind, key, owner, file) => {
    if (key === undefined) return;
    if (seen[kind].has(key))
      report.error(
        'duplicates',
        file,
        `${kind} "${key}" is used by both ${seen[kind].get(key)} and ${owner}`
      );
    else seen[kind].set(key, owner);
  };
  for (const [name, def] of defs) {
    const file = path.join(widgetsDir, name, 'index.js');
    claim('order', def.order, name, file);
    claim('tag', def.tag ?? `houseview-${def.type}-card`, name, file);
    for (const a of def.aliases || []) {
      claim('alias', a, name, file);
      if (defs.has(a)) report.error('duplicates', file, `alias "${a}" is also a widget type`);
    }
    for (const a of [
      ...Object.keys(def.actions || {}),
      ...Object.keys(def.extension?.actions || {})
    ])
      claim('action', a, name, file);
  }

  // shared tile CSS family
  for (const [name, def] of defs) {
    const file = path.join(widgetsDir, name, 'index.js');
    const expected = rules.ICON_TILE_FAMILY.includes(name);
    if (expected && def.family !== 'icon-tile')
      report.warn(
        'family',
        file,
        `${name} is in the icon-tile CSS lists but does not declare family: 'icon-tile' (its tile proportions would be lost)`
      );
    if (!expected && def.family === 'icon-tile' && defs.size >= rules.ICON_TILE_FAMILY.length)
      report.warn(
        'family',
        file,
        `${name} declares family 'icon-tile' but is not in the icon-tile lists`
      );
  }

  // generated discovery files
  const all = fs.existsSync(widgetsDir)
    ? fs
        .readdirSync(widgetsDir, {withFileTypes: true})
        .filter(
          (e) =>
            e.isDirectory() &&
            !/^[._]/.test(e.name) &&
            exists(path.join(widgetsDir, e.name, 'index.js'))
        )
        .map((e) => e.name)
        .sort()
    : [];
  const indexFile = path.join(widgetsDir, 'index.js');
  if (!exists(indexFile))
    report.error('generated', indexFile, 'src/widgets/index.js is missing; run `npm run gen`');
  else {
    const imported = [...read(indexFile).matchAll(/from\s+['"]\.\/([\w-]+)\/index\.js['"]/g)]
      .map((m) => m[1])
      .sort();
    const missing = all.filter((f) => !imported.includes(f));
    const extra = imported.filter((f) => !all.includes(f));
    if (missing.length || extra.length)
      report.error(
        'generated',
        indexFile,
        `src/widgets/index.js does not match the folders (missing: ${missing.join(', ') || 'none'}; stale: ${extra.join(', ') || 'none'}); run \`npm run gen\``
      );
  }
  const manifest = path.join(ctx.root, 'tests/widgets/manifest.js');
  if (exists(manifest)) {
    const text = read(manifest);
    const missing = all.filter(
      (f) => exists(path.join(widgetsDir, f, 'test.js')) && !text.includes(`/${f}/test.js`)
    );
    if (missing.length)
      report.error(
        'generated',
        manifest,
        `tests/widgets/manifest.js lacks: ${missing.join(', ')}; run \`npm run gen\``
      );
  }
}

// ---------------------------------------------------------------------------------------------------------------------

export async function lint({root = REPO, kinds = null} = {}) {
  root = path.resolve(root);
  const report = new Report(root);
  const widgetsDir = path.join(root, 'src', 'widgets');
  const folders = exists(widgetsDir)
    ? fs
        .readdirSync(widgetsDir, {withFileTypes: true})
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
      if (!phases.length) phases = null;
    } catch (e) {
      report.warn('css', phasesFile, `cannot read phases.json: ${e.message}`);
    }
  }
  const ctx = {root, widgetsDir, phases};
  const defs = new Map();
  const checked = [];
  for (const name of folders) {
    if (kinds && !kinds.has(name)) continue;
    checked.push(name);
    const def = await checkWidget(name, ctx, report);
    // A widget derived by defineOverview (def.overview) belongs to src/overviews and is checked by
    // tools/check-overviews.mjs; it never lives here, but if one is registered it is not counted twice.
    if (def && !def.overview) defs.set(name, def);
  }
  checkCross(defs, ctx, report);
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
    `check-widgets: ${checked.length} widget(s) checked, ${errors.length} error(s), ${warns.length} warning(s)${strict && warns.length ? ' (strict: warnings fail)' : ''}`
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
      if (flags.json) console.log(JSON.stringify({widgets: 0, findings: []}));
      else
        console.log(
          'check-widgets: no widgets registered yet (src/widgets has no widget folders); nothing to check'
        );
      process.exit(0);
    }
    if (flags.json)
      console.log(
        JSON.stringify({widgets: result.checked, findings: result.report.findings}, null, 2)
      );
    else printReport(result, flags);
    const errors = result.report.findings.filter((f) => f.level === 'error').length;
    const warns = result.report.findings.filter((f) => f.level === 'warn').length;
    process.exit(errors || (flags.strict && warns) ? 1 : 0);
  } catch (e) {
    console.error(`check-widgets crashed: ${e.stack || e.message}`);
    process.exit(2);
  }
}
