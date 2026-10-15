/* global window */
// Performance bench for very low-end wall tablets (target: a low-end Android tablet, about a Snapdragon
// 429, 2 GB RAM, 1280x800, Android WebView, weak GPU). It drives Chrome through the DevTools protocol:
//
//   - emulates 1280x800 (landscape) and 800x1280 (portrait) touch tablets,
//   - throttles the network (Wi-Fi like) and the CPU (4x and 6x, Emulation.setCPUThrottlingRate),
//   - loads the bundle in the REAL card (tools/perf-bench.html) against a mock hass (12 widgets on 3 pages:
//     clock, date, camera snapshot, timer, media player, weather, sensor, 2 lights, lock, cover, climate),
//   - measures bundle fetch and parse/eval time, time to first render, JS time per hass update (500 updates, for an
//     unrelated and for a shown entity), main-thread work and long tasks (>50 ms) during a 3 s idle, dropped frames
//     over idle, over page swipes (Web Animations transition) and while the weather screensaver is up (with and
//     without animation), JS heap, DOM nodes, event listeners and compositor layers.
//
// Usage:
//   node tools/perf-bench.mjs                         both viewports at 4x and 6x, checks the 6x numbers
//   npm run perf                                      the same
//   node tools/perf-bench.mjs --throttle=6 --viewports=1280x800 --runs=3
//   options:
//     --src=/dist/houseview.js     module URL of the bundle (default: the current dist build)
//     --build=prod|dev             build that bundle first (default: use what is in dist/)
//     --throttle=4,6               CPU throttling rates (6 is the one the budgets are written for)
//     --viewports=1280x800,800x1280
//     --runs=N                     repeat each configuration N times and report the median (default 1)
//     --performance=auto|full|lite put `performance: <value>` into the card config (default: leave it out)
//     --device=desktop|tablet      tablet = Android 9 WebView user agent and 4 cores, so `performance: auto` picks lite
//     --only=a,b                   run only these phases: load (always), hass, idle, swipe, ss
//     --json=<file>                write the raw numbers
//     --compare=<file>             print a before/after column against an earlier --json file
//     --no-check                   report only; never fail on a budget
//     --write-budgets              rewrite tools/perf-budgets.json from this run (see docs/performance.md)
//     --budgets-from=<file>        the same from an earlier --json run, without running anything
//
// The budgets in tools/perf-budgets.json are RELATIVE: they come from this Mac under 6x throttling, with headroom. They
// catch regressions; they do not predict the tablet. The owner measures the real device with the same page
// (tools/perf-bench.html?auto=1) and compares the shapes (see docs/performance.md).
//
// Exit code: 0 within budget, 1 a budget is exceeded or a phase failed, 2 usage or setup error.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer} from './serve.mjs';

const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_FILE = path.join(root, 'tools/perf-budgets.json');

/** Stand-in for the owner's tablet: Android 9 WebView, 4 cores (what `performance: auto` looks at). */
const TABLET_UA =
  'Mozilla/5.0 (Linux; Android 9; Generic Tablet Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Safari/537.36';
/** About 20 Mbit/s down, 30 ms latency: the Wi-Fi of a wall tablet. */
const NETWORK = {offline: false, latency: 30, downloadThroughput: 2.5e6, uploadThroughput: 0.6e6};

const opt = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) opt[m[1]] = m[2] ?? true;
}

const throttles = String(opt.throttle || '4,6')
  .split(',')
  .map(Number);
const viewports = String(opt.viewports || '1280x800,800x1280')
  .split(',')
  .map((v) => {
    const [width, height] = v.split('x').map(Number);
    return {name: v, width, height};
  });
const runs = Math.max(1, Number(opt.runs || 1));
const only = opt.only ? new Set(String(opt.only).split(',')) : null;
const wants = (phase) => !only || only.has(phase);
const src = opt.src || '/dist/houseview.js';

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round = (n, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Performance.getMetrics as a name -> value map. */
async function metrics(cdp) {
  const {metrics: list} = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(list.map((m) => [m.name, m.value]));
}
const delta = (after, before, name) => (after[name] ?? 0) - (before[name] ?? 0);

/**
 * Trace `ms` of the page and boil it down. `layers` and `tileMB` come from the compositor's own snapshot (the data
 * behind DevTools' Layers panel), `surfaces` from its RenderSurfaceReasonCount (each one is an offscreen pass:
 * backdrop filters, masks, opacity groups), raster and paint from the task durations.
 */
async function traceStats(page, ms) {
  await page.tracing.start({
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'cc',
      'disabled-by-default-cc.debug'
    ]
  });
  await sleep(ms);
  const raw = await page.tracing.stop();
  const trace = JSON.parse(Buffer.from(raw).toString());
  const events = trace.traceEvents || trace;
  const snapshot = events
    .filter((e) => e.name === 'LayerTreeHostImpl:snapshot' && e.args?.snapshot?.active_tiles)
    .at(-1)?.args.snapshot;
  const layers = (snapshot?.active_tree?.layers || []).filter((l) => l.draws_content).length;
  const tileBytes = (snapshot?.active_tiles || []).reduce(
    (a, t) => a + (t.gpu_memory_usage || 0),
    0
  );
  const surfaceEvent = events.filter((e) => e.name === 'RenderSurfaceReasonCount').at(-1);
  const surfaces = Object.values(surfaceEvent?.args || {}).reduce(
    (a, b) => a + (Number(b) || 0),
    0
  );
  const sum = (name) =>
    events.filter((e) => e.name === name && e.ph === 'X').reduce((a, e) => a + (e.dur || 0), 0) /
    1000;
  return {
    layers,
    tileMB: tileBytes / 1048576,
    surfaces,
    rasterMsPerSec: (sum('RasterTask') * 1000) / ms,
    paintMsPerSec: (sum('Paint') * 1000) / ms
  };
}

/** One configuration: a fresh browser, one viewport, one CPU throttling rate. Returns {metric: number}. */
async function runOnce(srv, viewport, rate) {
  const out = {};
  const put = (name, value, digits = 1) => {
    out[name] = round(value, digits);
  };
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--lang=en-GB',
      '--force-color-profile=srgb',
      '--disable-features=CalculateNativeWinOcclusion',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding'
    ]
  });
  const problems = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true
    });
    page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) {
        problems.push(`console.error: ${m.text()}`);
      }
    });
    const cdp = await page.createCDPSession();
    await cdp.send('Performance.enable', {timeDomain: 'timeTicks'});
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
    await cdp.send('Network.emulateNetworkConditions', NETWORK);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate});
    if (opt.device === 'tablet') {
      await cdp.send('Emulation.setUserAgentOverride', {
        userAgent: TABLET_UA,
        platform: 'Linux armv8l'
      });
      await cdp.send('Emulation.setHardwareConcurrencyOverride', {hardwareConcurrency: 4});
    }
    await page.goto(`${srv.url}/tools/perf-bench.html?src=${encodeURIComponent(src)}`, {
      waitUntil: 'load'
    });
    await page.waitForFunction(() => window.__benchReady === true, {timeout: 30000});
    const call = (fn, ...args) => page.evaluate((f, a) => window.__bench[f](...a), fn, args);
    const reduced = (on) =>
      page.emulateMediaFeatures([
        {name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference'}
      ]);
    await reduced(false);
    const takeLong = async (prefix) => {
      const lt = await call('takeLongTasks');
      put(`${prefix}.longTasks`, lt.count, 0);
      put(`${prefix}.longTaskMaxMs`, lt.max, 0);
    };
    /** Compositor numbers from a short trace: layers, tile memory, render surfaces, raster and paint time. */
    const compositor = async (prefix, ms = 1500) => {
      const stats = await traceStats(page, ms);
      put(`${prefix}.layers`, stats.layers, 0);
      put(`${prefix}.tileMB`, stats.tileMB, 1);
      put(`${prefix}.renderSurfaces`, stats.surfaces, 0);
      put(`${prefix}.rasterMsPerSec`, stats.rasterMsPerSec, 0);
      put(`${prefix}.paintMsPerSec`, stats.paintMsPerSec, 1);
    };

    // ---- load: fetch, parse + evaluate, first render ----
    put('env.vsyncMs', await call('calibrate'), 1);
    const load = await call('load');
    put('load.fetchMs', load.fetchMs, 0);
    put('load.evalMs', load.evalMs, 0);
    put('load.bundleKB', (load.encodedBodySize || 0) / 1024, 1);
    const hasScreensaver = wants('ss');
    const config = {
      screensaver: hasScreensaver,
      ...(opt.performance ? {performance: opt.performance} : {})
    };
    const mount = await call('mount', config);
    if (mount.tiles < 3) problems.push(`only ${mount.tiles} tiles rendered`);
    // `performance: lite` must really have switched the blur off; anything else must have left it on
    if (opt.performance && opt.performance !== 'auto') {
      const lite = opt.performance === 'lite';
      if (mount.lite !== lite)
        problems.push(
          `performance: ${opt.performance} but the card is ${mount.lite ? 'lite' : 'full'}`
        );
      if (lite && mount.tileBackdrop !== 'none')
        problems.push(`lite tiles still have backdrop-filter ${mount.tileBackdrop}`);
      if (!lite && mount.tileBackdrop === 'none')
        problems.push('full tiles lost their backdrop-filter');
    }
    put('env.lite', mount.lite ? 1 : 0, 0);
    put('load.firstRenderMs', mount.firstPaintMs, 0);
    put('load.styledMs', mount.styledMs, 0);
    put('load.totalMs', load.importMs + mount.firstPaintMs, 0);
    await takeLong('load');
    await sleep(500);

    // ---- JS cost of Home Assistant pushing a new hass object ----
    if (wants('hass')) {
      const unrelated = await call('hassStorm', 500, false);
      put('hass.unrelatedMs', unrelated.mean, 3);
      put('hass.unrelatedP95Ms', unrelated.p95, 3);
      const related = await call('hassStorm', 500, true);
      put('hass.relatedMs', related.mean, 3);
      put('hass.relatedP95Ms', related.p95, 3);
      await takeLong('hass');
      await sleep(300);
    }

    // ---- idle: nothing changes, nothing should happen ----
    if (wants('idle')) {
      await sleep(1000);
      await call('takeLongTasks');
      const before = await metrics(cdp);
      await sleep(3000);
      const after = await metrics(cdp);
      put('idle.taskMsPerSec', (delta(after, before, 'TaskDuration') * 1000) / 3, 1);
      put('idle.scriptMsPerSec', (delta(after, before, 'ScriptDuration') * 1000) / 3, 1);
      put('idle.layoutsPerSec', delta(after, before, 'LayoutCount') / 3, 1);
      put('idle.recalcsPerSec', delta(after, before, 'RecalcStyleCount') / 3, 1);
      await takeLong('idle');
      const frames = await call('frames', 3000);
      put('idle.droppedFrames', frames.dropped, 0);
      put('idle.worstFrameMs', frames.worst, 0);
      await compositor('idle');
      await call('takeLongTasks');
    }

    // ---- page swipes (touch drag -> pointer events -> the Web Animations page glide) ----
    if (wants('swipe')) {
      const box = await call('faceBox');
      const y = box.y + box.height / 2;
      const SWIPES = 6;
      const before = await metrics(cdp);
      const frames = call('frames', SWIPES * 650);
      let turned = 0;
      for (let i = 0; i < SWIPES; i++) {
        // right to left on pages 0 and 1, then back left to right: 0 -> 1 -> 2 -> 1 -> 0 -> 1 -> 2
        const at = await call('pageIndex');
        const forward = i < 2 || i >= 4;
        const from = forward ? box.x + box.width * 0.8 : box.x + box.width * 0.2;
        const to = forward ? box.x + box.width * 0.2 : box.x + box.width * 0.8;
        const touch = await page.touchscreen.touchStart(from, y);
        for (let step = 1; step <= 6; step++) {
          await touch.move(from + ((to - from) * step) / 6, y);
          await sleep(16);
        }
        await touch.end();
        await sleep(560);
        if ((await call('pageIndex')) !== at) turned++;
      }
      const result = await frames;
      const after = await metrics(cdp);
      put('swipe.droppedFrames', result.dropped, 0);
      put('swipe.worstFrameMs', result.worst, 0);
      put('swipe.mainMsPerSwipe', (delta(after, before, 'TaskDuration') * 1000) / SWIPES, 1);
      put('swipe.layoutsPerSwipe', delta(after, before, 'LayoutCount') / SWIPES, 1);
      put('swipe.pagesTurned', turned, 0);
      await takeLong('swipe');
      if (turned < SWIPES - 1)
        problems.push(`swipe: only ${turned} of ${SWIPES} swipes turned the page`);
      await call('setPage', 0);
      await sleep(600);
      await call('takeLongTasks');
    }

    // ---- weather screensaver: still and animated, a heavy cloud scene and a rain scene ----
    if (hasScreensaver) {
      const scenes = [
        ['partly', 'partlycloudy'],
        ['rain', 'rainy']
      ];
      for (const [name, condition] of scenes) {
        for (const animated of [true, false]) {
          const prefix = `ss.${name}.${animated ? 'anim' : 'still'}`;
          await call('setState', 'weather.home', condition);
          await reduced(!animated);
          await sleep(300);
          const state = await call('screensaver', true);
          if (!state.active || !state.layer) {
            problems.push(`${prefix}: screensaver did not show`);
            continue;
          }
          await sleep(700);
          await call('takeLongTasks');
          // main-thread work with nothing but the page itself asking for frames ...
          const before = await metrics(cdp);
          await sleep(3000);
          const after = await metrics(cdp);
          put(`${prefix}.taskMsPerSec`, (delta(after, before, 'TaskDuration') * 1000) / 3, 1);
          put(`${prefix}.recalcsPerSec`, delta(after, before, 'RecalcStyleCount') / 3, 1);
          await takeLong(prefix);
          // ... and then the frame cadence a requestAnimationFrame loop sees
          const frames = await call('frames', 3000);
          put(`${prefix}.droppedFrames`, frames.dropped, 0);
          put(`${prefix}.worstFrameMs`, frames.worst, 0);
          await compositor(prefix);
          await call('screensaver', false);
          await sleep(500);
        }
      }
      await reduced(false);
    }

    // ---- memory ----
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    const heap = await cdp.send('Runtime.getHeapUsage');
    const end = await metrics(cdp);
    put('memory.jsHeapMB', heap.usedSize / 1048576, 1);
    put('memory.domNodes', end.Nodes ?? 0, 0);
    put('memory.listeners', end.JSEventListeners ?? 0, 0);
    put('memory.documents', end.Documents ?? 0, 0);

    const consoleProblems = problems.filter((p) => !p.includes('Failed to load resource'));
    if (consoleProblems.length) out.__problems = consoleProblems;
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}

/** Median of `runs` repetitions of one configuration. */
async function run(srv, viewport, rate) {
  const samples = [];
  const problems = [];
  for (let i = 0; i < runs; i++) {
    const result = await runOnce(srv, viewport, rate);
    if (result.__problems) problems.push(...result.__problems);
    delete result.__problems;
    samples.push(result);
  }
  const names = Object.keys(samples[0]);
  const merged = {};
  for (const name of names) {
    const values = samples.map((s) => s[name]).filter((v) => typeof v === 'number');
    merged[name] = values.length ? round(median(values), 3) : undefined;
  }
  return {values: merged, problems: [...new Set(problems)]};
}

// ---- budgets -------------------------------------------------------------------------------------------------

function readBudgets() {
  try {
    return JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/** Metrics of one table row that exceed their budget at the reference rate. */
function evaluate(results, budgets) {
  const failures = [];
  if (!budgets) return failures;
  for (const entry of Object.values(results)) {
    if (entry.rate !== budgets.reference.throttle) continue;
    for (const [metric, limit] of Object.entries(budgets.budgets)) {
      const value = entry.values[metric];
      if (value === undefined) continue;
      if (value > limit) failures.push({viewport: entry.viewport, metric, value, limit});
    }
  }
  return failures;
}

/** Headroom rules for --write-budgets: timings x2 (+ a floor), counts x2 + 2, sizes x1.25. */
function suggest(results, rate = Math.max(...throttles)) {
  const reference = Object.values(results).filter((r) => r.rate === rate);
  const worst = {};
  for (const r of reference) {
    for (const [metric, value] of Object.entries(r.values)) {
      if (typeof value === 'number') worst[metric] = Math.max(worst[metric] ?? 0, value);
    }
  }
  const budgets = {};
  for (const [metric, value] of Object.entries(worst)) {
    // reported, not budgeted: the environment, the check that the swipes worked, and the noisy raster / paint times
    if (/^env\.|pagesTurned|rasterMsPerSec|paintMsPerSec/.test(metric)) continue;
    if (metric.startsWith('load.bundleKB')) budgets[metric] = round(value * 1.25, 0);
    else if (metric.startsWith('memory.')) budgets[metric] = round(value * 1.5 + 1, 0);
    else if (/droppedFrames|longTasks|layers|layoutsPerSec|recalcsPerSec/.test(metric)) {
      budgets[metric] = Math.ceil(value * 2 + 2);
    } else if (/Ms\b|MsPerSec|Ms$/.test(metric)) {
      budgets[metric] = Math.ceil(value * 2 + (value < 5 ? 1 : 0)) || 1;
    } else budgets[metric] = Math.ceil(value * 2);
  }
  return budgets;
}

// ---- report --------------------------------------------------------------------------------------------------

function printTable(results, budgets, compare) {
  const columns = Object.entries(results);
  const metrics = [...new Set(columns.flatMap(([, r]) => Object.keys(r.values)))];
  const nameWidth = Math.max(...metrics.map((m) => m.length), 6);
  const header = columns.map(([, r]) => `${r.viewport} @${r.rate}x`);
  const cell = (v) => (v === undefined ? '-' : String(v));
  const widths = header.map((h, i) =>
    Math.max(
      h.length,
      ...metrics.map((m) => cell(columns[i][1].values[m]).length),
      compare ? 14 : 0
    )
  );
  const budgetWidth = 8;
  const line = (name, cells, budget) =>
    `${name.padEnd(nameWidth)}  ${cells.map((c, i) => c.padStart(widths[i])).join('  ')}  ${budget.padStart(budgetWidth)}`;
  console.log(line('metric', header, 'budget(6x)'));
  console.log('-'.repeat(nameWidth + 2 + widths.reduce((a, b) => a + b + 2, 0) + budgetWidth + 2));
  let group = '';
  for (const metric of metrics) {
    const g = metric.split('.')[0];
    if (g !== group) {
      if (group) console.log('');
      group = g;
    }
    const cells = columns.map(([key, r]) => {
      const v = r.values[metric];
      let text = cell(v);
      const base = compare?.[key]?.values?.[metric];
      if (compare && base !== undefined && v !== undefined) text = `${base} -> ${v}`;
      const over =
        budgets &&
        r.rate === budgets.reference.throttle &&
        v > (budgets.budgets[metric] ?? Infinity);
      return over ? `${text} !` : text;
    });
    console.log(line(metric, cells, cell(budgets?.budgets?.[metric])));
  }
}

/** Write tools/perf-budgets.json from a set of results (the 6x cells, or the slowest rate present). */
function writeBudgets(results) {
  const rate = Math.max(...Object.values(results).map((r) => r.rate));
  const next = {
    description:
      'Relative budgets for tools/perf-bench.mjs. Measured on one Mac (Chrome, software rasteriser, ' +
      `${rate}x CPU throttle, Wi-Fi like network) and given headroom; they catch regressions and do NOT predict ` +
      'the tablet. Measure the real device with tools/perf-bench.html?auto=1 and compare shapes, not numbers ' +
      '(docs/performance.md).',
    reference: {
      throttle: rate,
      viewports: [...new Set(Object.values(results).map((r) => r.viewport))],
      headroom: 'timings x2, counts x2+2, bundle size x1.25, memory x1.5+1'
    },
    budgets: suggest(results, rate)
  };
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(next, null, 2) + '\n');
  console.log(`\nwrote ${path.relative(root, BUDGET_FILE)}`);
}

async function main() {
  if (opt['budgets-from']) {
    // no run: derive the budgets from the results of an earlier --json run
    writeBudgets(JSON.parse(fs.readFileSync(path.resolve(opt['budgets-from']), 'utf8')).results);
    return 0;
  }
  const budgets = readBudgets();
  if (opt.build) {
    const {build} = await import('./build.mjs');
    await build({root, dev: opt.build === 'dev', quiet: true});
  }
  if (!fs.existsSync(path.join(root, src.replace(/^\//, '')))) {
    console.error(`bundle ${src} not found; run \`npm run build\` first`);
    return 2;
  }
  const srv = await startServer({root, port: 0});
  const results = {};
  const problems = [];
  try {
    for (const rate of throttles) {
      for (const viewport of viewports) {
        const key = `${viewport.name}@${rate}`;
        process.stderr.write(`perf: ${viewport.name} at ${rate}x CPU throttle ...\n`);
        const {values, problems: found} = await run(srv, viewport, rate);
        results[key] = {viewport: viewport.name, rate, values};
        problems.push(...found.map((p) => `${key}: ${p}`));
      }
    }
  } finally {
    await srv.close();
  }

  let compare;
  if (opt.compare) {
    try {
      compare = JSON.parse(fs.readFileSync(path.resolve(opt.compare), 'utf8')).results;
    } catch (e) {
      console.error(`cannot read --compare file: ${e.message}`);
    }
  }
  console.log(
    `\nHouseView perf bench: ${src}, ${runs} run(s) per cell, ${opt.device === 'tablet' ? 'tablet user agent' : 'desktop user agent'}` +
      `${opt.performance ? `, performance: ${opt.performance}` : ''}\n`
  );
  printTable(results, budgets, compare);
  if (opt.json) {
    fs.mkdirSync(path.dirname(path.resolve(opt.json)), {recursive: true});
    fs.writeFileSync(path.resolve(opt.json), JSON.stringify({src, runs, results}, null, 2));
  }
  if (opt['write-budgets']) writeBudgets(results);
  if (problems.length) {
    console.error('\nproblems:');
    for (const p of problems) console.error(`  ${p}`);
  }
  const failures = opt['no-check'] || opt['write-budgets'] ? [] : evaluate(results, budgets);
  if (!budgets && !opt['write-budgets'])
    console.log('\nno tools/perf-budgets.json: nothing checked');
  if (failures.length) {
    console.error('\nOVER BUDGET:');
    for (const f of failures) {
      console.error(`  ${f.viewport} ${f.metric}: ${f.value} > ${f.limit}`);
    }
  } else if (budgets && !opt['no-check']) {
    console.log(`\nall budgets met at ${budgets.reference.throttle}x`);
  }
  return failures.length || problems.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
