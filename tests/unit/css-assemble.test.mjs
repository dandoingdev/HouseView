// Phase assembler and CSS reader (tools/assemble-css.mjs, tools/css-parse.mjs). No browser, no network.
//
//   1. the reader      rules, at-rules, comments and strings; strict errors
//   2. the assembler   ordering by (phase, pin, group, file), markers, errors, @family, overviews
//   3. the real tree   src/ assembles in the documented order and esbuild can inline its wallpapers
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as esbuild from 'esbuild';
import {parseStylesheet} from '../../tools/css-parse.mjs';
import {
  GROUPS,
  assembleCss,
  assembleSources,
  expandFamilies,
  loadPhases,
  parseSections,
  resolveFamilies
} from '../../tools/assemble-css.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PHASES = loadPhases(ROOT);

const src = (file, text, group = 'core', sub = 0) => ({path: file, text, group, sub});
const assemble = (sources, options = {}) =>
  assembleSources(sources, {phases: PHASES, banners: false, ...options});
/** Selectors of the assembled rules, in order (at-rule blocks are walked). */
const selectorsOf = (css) => {
  const out = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'rule') out.push(node.selectorText);
      else if (node.children) walk(node.children);
    }
  };
  walk(parseStylesheet(css).nodes);
  return out;
};

// ---------------------------------------------------------------------------------------------------------------------
describe('phases.json', () => {
  it('lists the cascade phases in order, overviews last', () => {
    assert.deepEqual(PHASES, [
      'base',
      'adaptive',
      'carousel',
      'surface-teal',
      'carousel-widgets',
      'canvas',
      'layout-page',
      'night',
      'tablet',
      'widgets-late',
      'gallery',
      'lifted',
      'reuse',
      'nav-compact',
      'overviews'
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('css-parse: reader', () => {
  it('parses rules, at-rules, comments and strings without regex tricks', () => {
    const css = `/* a { b } */
      a, b > c { color: red; content: "}{;"; background: url(data:image/svg+xml;base64,AAAA) }
      @media (min-width: 1px) { d { margin: 0 !important } }
      @supports not (x: y) { e:is(.f, .g) { top: 0 } }`;
    const {nodes} = parseStylesheet(css);
    assert.deepEqual(
      nodes.map((n) => n.type),
      ['comment', 'rule', 'at', 'at']
    );
    assert.deepEqual(nodes[1].selectors, ['a', 'b > c']);
    assert.deepEqual(
      nodes[1].decls.map((d) => d.prop),
      ['color', 'content', 'background']
    );
    assert.equal(nodes[1].decls[1].value, '"}{;"');
    assert.equal(nodes[2].children[0].decls[0].important, true);
    assert.deepEqual(selectorsOf(css), ['a, b > c', 'd', 'e:is(.f, .g)']);
  });

  it('rejects what it does not understand instead of guessing', () => {
    assert.throws(() => parseStylesheet('a { color: red'), /unbalanced/);
    assert.throws(() => parseStylesheet('a { b { c: d } }'), /nesting/);
    assert.throws(() => parseStylesheet('}'), /unexpected/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('assembler: order', () => {
  const rule = (name, value = name) => `.${name}{order:${value}}`;

  it('orders by phase first, whatever the group', () => {
    const css = assemble([
      src('src/widgets/z/style.css', `/* @phase base */${rule('w-base')}`, 'widgets'),
      src('src/styles/core/a.css', `/* @phase adaptive */${rule('c-adaptive')}`),
      src('src/styles/core/b.css', `/* @phase base */${rule('c-base')}`)
    ]).css;
    assert.deepEqual(selectorsOf(css), ['.c-base', '.w-base', '.c-adaptive']);
  });

  it('orders a phase by pin, then group, then file', () => {
    const phase = '/* @phase carousel */';
    const css = assemble([
      src('src/widgets/b/style.css', `${phase}${rule('widget-b')}`, 'widgets'),
      src('src/widgets/a/style.css', `${phase}${rule('widget-a')}`, 'widgets'),
      src('src/styles/control-family.css', `${phase}${rule('family')}`, 'control-family'),
      src('src/styles/surfaces/teal.css', `${phase}${rule('surface')}`, 'surfaces'),
      src('src/styles/layouts/page.css', `${phase}${rule('layout')}`, 'layouts'),
      src('src/styles/core/z.css', `${phase}${rule('core-z')}`),
      src('src/styles/core/a.css', `${phase}${rule('core-a')}`)
    ]).css;
    assert.deepEqual(selectorsOf(css), [
      '.core-a',
      '.core-z',
      '.layout',
      '.surface',
      '.family',
      '.widget-a',
      '.widget-b'
    ]);
    assert.deepEqual(GROUPS, [
      'core',
      'layouts',
      'surfaces',
      'control-family',
      'widgets',
      'overviews'
    ]);
  });

  it('lets @pin reorder sections inside a phase only (negative pins go first)', () => {
    const css = assemble([
      src(
        'src/styles/core/a.css',
        `/* @phase carousel @pin 1 */${rule('core-pinned')}/* @phase canvas */${rule('core-canvas')}`
      ),
      src('src/widgets/a/style.css', `/* @phase carousel */${rule('widget')}`, 'widgets'),
      src('src/widgets/b/style.css', `/* @phase carousel @pin -1 */${rule('early')}`, 'widgets')
    ]).css;
    assert.deepEqual(selectorsOf(css), ['.early', '.widget', '.core-pinned', '.core-canvas']);
  });

  it('keeps several sections of one file in file order when pin and phase are equal', () => {
    const css = assemble([
      src(
        'src/styles/core/a.css',
        `/* @phase base */${rule('one')}/* @phase base */${rule('two')}/* @phase base */${rule('three')}`
      )
    ]).css;
    assert.deepEqual(selectorsOf(css), ['.one', '.two', '.three']);
  });

  it('puts a file without markers in carousel-widgets', () => {
    const css = assemble([
      src('src/widgets/a/style.css', rule('plain'), 'widgets'),
      src(
        'src/styles/core/a.css',
        `/* @phase carousel-widgets */${rule('core')}/* @phase canvas */${rule('later')}`
      ),
      src('src/styles/core/b.css', `/* @phase surface-teal */${rule('earlier')}`)
    ]).css;
    assert.deepEqual(selectorsOf(css), ['.earlier', '.core', '.plain', '.later']);
  });

  it('never splits an @media block: it stays whole inside one section', () => {
    const css = assemble([
      src('src/styles/core/a.css', `/* @phase base */@media (max-width:1px){.m1{a:b}.m2{a:b}}`),
      src('src/widgets/a/style.css', `/* @phase base */${rule('w')}`, 'widgets')
    ]).css;
    assert.deepEqual(selectorsOf(css), ['.m1', '.m2', '.w']);
    assert.equal(parseStylesheet(css).nodes.filter((n) => n.type === 'at').length, 1);
  });

  it('writes banners naming phase and file, and none when asked not to', () => {
    const sources = [src('src/styles/core/a.css', `/* @phase base */${rule('x')}`)];
    assert.match(
      assemble(sources, {banners: true}).css,
      /phase: base[\s\S]*src\/styles\/core\/a\.css/
    );
    assert.doesNotMatch(assemble(sources).css, /phase: base/);
  });

  it('skips files that hold only comments (an empty widget style.css)', () => {
    const css = assemble([
      src('src/widgets/a/style.css', '/* @owns a */\n/* nothing yet */', 'widgets')
    ]).css;
    assert.equal(css.trim(), '');
  });
});

describe('assembler: markers and hard errors', () => {
  const parse = (text, group = 'core', file = 'src/styles/core/x.css') =>
    parseSections(src(file, text, group), PHASES);

  it('reads /* @phase name @pin N */ and ignores @owns and prose comments', () => {
    const sections = parse('/* @owns a b */\n/* prose */\n/* @phase lifted @pin 3 */ .a{x:y}');
    assert.equal(sections.length, 1);
    assert.deepEqual([sections[0].phase, sections[0].pin], ['lifted', 3]);
  });

  it('rejects unknown phases, bad markers, sections out of order and stray rules', () => {
    assert.throws(() => parse('/* @phase nope */ .a{x:y}'), /unknown phase "nope"/);
    assert.throws(() => parse('/* @phase base @pin x */ .a{x:y}'), /malformed marker/);
    assert.throws(
      () => parse('/* @phase lifted */ .a{x:y} /* @phase base */ .b{x:y}'),
      /out of order/
    );
    assert.throws(() => parse('.a{x:y} /* @phase base */ .b{x:y}'), /before the first/);
  });

  it('rejects @import, @layer and url() outside surfaces', () => {
    assert.throws(() => parse('/* @phase base */ @import "x.css";'), /@import is not allowed/);
    assert.throws(() => parse('/* @phase base */ @layer a { .a{x:y} }'), /@layer is not allowed/);
    assert.throws(
      () => parse('/* @phase base */ .a{background:url(x.svg)}'),
      /url\(\) is only allowed/
    );
    assert.doesNotThrow(() =>
      parse(
        '/* @phase base */ .a{background:url(x.svg)}',
        'surfaces',
        'src/styles/surfaces/teal.css'
      )
    );
  });

  it('checks that url() targets exist relative to src/styles', () => {
    const teal = src(
      'src/styles/surfaces/teal.css',
      "/* @phase surface-teal */.a{background:url('../assets/teal-folds.svg')}",
      'surfaces'
    );
    assert.doesNotThrow(() => assemble([teal], {assetRoot: path.join(ROOT, 'src/styles')}));
    const bad = src(
      'src/styles/surfaces/teal.css',
      "/* @phase surface-teal */.a{background:url('../assets/nope.svg')}",
      'surfaces'
    );
    assert.throws(
      () => assemble([bad], {assetRoot: path.join(ROOT, 'src/styles')}),
      /does not exist/
    );
  });
});

describe('assembler: families', () => {
  it('expands @family(name) inside :is() and nowhere else (comments are left alone)', () => {
    const css =
      '/* @family(icon-tile) in a comment */ .c:is(@family(icon-tile)) > ha-icon { x: y }';
    const out = expandFamilies(css, {'icon-tile': ['light', 'lock']});
    assert.match(out, /\/\* @family\(icon-tile\) in a comment \*\//);
    assert.match(out, /\.c:is\(\.light,\.lock\) > ha-icon/);
  });

  it('expands an empty or unknown family to something that matches nothing, and says so', () => {
    const problems = [];
    assert.match(expandFamilies('.c:is(@family(a))', {a: []}), /:is\(:not\(\*\)\)/);
    assert.match(
      expandFamilies('.c:is(@family(b))', {}, (p) => problems.push(p)),
      /:not\(\*\)/
    );
    assert.deepEqual(problems, ['unknown family "b"']);
  });

  it('reads families from the widget definitions (module import, with a text-scan fallback), ordered by `order`', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-families-'));
    try {
      const write = (file, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
        fs.writeFileSync(path.join(dir, file), text);
      };
      write('package.json', '{"type":"module"}');
      write(
        'src/widgets/lock/index.js',
        "export default {type: 'lock', order: 100, family: 'icon-tile'};"
      );
      write(
        'src/widgets/light/index.js',
        "export default {type: 'light', order: 60, family: 'icon-tile'};"
      );
      write('src/widgets/clock/index.js', "export default {type: 'clock', order: 20};");
      // cannot be imported (imports a file that does not exist): the scan reads family and type from the text
      write(
        'src/widgets/action/index.js',
        "import './missing.js';\nexport default {type: 'action', order: 10, family: 'icon-tile'};"
      );
      write(
        'src/widgets/_shared/index.js',
        "export default {type: 'shared', family: 'icon-tile'};"
      );
      const {families, source} = await resolveFamilies(dir);
      assert.deepEqual(families['icon-tile'], ['action', 'light', 'lock']);
      assert.equal(source, 'modules+scan');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('knows the family even when no widget exists yet', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-families-'));
    try {
      const {families, source} = await resolveFamilies(dir);
      assert.deepEqual(families, {'icon-tile': []});
      assert.equal(source, 'none');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('assembler: overviews', () => {
  const overview = (file, text, sub) => src(file, text, 'overviews', sub);
  const phase = '/* @phase overviews */';

  it('is the last phase, after nav-compact, and sorts _shared before the kinds, kinds alphabetically', () => {
    const css = assemble([
      overview('src/overviews/weather/style.css', `${phase}.ov-weather{a:b}`, 1),
      overview('src/overviews/_shared/overview.css', `${phase}.ov{a:b}`, 0),
      overview('src/overviews/clock/style.css', `${phase}.ov-clock{a:b}`, 1),
      src('src/styles/core/nav-compact.css', '/* @phase nav-compact */.empty-cards{a:b}'),
      src('src/widgets/w/style.css', '/* @phase lifted */.w{a:b}', 'widgets')
    ]).css;
    assert.deepEqual(selectorsOf(css), ['.w', '.empty-cards', '.ov', '.ov-clock', '.ov-weather']);
    assert.equal(PHASES.at(-1), 'overviews');
    assert.equal(PHASES.at(-2), 'nav-compact');
  });

  it('changes nothing when no overview exists: the output with one is the output without plus a tail', () => {
    const base = [
      src('src/styles/core/base.css', '/* @phase base */.a{x:y}'),
      src('src/styles/core/nav-compact.css', '/* @phase nav-compact */.b{x:y}')
    ];
    const without = assemble(base).css;
    const withOverview = assemble([
      ...base,
      overview('src/overviews/_shared/o.css', `${phase}.ov{x:y}`, 0)
    ]).css;
    assert.ok(withOverview.startsWith(without.trimEnd()));
    assert.equal(selectorsOf(without).length, 2);
  });

  it('insists on markers and on the overviews phase in the overviews group only', () => {
    assert.throws(
      () => assemble([overview('src/overviews/a/style.css', '.ov{x:y}', 1)]),
      /must start with/
    );
    assert.throws(
      () => assemble([overview('src/overviews/a/style.css', '/* @phase base */.ov{x:y}', 1)]),
      /may only use phase "overviews"/
    );
    assert.throws(
      () => assemble([src('src/styles/core/a.css', '/* @phase overviews */.a{x:y}')]),
      /reserved for src\/overviews/
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('real tree', () => {
  it('puts the overviews group last, _shared first', async () => {
    const all = await assembleCss({root: ROOT, banners: true});
    const files = [...all.css.matchAll(/\/\* -- (src\/[^ ]+)/g)].map((m) => m[1]);
    const first = files.findIndex((f) => f.startsWith('src/overviews/'));
    assert.ok(first > 0, 'overview sections are assembled');
    assert.ok(
      files.slice(first).every((f) => f.startsWith('src/overviews/')),
      'overviews are last'
    );
    assert.match(files[first], /_shared\//, '_shared comes first inside the group');
  });

  it('expands family: icon-tile to the widgets that declare it', async () => {
    const {families} = await resolveFamilies(ROOT);
    assert.deepEqual([...families['icon-tile']].sort(), [
      'action',
      'alarm_control_panel',
      'fan',
      'light',
      'lock',
      'switch'
    ]);
  });

  it('hands esbuild a stylesheet that inlines the three wallpapers (target chrome105, whitespace only)', async () => {
    const assembled = await assembleCss({root: ROOT});
    const result = await esbuild.build({
      stdin: {
        contents: assembled.css,
        resolveDir: path.join(ROOT, 'src/styles'),
        sourcefile: 'houseview.css',
        loader: 'css'
      },
      bundle: true,
      write: false,
      outdir: path.join(ROOT, 'dist'),
      loader: {'.svg': 'dataurl'},
      target: 'chrome105',
      minifyWhitespace: true,
      minifySyntax: false,
      logLevel: 'silent'
    });
    const css = result.outputFiles[0].text;
    assert.equal(
      (css.match(/data:image\/svg\+xml/g) || []).length,
      5,
      'teal x3 (face, night, gallery), silver, champagne'
    );
    assert.doesNotMatch(css, /\.\.\/assets|@layer|@import/);
    // minifySyntax:false keeps the colours as written (syntax minification would rewrite their alpha)
    assert.match(css, /rgba\(107,\s*203,\s*191,\s*\.15\)/);
  });

  it('ships the three wallpapers', () => {
    for (const name of ['teal-folds.svg', 'silver-ribbons.svg', 'champagne-ribbons.svg']) {
      assert.ok(fs.existsSync(path.join(ROOT, 'src/assets', name)), name);
    }
  });
});
