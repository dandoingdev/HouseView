#!/usr/bin/env node
/* global document, Image, navigator */
// Screenshots the weather overview (as a screensaver over a houseview-card) for 5 conditions x day/night x 3 viewports
// into .tmp/overview-shots/. Needs the dev bundle: npm run build:dev. Never contacts Home Assistant (mock hass in the page).
//
//   node tools/overview-shots.mjs [--out=.tmp/overview-shots] [--only=<regex on file name>] [--contrast]
//          [--viewports=1280x800,800x1280,390x844] [--mode=screensaver|card] [--page=/tools/overview-shots.html]
//
// --contrast also checks legibility: for every text box, the 95th-percentile lightest background pixel (text hidden)
// against white. Below 3.0 fails the run (exit 1); below 3.3 prints a warning. The look is a matter of taste;
// this only guards readability on the lightest skies.
//
// --page lets another page stand in for tools/overview-shots.html as long as it understands ?condition=&tod= and sets
// window.__shotReady (the scene may live in a shadow root: text boxes are found through shadow roots).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer} from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, '').split('='))
    .map(([k, v]) => [k, v ?? true])
);
const out = path.resolve(root, args.out || '.tmp/overview-shots');
if (out !== root && !out.startsWith(root + path.sep)) {
  throw new Error('overview-shots only writes inside this repository.');
}
const MODE = args.mode === 'card' ? 'card' : 'screensaver';
const PAGE = args.page && args.page !== true ? args.page : '/tools/overview-shots.html';
if (PAGE === '/tools/overview-shots.html' && !fs.existsSync(path.join(root, 'dist/houseview.js'))) {
  throw new Error('dist/houseview.js is missing. Run: npm run build:dev');
}

// [file name, day state, night state]
const CONDITIONS = [
  ['sunny', 'sunny', 'clear-night'],
  ['partlycloudy', 'partlycloudy', 'partlycloudy'],
  ['cloudy', 'cloudy', 'cloudy'],
  ['rainy', 'rainy', 'rainy'],
  ['snowy', 'snowy', 'snowy']
];
const VIEWPORTS = (args.viewports || '1280x800,800x1280,390x844')
  .split(',')
  .map((v) => v.split('x').map(Number));
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** Text the scene prints over the sky (selectors of src/overviews/weather/style.css). */
const TEXT = '.ov-cond-text,.ov-hl,.ov-time,.ov-detail-value,.ov-detail-label';

const luminance = ([r, g, b]) =>
  [r, g, b]
    .map((c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);

/** Worst contrast of white text over the screenshot (taken with the text hidden) across the given text boxes. */
async function worstContrast(page, boxes, base64) {
  const samples = await page.evaluate(
    async (b64, rects) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = Object.assign(document.createElement('canvas'), {
        width: img.width,
        height: img.height
      });
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return rects.map(([name, x, y, w, h]) => {
        const d = ctx.getImageData(
          Math.max(0, x | 0),
          Math.max(0, y | 0),
          Math.max(1, w | 0),
          Math.max(1, h | 0)
        ).data;
        const px = [];
        for (let i = 0; i < d.length; i += 28) px.push([d[i], d[i + 1], d[i + 2]]);
        return [name, px];
      });
    },
    base64,
    boxes
  );
  let worst = {ratio: Infinity, name: ''};
  for (const [name, px] of samples) {
    const lum = px.map((p) => luminance(p)).sort((a, b) => b - a);
    const ratio = 1.05 / ((lum[Math.floor(lum.length * 0.05)] ?? 0) + 0.05);
    if (ratio < worst.ratio) worst = {ratio, name};
  }
  return worst;
}

/** Bounding boxes of every text element, looking through shadow roots. */
const textBoxes = (page) =>
  page.evaluate((selector) => {
    const found = [];
    const visit = (node) => {
      for (const el of node.querySelectorAll('*')) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
      for (const el of node.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height)
          found.push([el.className || el.tagName, r.x, r.y, r.width, r.height]);
      }
    };
    visit(document);
    return found;
  }, TEXT);

/** Hide the content layer of the scene (text and numerals) wherever it lives. */
const hideContent = (page) =>
  page.evaluate(() => {
    const visit = (node) => {
      for (const el of node.querySelectorAll('*')) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
      for (const el of node.querySelectorAll('.ov-content')) el.style.visibility = 'hidden';
    };
    visit(document);
  });

fs.mkdirSync(out, {recursive: true});
const server = await startServer({root, port: 0});
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--force-device-scale-factor=1']
});
let failed = false;
const written = [];
try {
  for (const [name, dayState, nightState] of CONDITIONS) {
    for (const tod of ['day', 'night']) {
      for (const [w, h] of VIEWPORTS) {
        const file = `weather-${name}-${tod}-${w}x${h}${MODE === 'card' ? '-card' : ''}.png`;
        if (args.only && !new RegExp(args.only).test(file)) continue;
        const page = await browser.newPage();
        // Report a capable device (CI runners have 4 cores, which makes `performance: auto` pick the light mode).
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
          Object.defineProperty(navigator, 'deviceMemory', {get: () => 8});
        });
        await page.setViewport({width: w, height: h, deviceScaleFactor: 1});
        await page.emulateTimezone('Europe/London');
        // static, deterministic frames
        await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
        page.on('pageerror', (e) => {
          console.error(`[page error] ${file}: ${e.message}`);
          failed = true;
        });
        const state = tod === 'day' ? dayState : nightState;
        await page.goto(`${server.url}${PAGE}?condition=${state}&tod=${tod}&mode=${MODE}`);
        await page.waitForFunction('window.__shotReady === true', {timeout: 15000});
        await page.screenshot({path: path.join(out, file)});
        written.push(file);
        if (args.contrast) {
          const boxes = await textBoxes(page);
          await hideContent(page);
          const bare = await page.screenshot({encoding: 'base64'});
          const worst = await worstContrast(page, boxes, bare);
          const verdict = worst.ratio < 3 ? 'FAIL' : worst.ratio < 3.3 ? 'warn' : 'ok';
          console.log(
            `${verdict.padEnd(4)} ${file} worst ${worst.ratio.toFixed(2)} (${worst.name})`
          );
          if (verdict === 'FAIL') failed = true;
        }
        await page.close();
      }
    }
  }
  fs.writeFileSync(
    path.join(out, 'index.html'),
    '<!doctype html><meta charset="utf-8"><title>Weather overview shots</title>' +
      '<style>body{font:14px system-ui;margin:16px;background:#111;color:#eee}' +
      'img{max-width:100%;height:auto;margin:0 12px 12px 0;vertical-align:top;max-height:360px}</style>' +
      written
        .map(
          (f) =>
            `<figure style="display:inline-block;margin:0"><img src="${f}" alt="${f}"><figcaption>${f}</figcaption></figure>`
        )
        .join('')
  );
  console.log(`${written.length} screenshots in ${path.relative(root, out)}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
