// Tiny zero-dependency static server for HouseView tests, screenshots and benches.
//
// Pages that test the bundle import it from the fixed URL `/bundle/houseview.js`; the server answers that URL
// with a tiny module that re-exports the bundle of the chosen `target`:
//
//   target 'dist'     (default) /dist/houseview.js, the development build (`npm run build:dev`)
//   target 'dist-min' /dist-min/houseview.js, the production bundle (`npm run build:min`)
//   target 'src'      /src/index.js, unbundled (a debugging aid: an import map for `virtual:houseview-css` and a
//                     `__HV_VERSION__` global are injected into HTML pages; needs the CSS assembler, see tools/build.mjs)
//
// Run directly: node tools/serve.mjs [port] [--target=dist|dist-min|src] [--lan]
//   --lan  listen on every network interface instead of 127.0.0.1, but serve ONLY what the performance bench page
//          needs (/tools/perf-bench.html, /dist/, /dist-min/, the camera and media placeholders). Nothing else in
//          the repository is reachable in this mode. For measuring a wall tablet: docs/performance.md.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.map': 'application/json',
  '.yaml': 'text/plain',
  '.md': 'text/plain'
};
const PLACEHOLDER =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#778"/><circle cx="60" cy="60" r="30" fill="#bbc"/></svg>';

export const TARGETS = ['dist', 'dist-min', 'src'];
const BUNDLE_URL = '/bundle/houseview.js';
const SHIM_ENTRY = {
  dist: '/dist/houseview.js',
  'dist-min': '/dist-min/houseview.js',
  src: '/src/index.js'
};
const VIRTUAL_CSS_URL = '/__virtual/houseview-css.js';

/** Source of the module served at `/bundle/houseview.js`. */
export function bundleSource(specifier) {
  return `export * from '${specifier}';\n`;
}

/** `src` target only: make `virtual:houseview-css` and `__HV_VERSION__` resolvable without a bundler. */
function injectSrcSupport(html, version) {
  const tags =
    `<script>globalThis.__HV_VERSION__=${JSON.stringify(version)}</script>` +
    `<script type="importmap">${JSON.stringify({imports: {'virtual:houseview-css': VIRTUAL_CSS_URL}})}</script>`;
  return /^\s*<!doctype html>/i.test(html)
    ? html.replace(/^(\s*<!doctype html>)/i, `$1${tags}`)
    : tags + html;
}

/** What `--lan` may serve: the bench page and the bundles it loads, never the rest of the repository. */
export const LAN_ALLOWED = [
  '/tools/perf-bench.html',
  '/dist/houseview.js',
  '/dist-min/houseview.js',
  '/camera_proxy/preview.svg',
  '/api/media_player_proxy/',
  '/favicon.ico'
];

/**
 * @param {Object} [options]
 * @param {string} [options.root]    directory to serve
 * @param {string} [options.host]    interface to listen on (default 127.0.0.1)
 * @param {string[]} [options.allow] when given, only these paths (or prefixes ending in /) are served; anything else is 404
 * @param {number} [options.port]    0 = any free port
 * @param {string} [options.target]  'dist' | 'dist-min' | 'src' (see file header)
 * @param { => Promise<string>} [options.virtualCss]  CSS text for the `src` target (default: tools/build.mjs)
 */
export function startServer({
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  port = 0,
  host = '127.0.0.1',
  allow,
  target = 'dist',
  virtualCss
} = {}) {
  if (!TARGETS.includes(target)) {
    throw new Error(`unknown target "${target}" (expected ${TARGETS.join(', ')})`);
  }
  root = path.resolve(root);
  const srcMode = target === 'src';

  const server = http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    if (
      allow &&
      !allow.some((entry) =>
        entry.endsWith('/') ? pathname.startsWith(entry) : pathname === entry
      )
    ) {
      res.writeHead(404, {'content-type': 'text/plain'}).end('not found');
      return;
    }
    if (pathname.startsWith('/api/media_player_proxy/')) {
      res
        .writeHead(200, {'content-type': 'image/svg+xml', 'cache-control': 'no-store'})
        .end(PLACEHOLDER);
      return;
    }
    if (pathname === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    if (pathname === BUNDLE_URL) {
      res
        .writeHead(200, {'content-type': TYPES['.js'], 'cache-control': 'no-store'})
        .end(bundleSource(SHIM_ENTRY[target]));
      return;
    }
    if (srcMode && pathname === VIRTUAL_CSS_URL) {
      try {
        const css = await (virtualCss ? virtualCss() : defaultVirtualCss(root));
        res
          .writeHead(200, {'content-type': TYPES['.js'], 'cache-control': 'no-store'})
          .end(`export default ${JSON.stringify(css)};\n`);
      } catch (e) {
        res.writeHead(500, {'content-type': 'text/plain'}).end(`css assembly failed: ${e.message}`);
      }
      return;
    }
    if (pathname === '/camera_proxy/preview.svg') {
      res
        .writeHead(200, {'content-type': 'image/svg+xml', 'cache-control': 'no-store'})
        .end(PLACEHOLDER);
      return;
    }
    let file = path.join(root, pathname);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) file = path.join(file, 'index.html');
      fs.readFile(file, (e, data) => {
        if (e) {
          res.writeHead(404, {'content-type': 'text/plain'}).end('not found');
          return;
        }
        const ext = path.extname(file).toLowerCase();
        const headers = {
          'content-type': TYPES[ext] || 'application/octet-stream',
          'cache-control': 'no-store'
        };
        res
          .writeHead(200, headers)
          .end(
            srcMode && ext === '.html' ? injectSrcSupport(String(data), readVersion(root)) : data
          );
      });
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const {port: actual} = server.address();
      resolve({
        server,
        port: actual,
        url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actual}`,
        close: () =>
          new Promise((r) => {
            server.closeAllConnections?.();
            server.close(() => r());
          })
      });
    });
  });
}

function readVersion(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

async function defaultVirtualCss(root) {
  const {buildCss} = await import('./build.mjs');
  return (await buildCss({root, dev: true})).css;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const targetArg = args.find((a) => a.startsWith('--target='));
  const portArg = args.find((a) => /^\d+$/.test(a));
  const target = targetArg ? targetArg.slice('--target='.length) : 'dist';
  if (args.includes('--lan')) {
    const s = await startServer({
      port: Number(portArg || 8765),
      host: '0.0.0.0',
      allow: LAN_ALLOWED
    });
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal)
      .map((a) => a.address);
    console.log(
      'HouseView bench server, reachable from the network, serving only the bench page and the bundles.'
    );
    for (const address of addresses) {
      console.log(
        `  http://${address}:${s.port}/tools/perf-bench.html?src=/dist/houseview.js&auto=1`
      );
    }
  } else {
    const s = await startServer({port: Number(portArg || 8765), target});
    console.log(`HouseView static server (${target}): ${s.url}/tests/browser.html`);
  }
}
