// The generator and the scaffold know about the overview family (tools/gen-widgets.mjs MODULE_ROOTS,
// tools/new-widget.mjs FAMILIES). Everything happens in a throwaway directory.
import {describe, it, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MODULE_ROOTS, generate, listModules} from '../../tools/gen-widgets.mjs';
import {scaffold} from '../../tools/new-widget.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, {recursive: true, force: true});
});

function tmp(files = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-scaffold-'));
  made.push(repo);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), text);
  }
  return repo;
}
const overviewRoot = MODULE_ROOTS.find((r) => r.name === 'overviews');
/** The generator formats with the repo's Prettier config, and a throwaway directory has none: ignore quote style. */
const read = (repo, rel) =>
  fs
    .readFileSync(path.join(repo, rel), 'utf8')
    .replaceAll('"', "'")
    .replace(/\{ (.*?) \}/g, '{$1}');

describe('gen-widgets: the overviews root', () => {
  it('is described exactly as the integration patch P6 says', () => {
    assert.deepEqual(overviewRoot, {
      name: 'overviews',
      dir: 'src/overviews',
      index: 'src/overviews/index.js',
      registry: '../core/overview-registry.js',
      register: 'registerOverview',
      exportName: 'overviews',
      suffix: 'Overview',
      manifest: 'tests/overviews/manifest.js'
    });
  });

  it('writes an empty but valid index and manifest when there are no overviews', async () => {
    const repo = tmp();
    await generate({repo, roots: [overviewRoot]});
    assert.match(read(repo, 'src/overviews/index.js'), /export const overviews = \[\];/);
    assert.match(read(repo, 'tests/overviews/manifest.js'), /export const manifest = \[\];/);
  });

  it('registers each overview folder, skips _shared and folders without index.js', async () => {
    const repo = tmp({
      'src/overviews/weather/index.js': '',
      'src/overviews/weather/test.js': '',
      'src/overviews/now_playing/index.js': '',
      'src/overviews/_shared/dom.js': '',
      'src/overviews/draft/README.md': ''
    });
    assert.deepEqual(
      listModules(repo, overviewRoot).map((m) => [m.name, m.ident, m.hasTest]),
      [
        ['now_playing', 'nowPlayingOverview', false],
        ['weather', 'weatherOverview', true]
      ]
    );
    await generate({repo, roots: [overviewRoot]});
    const index = read(repo, 'src/overviews/index.js');
    assert.match(index, /import \{registerOverview\} from '\.\.\/core\/overview-registry\.js';/);
    assert.match(index, /import weatherOverview from '\.\/weather\/index\.js';/);
    assert.match(index, /export const overviews = \[nowPlayingOverview, weatherOverview\];/);
    assert.match(index, /for \(const definition of overviews\) registerOverview\(definition\);/);
    const manifest = read(repo, 'tests/overviews/manifest.js');
    assert.match(
      manifest,
      /type: 'weather',\s+load: \(\) => import\('\.\.\/\.\.\/src\/overviews\/weather\/test\.js'\)/
    );
    assert.equal(manifest.includes('now_playing'), false);
  });

  it('--check reports a stale index and writes nothing', async () => {
    const repo = tmp({'src/overviews/weather/index.js': ''});
    const stale = await generate({repo, roots: [overviewRoot], check: true});
    assert.ok(stale.every((r) => r.changed));
    assert.equal(fs.existsSync(path.join(repo, 'src/overviews/index.js')), false);
    await generate({repo, roots: [overviewRoot]});
    const fresh = await generate({repo, roots: [overviewRoot], check: true});
    assert.ok(fresh.every((r) => !r.changed));
  });

  it('leaves the widgets index alone', async () => {
    const repo = tmp({'src/widgets/light/index.js': ''});
    await generate({repo, roots: [overviewRoot]});
    assert.equal(fs.existsSync(path.join(repo, 'src/widgets/index.js')), false);
  });
});

describe('new-widget: --family overview', () => {
  const templates = fs.readdirSync(path.join(REPO, 'tools/templates/overview'));
  const repoWithTemplates = () => {
    const repo = tmp();
    fs.cpSync(path.join(REPO, 'tools/templates'), path.join(repo, 'tools/templates'), {
      recursive: true
    });
    return repo;
  };

  it('ships the six templates', () => {
    assert.deepEqual(templates.sort(), [
      'README.md.tpl',
      'fixtures.js.tpl',
      'index.js.tpl',
      'strings.js.tpl',
      'style.css.tpl',
      'test.js.tpl'
    ]);
  });

  it('scaffolds src/overviews/<type>, numbers it and refreshes the generated files', async () => {
    const repo = repoWithTemplates();
    const first = await scaffold({
      repo,
      family: 'overview',
      type: 'energy',
      label: 'Energy',
      domains: 'sensor'
    });
    assert.equal(first.order, 10);
    assert.equal(first.noun, 'overview');
    assert.match(first.next, /check:overviews/);
    const dir = path.join(repo, 'src/overviews/energy');
    assert.deepEqual(fs.readdirSync(dir).sort(), [
      'README.md',
      'fixtures.js',
      'index.js',
      'strings.js',
      'style.css',
      'test.js'
    ]);
    const index = read(repo, 'src/overviews/energy/index.js');
    assert.match(index, /type: 'energy',\s+label: 'Energy overview',\s+order: 10,/);
    assert.match(index, /domains: \['sensor'\]/);
    assert.equal(index.includes('{{'), false, 'every placeholder was filled');
    assert.match(
      read(repo, 'src/overviews/energy/strings.js'),
      /'energy_overview\.label': 'Energy overview'/
    );
    assert.match(
      read(repo, 'src/overviews/energy/README.md'),
      /^---\ntype: energy\nlabel: Energy overview\nentity: required\ndomains: \[sensor\]/
    );
    assert.match(
      read(repo, 'src/overviews/energy/style.css'),
      /^\/\* @phase overviews \*\/\n\/\* @owns ov-energy-scene ov-energy-title \*\//
    );
    assert.match(
      read(repo, 'src/overviews/index.js'),
      /import energyOverview from '\.\/energy\/index\.js';/
    );
    assert.match(read(repo, 'tests/overviews/manifest.js'), /type: 'energy'/);

    const second = await scaffold({
      repo,
      family: 'overview',
      type: 'now_playing',
      domains: 'media_player,sensor'
    });
    assert.equal(second.order, 20, 'the next free multiple of 10');
    assert.match(read(repo, 'src/overviews/now_playing/index.js'), /label: 'Now Playing overview'/);
    assert.match(
      read(repo, 'src/overviews/now_playing/index.js'),
      /domains: \['media_player', 'sensor'\]/
    );
  });

  it('refuses an existing folder, a bad type and an unknown family', async () => {
    const repo = repoWithTemplates();
    await scaffold({repo, family: 'overview', type: 'energy', domains: 'sensor'});
    await assert.rejects(scaffold({repo, family: 'overview', type: 'energy'}), /already exists/);
    await assert.rejects(scaffold({repo, family: 'overview', type: 'Bad-Type'}), /snake_case/);
    await assert.rejects(scaffold({repo, family: 'screen', type: 'x'}), /unknown family "screen"/);
  });

  it('still scaffolds widgets by default', async () => {
    const repo = repoWithTemplates();
    const result = await scaffold({repo, type: 'humidifier', domains: 'humidifier'});
    assert.equal(result.noun, 'widget');
    assert.ok(fs.existsSync(path.join(repo, 'src/widgets/humidifier/index.js')));
    assert.equal(fs.existsSync(path.join(repo, 'src/overviews/humidifier')), false);
  });
});
