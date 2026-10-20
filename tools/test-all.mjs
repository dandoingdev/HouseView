// Run the whole test suite with the browser suites in parallel (`npm test`).
//
// Usage: node tools/test-all.mjs [--release] [--jobs=N] [--only=text]
//
//   (default)   unit tests, then the development bundle is built once and every browser suite runs against it
//   --release   also builds the minified bundle and runs the browser suite against it (`npm run test:release`)
//   --jobs=N    suites running at once (default: half the CPU cores, 2 to 4). Every suite starts its own server on a
//               free port and its own headless Chrome, so they do not share anything but the read-only bundle.
//   --only=text only the jobs whose name contains `text`
//
// Suites marked `alone` run by themselves once the others are done.
// Output is kept per job: a passing job prints one line, a failing job prints everything it said. `npm run
// test:serial` is the old one-after-another chain, for chasing a failure that only shows up under load.
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const node = (name, ...args) => ({name, args});
/** A suite that drives real touch input and animation frames: it slows down eight-fold when other Chromes compete for the CPU. */
const alone = (job) => ({...job, alone: true});
const page = (name, file, target = 'dist') =>
  node(name, 'tools/run-tests.mjs', file, `--target=${target}`);

/** Suites that read dist/houseview.js. */
const BROWSER_JOBS = [
  page('browser', 'tests/browser.html'),
  page('widgets', 'tests/widgets/index.html'),
  page('overviews', 'tests/overviews/index.html'),
  page('media-library page', 'tests/media-library.html'),
  node('media-library input', 'tests/media-library-input.mjs'),
  node('screensaver input', 'tests/overviews/screensaver-input.mjs'),
  node('timer input', 'tests/overviews/timer-input.mjs'),
  node('automatic input', 'tests/overviews/automatic-input.mjs'),
  node('light input', 'tests/overviews/light-input.mjs'),
  node('clock input', 'tests/overviews/clock-input.mjs'),
  node('volume input', 'tests/overviews/volume-input.mjs'),
  node('media seek', 'tests/media-seek-input.mjs'),
  node('panel input', 'tests/panel-input.mjs'),
  node('page menu input', 'tests/page-menu-input.mjs'),
  node('touch targets', 'tests/touch-targets.mjs'),
  alone(node('dashboard swipe', 'tests/dashboard-swipe-input.mjs'))
];

function run(job) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, job.args, {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => resolve({job, code, output, ms: Date.now() - started}));
  });
}

/** Run `jobs` with at most `limit` at a time; each result is reported as soon as it is done. */
async function pool(jobs, limit, report) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const result = await run(jobs[next++]);
      report(result);
      results.push(result);
    }
  };
  await Promise.all(Array.from({length: Math.min(limit, jobs.length)}, worker));
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const release = args.includes('--release');
  const jobsArg = args.find((a) => a.startsWith('--jobs='));
  const only = args.find((a) => a.startsWith('--only='))?.slice(7);
  const limit = jobsArg
    ? Number(jobsArg.slice(7))
    : Math.max(2, Math.min(4, Math.floor(os.cpus().length / 2)));
  const started = Date.now();
  const failed = [];
  const report = ({job, code, output, ms}) => {
    const seconds = (ms / 1000).toFixed(1).padStart(5);
    console.log(`${code === 0 ? 'ok  ' : 'FAIL'} ${seconds}s  ${job.name}`);
    if (code !== 0) {
      failed.push(job.name);
      console.log(output.replace(/^/gm, '    '));
    }
  };
  const keep = (jobs) => jobs.filter((job) => !only || job.name.includes(only));

  // The unit tests and the bundle build do not depend on each other.
  const first = [
    node(
      'unit',
      '--test',
      'tests/unit/*.test.mjs',
      'tests/contract/*.test.mjs',
      'tests/overviews/*.test.mjs'
    ),
    node('build dev', 'tools/build.mjs', '--dev', '--quiet'),
    ...(release ? [node('build min', 'tools/build.mjs', '--out-dir=dist-min', '--quiet')] : [])
  ];
  // `node --test` takes globs only through the shell, so expand them here.
  const {globSync} = await import('node:fs');
  for (const job of first) {
    job.args = job.args.flatMap((a) => (a.includes('*') ? globSync(a, {cwd: root}).sort() : [a]));
  }
  const built = await pool(keep(first), limit, report);
  if (built.some((r) => r.job.name.startsWith('build') && r.code !== 0)) {
    console.log('\nbuild failed, browser suites skipped');
    return 1;
  }

  const browser = [...BROWSER_JOBS];
  if (release) browser.push(page('browser (minified)', 'tests/browser.html', 'dist-min'));
  const shared = keep(browser).filter((job) => !job.alone);
  const exclusive = keep(browser).filter((job) => job.alone);
  await pool(shared, limit, report);
  await pool(exclusive, 1, report); // after the rest, so nothing else is using the CPU

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n${failed.length ? `FAILED: ${failed.join(', ')}` : 'all passed'} in ${seconds}s (${limit} at once)`
  );
  return failed.length ? 1 : 0;
}

process.exit(await main());
