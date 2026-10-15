// Warn when the production bundle exceeds its size budget (pass --strict to fail instead).
//
// Usage: node tools/size-check.mjs [--file=dist/houseview.js] [--max-raw=KB] [--max-gzip=KB] [--strict]
//
// The budget is a guardrail against accidental growth, not a technical limit: Home Assistant and HACS enforce nothing.
// Going over prints a warning and exits 0; --strict makes it exit 1.
//
// Budget history (docs/architecture.md):
//   160 KB raw / 45 KB gzip  the 16 widgets as planned
//   260 KB raw / 72 KB gzip  the first integrated build: measured 251.8 KB / 69.0 KB. The engine plus the HA tranche (action
//                            config, inline confirm, extensions, editors) came to roughly 190 KB; the overview family
//                            (screensaver mechanics, editor form, weather scene and its CSS sky) adds roughly 60 KB
//                            (estimated from per-module output sizes, not a separate build).
//   233 KB raw / 67 KB gzip  the performance work: the production bundle is fully minified (local identifiers too), which took
//                            it from 251.8 KB / 69.0 KB to 219.6 KB / 63.3 KB; the budget keeps about 6 % headroom.
// Change the numbers here, in one place, and note the reason in CHANGELOG.md.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUDGET = {rawKB: 233, gzipKB: 67};
const KB = 1024;

export function measure(file) {
  const bytes = fs.readFileSync(file);
  return {raw: bytes.length, gzip: zlib.gzipSync(bytes, {level: 9}).length};
}

/** @returns {{ok:boolean, lines:string[]}} */
export function evaluate({raw, gzip}, budget = BUDGET) {
  const rows = [
    ['raw', raw, budget.rawKB],
    ['gzip', gzip, budget.gzipKB]
  ];
  const lines = [];
  let ok = true;
  for (const [label, size, max] of rows) {
    const pct = Math.round((size / (max * KB)) * 100);
    const over = size > max * KB;
    if (over) ok = false;
    lines.push(
      `${over ? 'WARN' : 'ok  '} ${label.padEnd(4)} ${(size / KB).toFixed(1)} KB / ${max} KB (${pct}%)`
    );
  }
  return {ok, lines};
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const file = path.resolve(REPO, opt('file') || 'dist/houseview.js');
  if (!fs.existsSync(file)) {
    console.error(
      `size-check: ${path.relative(REPO, file)} not found; run \`npm run build\` first`
    );
    return 2;
  }
  const budget = {
    rawKB: Number(opt('max-raw') || BUDGET.rawKB),
    gzipKB: Number(opt('max-gzip') || BUDGET.gzipKB)
  };
  const {ok, lines} = evaluate(measure(file), budget);
  console.log(`size-check: ${path.relative(REPO, file)}`);
  for (const l of lines) console.log(`  ${l}`);
  if (!ok) {
    console.warn(
      'size-check: warning, over budget. Trim the bundle or raise BUDGET with a written reason.'
    );
    return args.includes('--strict') ? 1 : 0;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
