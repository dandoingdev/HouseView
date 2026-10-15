// Tests of the linter itself (tools/check-widgets.mjs): a clean tree passes, a tree full of violations reports each one.
// The trees are generated into a temp directory, so no deliberately broken file lives in the repository.

import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {lint} from '../../tools/check-widgets.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = path.join(REPO, 'tools/check-widgets.mjs');
let tmp;

const put = (rel, text) => {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
};

const GOOD_INDEX = `import {defineWidget} from '../../core/define-widget.js';
export default defineWidget({
  type: 'good', label: 'Good', order: 10,
  render: (ctx) => ctx.tile('info', \`<span>\${ctx.name}</span><small>\${ctx.esc(ctx.t('good.hello'))}</small>\`),
  actions: {'good-go': {run: (ctx, id) => ctx.call('light', 'toggle', {entity_id: id})}}
});
`;
const fixtures = (entity) =>
  `export const variants = {ok: {widget: {entity: '${entity}'}, states: {}}, unavailable: {widget: {entity: '${entity}'}, states: {}}, missing: {widget: {entity: '${entity}'}, states: {}}};\n`;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-lint-'));
  put('src/core/define-widget.js', 'export const defineWidget = (d) => Object.freeze({...d});\n');
  put('src/styles/phases.json', JSON.stringify(['base', 'carousel-widgets', 'night']));
  put(
    'src/widgets/index.js',
    "import goodWidget from './good/index.js';\nexport const widgets = [goodWidget];\n"
  );

  // ---- a clean widget
  put('src/widgets/good/index.js', GOOD_INDEX);
  put(
    'src/widgets/good/strings.js',
    "export default {en: {'good.label': 'Good', 'good.hello': 'Hello'}};\n"
  );
  put('src/widgets/good/fixtures.js', fixtures('good.test'));
  put('src/widgets/good/test.js', 'export default async function () {}\n');
  put(
    'src/widgets/good/README.md',
    '---\ntype: good\nlabel: Good\nentity: required\nsince: 1.0\n---\n# Good\n'
  );
  put(
    'src/widgets/good/style.css',
    '/* @owns good */\n/* @phase carousel-widgets */\n.carousel .good { color: red; }\n@media (max-width: 500px) { .good small { display: none; } }\n'
  );

  // ---- a widget whose imports are all illegal (it cannot even be imported, which is reported too)
  put(
    'src/widgets/broken/index.js',
    `import {defineWidget} from '../../core/define-widget.js';
import {x} from '../../controller/x.js';
import lodash from 'lodash';
export default defineWidget({type: 'broken', label: 'Broken', order: 20, render: (ctx) => ctx.tile('info', 'x')});
`
  );

  // ---- a widget breaking many rules
  put(
    'src/widgets/ugly/index.js',
    `import {defineWidget} from '../../core/define-widget.js';
import good from '../good/index.js';
const helper = (ctx) => localStorage.getItem('k') + ctx.card;
export default defineWidget({
  type: 'ugly', label: 'Ugly', order: 10,
  render(ctx) {
    window.alert(1); fetch('/x'); confirm('sure'); ctx.t('ugly.nope'); ctx.t('other.key');
    ctx.widget.size = 'wide';
    return ctx.tile('info', \`<b>\${ctx.attrs.friendly_name}</b><i>\${helper(ctx)}</i>\${new Date()}\`);
  },
  actions: {info: {run() {}}, wrong: {run() {}}}
});
`
  );
  put(
    'src/widgets/ugly/strings.js',
    "export default {en: {'ugly.label': 'Ugly', 'nope.key': 'x'}};\n"
  );
  put('src/widgets/ugly/fixtures.js', 'export const variants = {ok: {widget: {}, states: {}}};\n');
  put('src/widgets/ugly/README.md', '# no front matter\n');
  put(
    'src/widgets/ugly/style.css',
    `@import 'x.css';
@layer base { .ugly { color: red; } }
.carousel .shell .other { color: blue; }
.ugly { color: red !important; background: url(x.svg); }
.surface-teal { color: red; }
.a .b .c .ugly .d { color: red; }
/* @phase night */
.ugly { color: red; }
/* @phase carousel-widgets */
.ugly { color: red; }
`
  );
});

after(() => fs.rmSync(tmp, {recursive: true, force: true}));

describe('check-widgets', () => {
  it('reports "nothing registered yet" for an empty tree', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-lint-empty-'));
    try {
      const r = await lint({root: empty});
      assert.equal(r.empty, true);
      const cli = spawnSync(process.execPath, [CLI, `--root=${empty}`], {encoding: 'utf8'});
      assert.equal(cli.status, 0);
      assert.match(cli.stdout, /no widgets registered yet/);
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });

  it('passes a clean widget', async () => {
    const {report} = await lint({root: tmp, kinds: new Set(['good'])});
    assert.deepEqual(
      report.findings.filter((f) => f.file.includes('widgets/good/')),
      []
    );
  });

  describe('flags every violation in a bad widget', () => {
    let findings;
    before(async () => {
      findings = (await lint({root: tmp})).report.findings.filter((f) =>
        f.file.includes('widgets/ugly/')
      );
    });
    const has = (rule, pattern, level = 'error') =>
      assert.ok(
        findings.some((f) => f.rule === rule && f.level === level && pattern.test(f.message)),
        `expected [${level} ${rule}] /${pattern.source}/ in:\n${findings.map((f) => `  [${f.level} ${f.rule}] ${f.message}`).join('\n')}`
      );

    it('missing files', () => has('files', /test\.js/));
    it('cross-widget import', () => has('imports', /another widget \(good\)/));
    it('window / fetch / confirm / localStorage in render', () => {
      has('render-purity', /`window`/);
      has('render-purity', /`fetch`/);
      has('render-purity', /`confirm`/);
      has('render-purity', /`localStorage`/);
    });
    it('ctx.card, Date, input mutation', () => {
      has('render-purity', /ctx\.card/);
      has('render-purity', /clock/);
      has('render-purity', /mutate/);
    });
    it('unescaped interpolation (warning)', () => has('escape', /raw entity\/config data/, 'warn'));
    it('string keys', () => {
      has('strings', /"ugly\.nope" is missing/);
      has('strings', /"other\.key" must start with "ugly\."/);
      has('strings', /"nope\.key" must start with "ugly\."/);
    });
    it('duplicate order', () => has('duplicates', /order "10"/));
    it('action names', () => {
      has('actions', /"info"\] is owned by core/);
      has('actions', /"wrong"\] must be named "ugly-<verb>"/);
    });
    it('README front matter and fixture variants', () => {
      has('readme', /front matter/);
      has('fixtures', /missing required variant "unavailable"/);
    });
    it('css: markers, import, layer, important, url, subjects, phases, specificity', () => {
      has('css', /no `\/\* @owns/);
      has('css', /@import/);
      has('css', /@layer/);
      has('css', /!important/);
      has('css', /url\(\)/);
      has('css', /surface\/layout\/night class must not be the subject|names no class from @owns/);
      has('css', /out of order/);
      has('css', /specificity/, 'warn');
    });
  });

  it('flags forbidden and bare imports, and the failed import', async () => {
    const f = (await lint({root: tmp})).report.findings.filter((x) =>
      x.file.includes('widgets/broken/')
    );
    assert.ok(f.some((x) => x.rule === 'imports' && /controller/.test(x.message)));
    assert.ok(
      f.some((x) => x.rule === 'imports' && /lodash.*no runtime dependencies/.test(x.message))
    );
    assert.ok(f.some((x) => x.rule === 'import' && /cannot import/.test(x.message)));
  });

  it('flags a stale generated index', async () => {
    const {report} = await lint({root: tmp});
    assert.ok(
      report.findings.some((f) => f.rule === 'generated' && /missing: broken, ugly/.test(f.message))
    );
  });

  it('exit codes: 1 on errors, 0 when clean, --strict fails on warnings', () => {
    const run = (...args) => spawnSync(process.execPath, [CLI, ...args], {encoding: 'utf8'});
    assert.equal(run(`--root=${tmp}`).status, 1);
    const mini = path.join(REPO, 'tests/fixtures/mini-engine');
    assert.equal(
      run(`--root=${mini}`, '--kind=light,cover').status,
      0,
      'the two reference widgets are clean'
    );
    assert.equal(
      run(`--root=${mini}`, '--kind=light,cover', '--strict').status,
      1,
      'cover has a computed-key warning'
    );
    assert.equal(run(`--root=${mini}`, '--kind=bad_dom').status, 1);
    const json = JSON.parse(run(`--root=${tmp}`, '--json').stdout);
    assert.ok(json.findings.length > 10);
  });
});
