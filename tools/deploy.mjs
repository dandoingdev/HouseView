// Copy the built release files to a directory (for example the www folder of a Home Assistant config).
//
// Usage: node tools/deploy.mjs --dest <dir> [--dry-run]
//
// --dest is mandatory. Only the RELEASE_FILES allow-list is copied from dist/. Nothing here contacts
// Home Assistant.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RELEASE_FILES} from './release.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const args = process.argv.slice(2);
  const i = args.findIndex((a) => a === '--dest' || a.startsWith('--dest='));
  const dest = i < 0 ? undefined : args[i].includes('=') ? args[i].slice(7) : args[i + 1];
  if (!dest) {
    console.error('deploy: --dest <dir> is required');
    return 2;
  }
  const dist = path.join(REPO, 'dist');
  const files = RELEASE_FILES.filter((f) => fs.existsSync(path.join(dist, f)));
  if (!files.includes('houseview.js')) {
    console.error('deploy: dist/houseview.js not found; run `npm run build` first');
    return 2;
  }
  // `npm run build:dev` (and the test scripts that call it) overwrite dist/ with the unminified bundle.
  if (fs.readFileSync(path.join(dist, 'houseview.js'), 'utf8').includes('sourceMappingURL=data:')) {
    console.error('deploy: dist/houseview.js is the development bundle; run `npm run build` first');
    return 2;
  }
  const dry = args.includes('--dry-run');
  if (!dry) fs.mkdirSync(dest, {recursive: true});
  for (const f of files) {
    if (!dry) fs.copyFileSync(path.join(dist, f), path.join(dest, f));
    console.log(`deploy: ${dry ? 'would copy' : 'copied'} ${f} -> ${path.join(dest, f)}`);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
