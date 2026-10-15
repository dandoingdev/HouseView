/* global window, document, requestAnimationFrame, Image */
// Calibrates the opaque tint of `performance: lite` (src/overviews/_shared/performance.css).
//
// In `full` mode a tile is a translucent fill over a blurred wallpaper; `lite` has no blur, so the fill is made opaque.
// The tint is right when the MEAN colour of the tiles equals what the blurred glass shows. This tool renders the same
// ten widgets for every surface x appearance x palette x layout, once in `full` and once in `lite`, hides the text, and
// compares the mean colour inside the tiles.
//
//   node tools/lite-glass.mjs                  print the table
//   node tools/lite-glass.mjs --check          exit 1 when a mean differs by more than 6 on any channel
//   node tools/lite-glass.mjs --shots=<dir>    also write the screenshots (full-<name>.png, lite-<name>.png) for a look
//   node tools/lite-glass.mjs --src=/dist/houseview.js
//
// Needs a built bundle (npm run build:dev). Chrome at CHROME_PATH or the default macOS location.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer} from './serve.mjs';

const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return [m[1], m[2] ?? true];
  })
);
const TOLERANCE = 6;
const src = opt.src || '/dist/houseview.js';
if (opt.shots) fs.mkdirSync(path.resolve(opt.shots), {recursive: true});

const kinds = [
  ['light', 'light.a'],
  ['light', 'light.b'],
  ['lock', 'lock.a'],
  ['switch', 'switch.a'],
  ['sensor', 'sensor.a'],
  ['fan', 'fan.a'],
  ['cover', 'cover.a'],
  ['climate', 'climate.a'],
  ['weather', 'weather.a'],
  ['timer', 'timer.a']
];
const cards = kinds.map(([kind, entity]) => ({type: `custom:houseview-${kind}-card`, entity}));

const srv = await startServer({root, port: 0});
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb']
});

/** Mean colour inside the tiles of one configuration. */
async function measure(config, name, mode) {
  const page = await browser.newPage();
  await page.setViewport({width: 1280, height: 800, deviceScaleFactor: 1});
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  const cfg = {...config, performance: mode, cards};
  await page.goto(
    `${srv.url}/tools/lite-glass.html?src=${encodeURIComponent(src)}&cfg=${encodeURIComponent(JSON.stringify(cfg))}`
  );
  await page.waitForFunction(() => window.__ready === true, {timeout: 20000});
  await new Promise((r) => setTimeout(r, 600));
  if (opt.shots)
    await page.screenshot({path: path.join(path.resolve(opt.shots), `${mode}-${name}.png`)});
  const tiles = await page.evaluate(async () => {
    const shadow = window.__card.shadowRoot;
    const style = document.createElement('style');
    style.textContent =
      '.tile *,.tile::before,.tile::after,.page-nav,.feedback{visibility:hidden!important}';
    shadow.append(style);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return [...shadow.querySelectorAll('.tile')].map((t) => {
      const r = t.getBoundingClientRect();
      return {x: r.x, y: r.y, w: r.width, h: r.height};
    });
  });
  const shot = await page.screenshot({encoding: 'base64'});
  const mean = await page.evaluate(
    async (b64, rects) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const g = canvas.getContext('2d');
      g.drawImage(img, 0, 0);
      const sums = [0, 0, 0];
      for (const t of rects) {
        // the middle of the tile: away from the rim light and the corners
        const d = g.getImageData(
          Math.round(t.x + t.w * 0.25),
          Math.round(t.y + t.h * 0.25),
          Math.max(4, Math.round(t.w * 0.5)),
          Math.max(4, Math.round(t.h * 0.5))
        ).data;
        const mean = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) mean[c] += d[i + c];
        for (let c = 0; c < 3; c++) sums[c] += mean[c] / (d.length / 4);
      }
      return sums.map((v) => Math.round(v / rects.length));
    },
    shot,
    tiles
  );
  await page.close();
  return mean;
}

let worst = 0;
console.log('combination                         full            lite            delta');
for (const surface of ['glass', 'teal', 'silver', 'champagne', 'soft']) {
  for (const appearance of ['light', 'dark']) {
    for (const palette of ['stone', 'forest']) {
      // the wallpaper surfaces ignore appearance and palette: one run is enough
      if (
        surface !== 'glass' &&
        surface !== 'soft' &&
        (appearance !== 'light' || palette !== 'stone')
      )
        continue;
      if (surface === 'soft' && (appearance !== 'light' || palette !== 'stone')) continue;
      for (const layout of ['auto', 'controls']) {
        const name = `${surface}-${appearance}-${palette}-${layout}`;
        const config = {appearance, palette, pages: [{name: 'P', surface, layout}]};
        const full = await measure(config, name, 'full');
        const lite = await measure(config, name, 'lite');
        const delta = lite.map((v, i) => v - full[i]);
        worst = Math.max(worst, ...delta.map(Math.abs));
        console.log(
          `${name.padEnd(34)} ${full.join(',').padEnd(15)} ${lite.join(',').padEnd(15)} ${delta.join(',')}`
        );
      }
    }
  }
}
await browser.close();
await srv.close();
console.log(`\nlargest difference: ${worst} (tolerance ${TOLERANCE})`);
if (opt.check && worst > TOLERANCE) process.exit(1);
