// Headless browser test runner for pages that report into #summary / #results (tests/browser.html,
// tests/widgets/index.html, tests/overviews/index.html).
//
// Usage: node tools/run-tests.mjs [page.html] [--target=dist|dist-min|src] [--timeout=ms] [--expect=N]
//
//   --target=dist      (default) pages import `/bundle/houseview.js`, which the server maps to /dist/houseview.js
//                      (run `npm run build:dev` first)
//   --target=dist-min  the same against /dist-min/houseview.js, the minified production bundle (run
//                      `npm run build:min` first, or `npm run test:browser:min` which does both)
//   --target=src       the same against the unbundled /src/index.js (debugging aid, see tools/serve.mjs)
//   --expect=N         fail unless exactly N checks ran. The default comes from tests/EXPECTED_CHECKS (one
//                      `page: count` line per page); a page without an entry has no fixed count.
//
// Exit code: 0 all green; 1 any FAIL, browser error, no results, timeout or wrong check count; 2 usage/setup.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer, TARGETS} from './serve.mjs';

export const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PAGE = 'tests/browser.html';

function option(args, name) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

/** Expected check count: explicit --expect, else the `page: count` line of tests/EXPECTED_CHECKS. */
function expectedChecks(args, page) {
  const explicit = option(args, 'expect');
  if (explicit !== undefined) return Number(explicit);
  const file = path.join(root, 'tests/EXPECTED_CHECKS');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const entry = /^\s*(\S+?)\s*[:=]\s*(\d+)\s*$/.exec(line);
    if (entry && entry[1] === page) return Number(entry[2]);
  }
  return null;
}

function bundleProblem(target) {
  const entry = {
    dist: 'dist/houseview.js',
    'dist-min': 'dist-min/houseview.js',
    src: 'src/index.js'
  }[target];
  const build = {dist: 'build:dev', 'dist-min': 'build:min', src: 'gen'}[target];
  if (entry && !fs.existsSync(path.join(root, entry))) {
    return `--target=${target} needs ${entry}; run \`npm run ${build}\` first`;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const timeoutArg = option(args, 'timeout');
  const timeout = timeoutArg ? Number(timeoutArg) : 120000;
  const page_ = (args.find((a) => !a.startsWith('--')) || DEFAULT_PAGE).replace(/^\/+/, '');
  const target = option(args, 'target') || 'dist';
  if (!TARGETS.includes(target)) {
    console.error(`unknown --target=${target} (expected ${TARGETS.join(', ')})`);
    return 2;
  }
  const problem = bundleProblem(target);
  if (problem) {
    console.error(problem);
    return 2;
  }
  const expected = expectedChecks(args, page_);

  const srv = await startServer({root, port: 0, target});
  let browser;
  let code = 1;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    let errors = 0;
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      // Reported via [note] lines below; fixtures request missing images on purpose.
      if (/^Failed to load resource/.test(m.text())) return;
      errors++;
      console.error(`[console.error] ${m.text()}`);
    });
    page.on('pageerror', (e) => {
      errors++;
      console.error(`[uncaught] ${e.message}`);
    });
    page.on('response', (r) => {
      if (r.status() >= 400) {
        console.log(
          `[note] http ${r.status()} ${r.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, '')}`
        );
      }
    });
    page.on('requestfailed', (r) =>
      console.error(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`)
    );
    await page.goto(`${srv.url}/${page_}`, {waitUntil: 'load', timeout: 30000});
    let timedOut = false;
    try {
      await page.waitForFunction(
        () => {
          const s = document.querySelector('#summary');
          return s && !/Running/.test(s.textContent);
        },
        {timeout, polling: 100}
      );
    } catch {
      timedOut = true;
    }
    const out = await page.evaluate(() => ({
      summary: document.querySelector('#summary')?.textContent ?? '(no #summary)',
      lines: [...document.querySelectorAll('#results > *')].map((li) => li.textContent.trim())
    }));
    for (const l of out.lines) console.log(l);
    const pass = out.lines.filter((l) => l.startsWith('PASS')).length;
    const fail = out.lines.filter((l) => l.startsWith('FAIL')).length;
    console.log(`\nSummary: ${out.summary}`);
    console.log(`Target: ${target}`);
    console.log(`Counted: ${pass} PASS, ${fail} FAIL, ${errors} browser errors`);
    if (timedOut) {
      console.error(`TIMEOUT after ${timeout}ms (test page threw before finishing or hung)`);
    }
    const wrongCount = expected !== null && pass + fail !== expected;
    if (wrongCount) console.error(`EXPECTED ${expected} checks but ${pass + fail} ran`);
    code = timedOut || fail > 0 || errors > 0 || !out.lines.length || wrongCount ? 1 : 0;
  } catch (e) {
    console.error('run-tests failed:', e.message);
    code = 2;
  } finally {
    await browser?.close().catch(() => {});
    await srv.close();
  }
  return code;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
