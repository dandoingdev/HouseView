// Bump the cache-busting ?v= on the installed HouseView Lovelace resources.
//
// Usage: node tools/bump-cache.mjs --file <houseview.js> --storage <lovelace_resources> [--dry-run]
//
// The new value is `<package version>-<first 8 hex chars of sha256(file)>`. Only these paths are
// rewritten; every other resource is left as it is:
//   /local/houseview/houseview.js
//   /local/houseview/houseview-card.js
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const HOUSEVIEW_PATHS = [
  '/local/houseview/houseview.js',
  '/local/houseview/houseview-card.js'
];

/** Cache token browsers have not seen for these exact bytes. */
export function cacheToken(version, sha256hex) {
  return `${version}-${sha256hex.slice(0, 8)}`;
}

/** Replace ?v= on a HouseView resource URL. Any other URL is returned unchanged. */
export function bumpResourceUrl(url, token) {
  const query = url.indexOf('?');
  const resourcePath = query < 0 ? url : url.slice(0, query);
  if (!HOUSEVIEW_PATHS.includes(resourcePath)) return url;
  return `${resourcePath}?v=${token}`;
}

/**
 * Rewrite HouseView resource URLs in a lovelace_resources document.
 * @returns {number} how many URLs changed
 */
export function bumpDocument(doc, token) {
  const items = doc?.data?.items;
  if (!Array.isArray(items)) throw new Error('lovelace_resources has no data.items array');
  let changed = 0;
  for (const item of items) {
    if (typeof item?.url !== 'string') continue;
    const next = bumpResourceUrl(item.url, token);
    if (next !== item.url) {
      item.url = next;
      changed++;
    }
  }
  return changed;
}

function option(args, name) {
  const hit = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (hit < 0) return undefined;
  const arg = args[hit];
  return arg.includes('=') ? arg.slice(name.length + 3) : args[hit + 1];
}

function readVersion() {
  return JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
}

export function main(argv = process.argv.slice(2)) {
  const file = option(argv, 'file');
  const storage = option(argv, 'storage');
  if (!file || !storage) {
    console.error(
      'bump-cache: --file <houseview.js> and --storage <lovelace_resources> are required'
    );
    return 2;
  }
  if (!fs.existsSync(file)) {
    console.error(`bump-cache: ${file} not found`);
    return 2;
  }
  if (!fs.existsSync(storage)) {
    console.error(`bump-cache: ${storage} not found`);
    return 2;
  }
  const bytes = fs.readFileSync(file);
  const token = cacheToken(readVersion(), crypto.createHash('sha256').update(bytes).digest('hex'));
  const doc = JSON.parse(fs.readFileSync(storage, 'utf8'));
  const before = (doc.data?.items || [])
    .filter((item) => HOUSEVIEW_PATHS.includes(String(item.url || '').split('?')[0]))
    .map((item) => item.url);
  if (!before.length) {
    console.error('bump-cache: no /local/houseview resource in the storage file');
    return 1;
  }
  const changed = bumpDocument(doc, token);
  const after = before.map((url) => bumpResourceUrl(url, token));
  if (argv.includes('--dry-run') || changed === 0) {
    for (const url of after) console.log(`bump-cache: ${changed ? 'would set' : 'already'} ${url}`);
    return 0;
  }
  const tmp = `${storage}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`);
  fs.renameSync(tmp, storage);
  for (const url of after) console.log(`bump-cache: set ${url}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
