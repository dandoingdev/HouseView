// Development loop: esbuild watch (dev build) + static server on 127.0.0.1:8765. Never contacts HA.
//
// Usage: node tools/dev.mjs [port] [--target=dist|src]
//   Open http://127.0.0.1:8765/tests/browser.html for the browser suite against the live-rebuilding bundle
//   (target dist, the default here), or /tests/widgets/index.html for the widget suite.
//   New or removed widget folders re-run the generator, which triggers a rebuild.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from './build.mjs';
import {generate} from './gen-widgets.mjs';
import {startServer} from './serve.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a)) || 8765);
const target = args.find((a) => a.startsWith('--target='))?.slice(9) || 'dist';

await generate({repo: REPO});
const watcher = await build({root: REPO, dev: true, watch: true});
const server = await startServer({root: REPO, port, target});
console.log(`dev: serving ${server.url}/tests/browser.html (target ${target})`);

// esbuild does not notice new folders, so regenerate the discovery files when the tree changes shape.
let pending;
const widgetsDir = path.join(REPO, 'src/widgets');
if (fs.existsSync(widgetsDir)) {
  fs.watch(widgetsDir, {recursive: true}, (_event, name) => {
    if (!name || (/index\.js$/.test(name) && !name.includes(path.sep))) return;
    clearTimeout(pending);
    pending = setTimeout(
      () => generate({repo: REPO}).catch((e) => console.error(`dev: gen failed: ${e.message}`)),
      150
    );
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await watcher.dispose();
    await server.close();
    process.exit(0);
  });
}
