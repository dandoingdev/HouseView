// tools/check-overviews.mjs against small throwaway trees. The core is a stub (a frozen object with a `widget`),
// so these tests need neither the engine nor the integration patches.
import {describe, it, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {lint} from '../../tools/check-overviews.mjs';

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, {recursive: true, force: true});
});

const STUB_CORE = `
export function defineOverview(def) {
  return Object.freeze({
    ...def,
    options: def.options ?? {},
    widget: {tag: 'houseview-' + def.type.replaceAll('_', '-') + '-overview-card'}
  });
}
`;
const PHASES = JSON.stringify({phases: [{name: 'base'}, {name: 'overviews'}]});

const indexJs = (kind, extra = '', order = 10, type = kind) => `
import {defineOverview} from '../../core/define-overview.js';
import strings from './strings.js';
${extra}
export default defineOverview({
  type: '${type}',
  label: '${kind} overview',
  order: ${order},
  strings,
  render(ctx) {
    return \`<div class="ov-scene ov-${kind}-scene">\${ctx.esc(ctx.name)}</div>\`;
  }
});
`;
const stringsJs = (kind) =>
  `export default {en: {'${kind}_overview.label': '${kind}', '${kind}_overview.description': 'x'}};\n`;
const readme = (kind, type = kind) =>
  `---\ntype: ${type}\nlabel: ${kind} overview\nentity: required\ndomains: [sensor]\nsince: 1.0\n---\n# ${kind}\n`;
const css = (kind, body = '') =>
  `/* @phase overviews */\n/* @owns ov-${kind}-scene ov-${kind}-title */\n.ov-${kind}-title { color: #fff; }\n${body}\n`;

/** A tree with the listed overviews; `patch[kind][file]` replaces (string) or removes (null) a file. */
function tree(kinds = ['clean'], patch = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-check-overviews-'));
  made.push(root);
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), {recursive: true});
    fs.writeFileSync(path.join(root, rel), text);
  };
  put('src/core/define-overview.js', STUB_CORE);
  put('src/styles/phases.json', PHASES);
  let order = 10;
  for (const kind of kinds) {
    const files = {
      'index.js': indexJs(kind, '', order),
      'strings.js': stringsJs(kind),
      'fixtures.js': 'export const variants = {ok: {}};\n',
      'test.js': 'export default async function () {}\n',
      'README.md': readme(kind),
      'style.css': css(kind),
      ...patch[kind]
    };
    order += 10;
    for (const [file, text] of Object.entries(files)) {
      if (text !== null) put(`src/overviews/${kind}/${file}`, text);
    }
  }
  const imports = kinds.map((k, i) => `import o${i} from './${k}/index.js';`).join('\n');
  put(
    'src/overviews/index.js',
    `${imports}\nexport const overviews = [${kinds.map((_, i) => `o${i}`).join(', ')}];\n`
  );
  put(
    'tests/overviews/manifest.js',
    `export const manifest = [${kinds.map((k) => `{type: '${k}', load: () => import('../../src/overviews/${k}/test.js')}`).join(',')}];\n`
  );
  return root;
}

async function findings(kinds, patch, options) {
  const result = await lint({root: tree(kinds, patch), ...options});
  return result.report.findings.map(
    (f) => `${f.level}:${f.rule}:${f.file.split('/').pop()}:${f.message}`
  );
}
const errorsOf = async (kinds, patch) =>
  (await lint({root: tree(kinds, patch)})).report.findings.filter((f) => f.level === 'error');
const has = (list, rule, text) =>
  list.some((f) => (f.rule ?? f.split(':')[1]) === rule && (f.message ?? f).includes(text));

describe('check-overviews: a clean overview', () => {
  it('passes with no finding', async () => {
    assert.deepEqual(await findings(['clean']), []);
  });

  it('reports "nothing to check" for an empty tree', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-check-overviews-'));
    made.push(root);
    const result = await lint({root});
    assert.equal(result.empty, true);
  });

  it('allows what the contract allows: new Date(ms), Date.parse, window inside a hook, the SVG namespace', async () => {
    const extra = `
      const at = (ms) => new Date(ms);
      export const parsed = Date.parse('2026-10-15T10:09:00+01:00');
      export const hook = () => window.matchMedia?.('(min-width: 1px)');
      export const ns = 'http://www.w3.org/2000/svg';
    `;
    assert.deepEqual(await errorsOf(['ok'], {ok: {'index.js': indexJs('ok', extra)}}), []);
  });
});

describe('check-overviews: files and identity', () => {
  it('names a missing required file', async () => {
    const list = await errorsOf(['a'], {a: {'fixtures.js': null, 'README.md': null}});
    assert.ok(has(list, 'files', 'missing required file fixtures.js'));
    assert.ok(has(list, 'files', 'missing required file README.md'));
  });

  it('wants the type to equal the folder name', async () => {
    const list = await errorsOf(['a'], {a: {'index.js': indexJs('a', '', 10, 'other')}});
    assert.ok(has(list, 'identity', 'must equal the folder name'));
  });

  it('catches a duplicate order', async () => {
    const root = tree(['a', 'b'], {b: {'index.js': indexJs('b', '', 10)}});
    const list = (await lint({root})).report.findings;
    assert.ok(has(list, 'duplicates', 'order "10" is used by both a and b'));
  });

  it('wants defineOverview to have produced the module', async () => {
    const list = await errorsOf(['a'], {a: {'index.js': 'export default {type: "a"};\n'}});
    assert.ok(has(list, 'define-overview', 'defineOverview'));
  });

  it('checks the strings keys and the English label and description', async () => {
    const list = await errorsOf(['a'], {
      a: {'strings.js': "export default {en: {'a.label': 'x'}, de: {'a_overview.other': 'y'}};\n"}
    });
    assert.ok(has(list, 'strings', '"a.label" must start with "a_overview."'));
    assert.ok(has(list, 'strings', '[de] key "a_overview.other" has no English original'));
    assert.ok(has(list, 'strings', 'missing English string a_overview.label'));
  });

  it('checks the README front matter against the definition', async () => {
    const wrong = await errorsOf(['a'], {
      a: {'README.md': readme('a', 'b').replace('a overview', 'A')}
    });
    assert.ok(has(wrong, 'readme', 'differs from the folder'));
    assert.ok(has(wrong, 'readme', 'differs from the definition label'));
    const none = await errorsOf(['a'], {a: {'README.md': '# no front matter\n'}});
    assert.ok(has(none, 'readme', 'front matter block'));
  });

  it('checks the generated files against the folders', async () => {
    const root = tree(['a']);
    fs.writeFileSync(path.join(root, 'src/overviews/index.js'), 'export const overviews = [];\n');
    fs.writeFileSync(
      path.join(root, 'tests/overviews/manifest.js'),
      'export const manifest = [];\n'
    );
    const list = (await lint({root})).report.findings;
    assert.ok(has(list, 'generated', 'src/overviews/index.js does not match the folders'));
    assert.ok(has(list, 'generated', 'tests/overviews/manifest.js lacks: a'));
  });
});

describe('check-overviews: imports', () => {
  const imports = {
    "import x from '../other/index.js';": 'crosses into another overview',
    "import x from '../../controller/screensaver.js';": 'controller',
    "import x from '../../widgets/light/index.js';": 'widgets',
    "import x from '../../editor/fields.js';": 'editor',
    "import x from 'lit';": 'no runtime dependencies'
  };
  for (const [line, message] of Object.entries(imports)) {
    it(`refuses ${line}`, async () => {
      const list = await errorsOf(['a'], {a: {'index.js': indexJs('a', line)}});
      assert.ok(has(list, 'imports', message), JSON.stringify(list));
    });
  }

  it('allows core, _shared and the own folder; a fixtures.js imports nothing', async () => {
    const ok = "import '../../core/html.js'; import '../_shared/dom.js'; import './model.js';";
    assert.deepEqual(
      (
        await errorsOf(['a'], {
          a: {'index.js': indexJs('a', ok), 'model.js': 'export const m = 1;\n'}
        })
      ).filter((f) => f.rule === 'imports'),
      []
    );
    const list = await errorsOf(['a'], {
      a: {
        'fixtures.js': "import {x} from './model.js';\nexport const variants = {ok: {}};\n",
        'model.js': 'export const x = 1;\n'
      }
    });
    assert.ok(has(list, 'imports', 'fixtures.js imports nothing'));
  });
});

describe('check-overviews: forbidden code', () => {
  const cases = {
    'hass.callService(d, s, {})': 'callService',
    'ctx.call("light", "turn_on", {})': 'ctx.call',
    'fetch("/x")': 'fetch',
    'setInterval(() => {}, 1000)': 'setInterval',
    'requestAnimationFrame(() => {})': 'requestAnimationFrame',
    'localStorage.getItem("x")': 'localStorage',
    'Math.random()': 'Math.random',
    'Date.now()': 'Date.now',
    'new Date()': 'new Date()',
    'window.confirm("x")': 'window.confirm',
    'const u = "https://example.com/x.png"': 'network URL',
    'const u = `https://example.com/${1}`': 'network URL'
  };
  for (const [code, message] of Object.entries(cases)) {
    it(`flags ${code}`, async () => {
      const extra = `export function leak(hass, ctx) { ${code}; }`;
      const list = await errorsOf(['a'], {a: {'index.js': indexJs('a', extra)}});
      assert.ok(has(list, 'forbidden', message), JSON.stringify(list));
    });
  }

  it('flags the DOM touched while the module is imported, not inside a function', async () => {
    const list = await errorsOf(['a'], {
      a: {'index.js': indexJs('a', 'const w = window.innerWidth;')}
    });
    assert.ok(has(list, 'import-time', '`window` is touched while the module is imported'));
    const inside = await errorsOf(['a'], {
      a: {'index.js': indexJs('a', 'export const f = () => document.title;')}
    });
    assert.deepEqual(
      inside.filter((f) => f.rule === 'import-time'),
      []
    );
  });

  it('does not scan test.js, which runs in a browser', async () => {
    const list = await errorsOf(['a'], {
      a: {
        'test.js':
          'export default async function () { window.scrollTo(0, 0); setInterval(() => {}, 1); }\n'
      }
    });
    assert.deepEqual(list, []);
  });

  it('flags a syntax error instead of crashing', async () => {
    const list = await errorsOf(['a'], {a: {'model.js': 'export const = ;\n'}});
    assert.ok(has(list, 'syntax', 'cannot parse'));
  });
});

describe('check-overviews: _shared/performance.css (the speed rules of the card)', () => {
  /** Errors for a lint of one clean overview plus a `_shared/performance.css` with this text. */
  async function errorsWith(text) {
    const root = tree(['a']);
    fs.mkdirSync(path.join(root, 'src/overviews/_shared'), {recursive: true});
    fs.writeFileSync(path.join(root, 'src/overviews/_shared/performance.css'), text);
    return (await lint({root})).report.findings.filter((f) => f.level === 'error');
  }
  const marker = '/* @phase overviews */\n';

  it('may style existing classes as long as the card asked for it', async () => {
    const list = await errorsWith(
      `${marker}.shell[data-covered] > .face { visibility: hidden; }\n` +
        `.perf-lite .tile, .perf-lite .widget { backdrop-filter: none !important; }\n` +
        `.shell.perf-lite.screen-dim::after { content: ''; opacity: 0.8; }\n`
    );
    assert.deepEqual(list, []);
  });

  it('refuses a rule that would match without the condition', async () => {
    const list = await errorsWith(`${marker}.tile { backdrop-filter: none; }\n`);
    assert.ok(
      has(list, 'css', 'must be conditioned on [data-covered] or .perf-lite'),
      JSON.stringify(list)
    );
    const mixed = await errorsWith(`${marker}.perf-lite .tile, .widget { color: red; }\n`);
    assert.ok(has(mixed, 'css', '".widget" must be conditioned'), JSON.stringify(mixed));
  });

  it('refuses url(), keyframes, @import and @layer, and wants the phase marker', async () => {
    const urls = await errorsWith(`${marker}.perf-lite .tile { background: url(x.png); }\n`);
    assert.ok(has(urls, 'css', 'url()'));
    const keys = await errorsWith(
      `${marker}@keyframes x { from { opacity: 0 } to { opacity: 1 } }\n`
    );
    assert.ok(has(keys, 'css', '@keyframes is not allowed'), JSON.stringify(keys));
    const layer = await errorsWith(`${marker}@layer base { .perf-lite .tile { color: red; } }\n`);
    assert.ok(has(layer, 'css', '@layer is not allowed'), JSON.stringify(layer));
    const bare = await errorsWith('.perf-lite .tile { color: red; }\n');
    assert.ok(has(bare, 'css', '@phase overviews'), JSON.stringify(bare));
  });
});

describe('check-overviews: style.css', () => {
  const bad = {
    '.ov-a-title { color: red !important; }': '!important',
    '.ov-a-title { background: url(x.png); }': 'url()',
    '.ov-a-title { filter: blur(4px); }': 'blur',
    '.ov-a-title { backdrop-filter: blur(4px); }': 'backdrop-filter',
    '.ov-a-title { mix-blend-mode: screen; }': 'mix-blend-mode',
    '.ov-a-title { will-change: left; }': 'will-change',
    '.ov-a-title { animation: ov-a-x 1s infinite; }': 'no-preference',
    '@keyframes ov-a-x { from { opacity: 0 } to { opacity: 1 } }': 'must sit inside',
    '@media (prefers-reduced-motion: no-preference) { @keyframes ov-a-x { from { left: 0 } to { left: 9px } } }':
      'only transform and opacity',
    '@media (prefers-reduced-motion: no-preference) { @keyframes spin { from { opacity: 0 } to { opacity: 1 } } }':
      'names are ov-a-*',
    '.tile .ov-a-title { color: red; }': 'must be rooted',
    '.ov-a-title .tile { color: red; }': 'its subject must be an ov-* class',
    '.ov-a-title button { color: red; }': 'its subject must be an ov-* class',
    '.ov .ov-a-title .x .y .z { color: red; }': 'specificity',
    '.ov-other { color: red; }': 'names no class from @owns',
    '@import "x.css";': '@import',
    '@layer base { .ov-a-title { color: red; } }': '@layer'
  };
  for (const [rule, message] of Object.entries(bad)) {
    it(`flags ${rule.slice(0, 70)}`, async () => {
      const list = await errorsOf(['a'], {a: {'style.css': css('a', rule)}});
      assert.ok(has(list, 'css', message), JSON.stringify(list));
    });
  }

  it('accepts .perf-lite as a condition ancestor, like .contrast and .dark', async () => {
    const list = await errorsOf(['a'], {
      a: {
        'style.css': css(
          'a',
          '.perf-lite .ov-a-title { display: none; }\n.perf-lite .ov-a-scene { will-change: auto; }'
        )
      }
    });
    assert.deepEqual(list, []);
  });

  it('wants @owns, the overviews phase and the marker first', async () => {
    assert.ok(
      has(
        await errorsOf(['a'], {
          a: {'style.css': '/* @phase overviews */\n.ov-a-title { color: red; }\n'}
        }),
        'css',
        '@owns'
      )
    );
    assert.ok(
      has(
        await errorsOf(['a'], {
          a: {'style.css': '/* @owns ov-a-title */\n.ov-a-title { color: red; }\n'}
        }),
        'css',
        '@phase overviews'
      )
    );
    assert.ok(
      has(
        await errorsOf(['a'], {
          a: {
            'style.css': '/* @phase base */\n/* @owns ov-a-title */\n.ov-a-title { color: red; }\n'
          }
        }),
        'css',
        'the phase "overviews" only'
      )
    );
    assert.ok(
      has(
        await errorsOf(['a'], {
          a: {
            'style.css':
              '/* @owns ov-a-title */\n.ov-a-title { color: red; }\n/* @phase overviews */\n'
          }
        }),
        'css',
        'before the first `@phase overviews` marker'
      )
    );
  });

  it('wants owned classes to start with ov-', async () => {
    const list = await errorsOf(['a'], {
      a: {'style.css': '/* @phase overviews */\n/* @owns title */\n.ov .title { color: red; }\n'}
    });
    assert.ok(has(list, 'css', 'must start with ov-'));
  });

  it('accepts animations the contract allows', async () => {
    const good = `
@media (prefers-reduced-motion: no-preference) {
  .ov-a-title { animation: ov-a-drift 30s ease-in-out infinite alternate; will-change: transform; }
  @keyframes ov-a-drift {
    from { transform: translate3d(0, 0, 0); opacity: 0.8; }
    to { transform: translate3d(3%, 0, 0); opacity: 1; animation-timing-function: linear; }
  }
}
.contrast .ov-a-title { color: #fff; }
.dark .ov-a-title:hover, .ov .ov-a-title[data-x='1'] { color: #eee; }
`;
    assert.deepEqual(await errorsOf(['a'], {a: {'style.css': css('a', good)}}), []);
  });
});

describe('check-overviews: _shared CSS and options', () => {
  it('checks _shared/*.css with the same rules (classes owned by the framework)', async () => {
    const root = tree(['a']);
    fs.mkdirSync(path.join(root, 'src/overviews/_shared'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'src/overviews/_shared/overview.css'),
      '/* @phase overviews */\n/* @owns ov */\n.tile { color: red !important; }\n'
    );
    const list = (await lint({root})).report.findings;
    assert.ok(has(list, 'css', '!important'));
    assert.ok(has(list, 'css', 'must be rooted'));
  });

  it('can limit a run to some overviews and still sees the others for the cross checks', async () => {
    const root = tree(['a', 'b']);
    const result = await lint({root, kinds: new Set(['a'])});
    assert.deepEqual(result.checked, ['a']);
    assert.deepEqual(result.folders, ['a', 'b']);
  });
});
