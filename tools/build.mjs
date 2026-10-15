// esbuild driver: src/index.js -> dist/houseview.js (+ .map, .sha256).
//
// Usage: node tools/build.mjs [--dev] [--watch] [--root=<dir>] [--out-dir=<dir>] [--quiet]
//   (default)  production: minified whitespace, syntax AND local identifiers, external linked sourcemap
//   --dev      unminified, inline sourcemap. This is the build the tests run against by default.
//   --watch    rebuild on change (tools/dev.mjs wraps this with a static server)
//   --root     build a different tree (must contain src/index.js); used for scratch verification
//   --out-dir  write to <root>/<dir> instead of <root>/dist (`npm run build:min` builds dist-min/, which
//              `run-tests.mjs --target=dist-min` runs the browser suite against, so the PRODUCTION bytes are tested too)
//
// The stylesheet reaches the bundle through the virtual module `virtual:houseview-css` (default export =
// CSS text). It is produced by tools/assemble-css.mjs and then run
// through esbuild's CSS pipeline so the wallpaper SVGs are inlined as data: URIs.
// docs/architecture.md: the CSS gets target chrome105 and whitespace minification only, minifySyntax false
// (syntax minification rewrites colours and changes computed alpha). The JS is fully minified in production
// (local identifiers too: no test or caller reaches a local name, only exports and properties, which esbuild keeps).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TARGET = 'chrome105';
export const OUT_NAME = 'houseview.js';
export const VIRTUAL_CSS = 'virtual:houseview-css';

/** @returns {string} package.json version of `root`, falling back to the repository's. */
export function readVersion(root) {
  for (const dir of [root, REPO]) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error('no package.json with a version found');
}

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out.sort();
}

/**
 * Fallback used until tools/assemble-css.mjs exists: every .css under src/, src/styles first.
 * Only a stand-in so the pipeline can be verified; the real cascade comes from the assembler.
 */
function concatCss(root) {
  const isCss = (f) => f.endsWith('.css');
  const styles = walk(path.join(root, 'src/styles'), isCss);
  const rest = walk(path.join(root, 'src'), isCss).filter((f) => !styles.includes(f));
  const files = [...styles, ...rest];
  return {css: files.map((f) => fs.readFileSync(f, 'utf8')).join('\n'), files};
}

/** Run the CSS assembler when present: `assembleCss({root})` -> string | {css, watchFiles?}. */
async function assemble(root) {
  const file = path.join(root, 'tools/assemble-css.mjs');
  if (!fs.existsSync(file)) return {...concatCss(root), source: 'fallback'};
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  const fn = mod.assembleCss || mod.default;
  if (typeof fn !== 'function') {
    throw new Error('tools/assemble-css.mjs must export assembleCss({root}) (named or default)');
  }
  const result = await fn({root});
  const css = typeof result === 'string' ? result : result.css;
  return {css, files: (typeof result === 'object' && result.watchFiles) || [], source: 'assembler'};
}

/**
 * Assemble the stylesheet and run it through esbuild's CSS pipeline (asset inlining, target, whitespace).
 * @returns {Promise<{css:string, watchFiles:string[], source:string}>}
 */
export async function buildCss({root = REPO, dev = false} = {}) {
  const assembled = await assemble(root);
  const result = await esbuild.build({
    stdin: {
      contents: assembled.css,
      resolveDir: path.join(root, 'src/styles'),
      sourcefile: 'houseview.css',
      loader: 'css'
    },
    bundle: true,
    write: false,
    outdir: path.join(root, 'dist'),
    loader: {'.svg': 'dataurl'},
    target: TARGET,
    minifyWhitespace: !dev,
    minifySyntax: false,
    minifyIdentifiers: false,
    logLevel: 'silent',
    metafile: true
  });
  const inputs = Object.keys(result.metafile.inputs)
    .filter((f) => !f.startsWith('<'))
    .map((f) => path.resolve(root, f));
  const watchFiles = new Set([
    ...assembled.files,
    ...inputs,
    ...walk(path.join(root, 'src'), (f) => /\.(css|svg|json)$/.test(f))
  ]);
  return {css: result.outputFiles[0].text, watchFiles: [...watchFiles], source: assembled.source};
}

/** Resolve `virtual:houseview-css` to a module exporting the assembled stylesheet. */
function cssPlugin({root, dev, onSource}) {
  return {
    name: 'houseview-css',
    setup(build) {
      build.onResolve({filter: /^virtual:houseview-css$/}, () => ({
        path: VIRTUAL_CSS,
        namespace: 'houseview-virtual'
      }));
      build.onLoad({filter: /.*/, namespace: 'houseview-virtual'}, async () => {
        const {css, watchFiles, source} = await buildCss({root, dev});
        onSource(source);
        return {
          contents: `export default ${JSON.stringify(css)};\n`,
          loader: 'js',
          resolveDir: root,
          watchFiles
        };
      });
    }
  };
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Checksum and cleanup after every (re)build, including watch rebuilds. */
function writeCompanions({outDir, dev, log}) {
  const main = path.join(outDir, OUT_NAME);
  const bytes = fs.readFileSync(main);
  fs.writeFileSync(path.join(outDir, `${OUT_NAME}.sha256`), `${sha256(bytes)}  ${OUT_NAME}\n`);
  // A dev build inlines its map; do not leave a stale external one from a production build.
  if (dev) fs.rmSync(path.join(outDir, `${OUT_NAME}.map`), {force: true});
  log(`${path.relative(process.cwd(), main) || main}: ${(bytes.length / 1024).toFixed(1)} KB`);
}

/**
 * @param {Object} [options]
 * @param {string} [options.root]
 * @param {boolean} [options.dev]
 * @param {boolean} [options.watch]
 * @param {boolean} [options.quiet]
 */
export async function build({
  root = REPO,
  dev = false,
  watch = false,
  quiet = false,
  outDir: outDirName = 'dist'
} = {}) {
  root = path.resolve(root);
  const entry = path.join(root, 'src/index.js');
  if (!fs.existsSync(entry)) throw new Error(`entry point not found: ${entry}`);
  const version = readVersion(root);
  const outDir = path.join(root, outDirName);
  const log = (msg) => !quiet && console.log(`build: ${msg}`);
  let cssSource = 'n/a';

  const options = {
    entryPoints: [entry],
    outfile: path.join(outDir, OUT_NAME),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: TARGET,
    loader: {'.svg': 'dataurl'},
    define: {__HV_VERSION__: JSON.stringify(version)},
    banner: {js: `/*! HouseView v${version} | MIT License */`},
    legalComments: 'none',
    minifyWhitespace: !dev,
    minifySyntax: !dev,
    // Local names only (properties such as `_act` and `_config` are never renamed). Stack traces stay usable through the
    // external source map; the dev build, which the day-to-day tests use, keeps every name.
    minifyIdentifiers: !dev,
    sourcemap: dev ? 'inline' : 'linked',
    sourcesContent: false,
    logLevel: quiet ? 'silent' : 'warning',
    plugins: [
      cssPlugin({root, dev, onSource: (s) => (cssSource = s)}),
      {
        name: 'houseview-companions',
        setup(b) {
          b.onEnd((result) => {
            if (result.errors.length) return;
            writeCompanions({outDir, dev, log});
            if (cssSource === 'fallback')
              log('css: tools/assemble-css.mjs missing, used plain concatenation');
          });
        }
      }
    ]
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    log(`watching ${path.join(root, 'src')} (${dev ? 'dev' : 'production'} build, v${version})`);
    return {dispose: () => ctx.dispose(), rebuild: () => ctx.rebuild()};
  }
  await esbuild.build(options);
  log(`${dev ? 'dev' : 'production'} bundle v${version} done`);
  return {dispose: async () => {}};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const rootArg = args.find((a) => a.startsWith('--root='));
  const outArg = args.find((a) => a.startsWith('--out-dir='));
  try {
    await build({
      root: rootArg ? rootArg.slice('--root='.length) : REPO,
      outDir: outArg ? outArg.slice('--out-dir='.length) : 'dist',
      dev: args.includes('--dev'),
      watch: args.includes('--watch'),
      quiet: args.includes('--quiet')
    });
  } catch (e) {
    console.error(`build failed: ${e.message}`);
    process.exit(1);
  }
}
