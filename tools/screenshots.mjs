#!/usr/bin/env node
// Render the example dashboards with a mock Home Assistant and write the pictures used by the README.
//
//   node tools/screenshots.mjs                 all pictures into docs/images
//   node tools/screenshots.mjs --only=hero     one picture (name without .png)
//   node tools/screenshots.mjs --root=<dir>    use <dir>/dist/houseview.js and <dir>/tools (a scratch build)
//   node tools/screenshots.mjs --out=<dir>     write somewhere else
//
// Needs `npm run build:dev` (or `npm run build`) first, Google Chrome (CHROME_PATH to override) and puppeteer-core.
//
// Nothing here touches a real Home Assistant, and nothing is read from outside this repository:
//   * the entities are the placeholder ids of examples/*.yaml, and their states are made up below;
//   * every picture the page loads (camera snapshots, album art) is answered by this script with a drawing;
//   * `ha-icon` is a stand-in that draws simple line glyphs, because the Material Design icon set is part of
//     Home Assistant and is not available here. The glyphs show the layout, not the exact icons.
// The clock is frozen at 10:10 on 15 October 2026 (Europe/London) so that the pictures are reproducible.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {startServer} from './serve.mjs';
import {parseYaml, findAll} from './mini-yaml.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const opt = Object.fromEntries(
  process.argv
    .slice(2)
    .map((arg) => /^--([^=]+)(?:=(.*))?$/.exec(arg))
    .filter(Boolean)
    .map((m) => [m[1], m[2] ?? true])
);
const ROOT = path.resolve(opt.root || REPO);
const OUT = path.resolve(opt.out || path.join(REPO, 'docs/images'));

/** Height the carousel reserves for Home Assistant's header when it is not in tablet mode. */
const HEADER_ALLOWANCE = 56;

/** 10:10 in London on 2026-10-15 (BST). */
const NOW = Date.UTC(2026, 9, 15, 9, 10, 0);

// ---- what to draw --------------------------------------------------------------------------------------------------

/**
 * Each picture is one example file. `carousel`: the n-th houseview-card of the file at a viewport size, with the
 * page `page` selected. `grid`: every standalone card of the file in a grid.
 */
const SHOTS = [
  {name: 'hero', example: 'kitchen.yaml', kind: 'carousel', page: 0, size: [1280, 800]},
  {name: 'kitchen', example: 'kitchen.yaml', kind: 'carousel', page: 0, size: [800, 1280]},
  {name: 'music', example: 'kitchen.yaml', kind: 'carousel', page: 1, size: [1280, 800]},
  {name: 'controls', example: 'kitchen.yaml', kind: 'carousel', page: 2, size: [1280, 800]},
  {name: 'bedtime', example: 'bedtime.yaml', kind: 'carousel', page: 0, size: [1280, 800]},
  {name: 'widgets', example: 'single-cards.yaml', kind: 'grid', size: [1280, 900], columns: 3},
  // Full-screen overviews, shown the way a screensaver shows them (`preview: true` starts it at once).
  {
    name: 'overview-weather',
    kind: 'overview',
    screensaver: {type: 'weather', entity: 'weather.home'}
  },
  {
    name: 'overview-timer',
    kind: 'overview',
    screensaver: {type: 'timer', entity: 'timer.kitchen_timer'}
  },
  {
    name: 'overview-cover-art',
    kind: 'overview',
    screensaver: {type: 'cover_art', entity: 'media_player.kitchen_speaker'}
  },
  {
    name: 'overview-photo-frame',
    kind: 'overview',
    screensaver: {type: 'photo_frame', folder: 'Photos'}
  },
  {name: 'overview-calendar', kind: 'overview', screensaver: {type: 'calendar_month'}},
  {
    name: 'widget-weather-tile',
    kind: 'overview',
    size: [420, 420],
    cards: [
      {type: 'custom:houseview-weather-overview-card', entity: 'weather.home', display: 'tile'}
    ]
  }
];

// ---- a made-up Home Assistant ------------------------------------------------------------------------------------

const titleCase = (id) => {
  const text = id.split('.')[1].replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Fixed answers for the placeholder ids used in examples/; any other id gets a plausible default per domain. */
const KNOWN = {
  'light.living_room': ['on', {brightness: 190}],
  'light.kitchen': ['on', {brightness: 255}],
  'light.hallway': ['off', {}],
  'light.landing': ['off', {}],
  'light.porch': ['off', {}],
  'switch.coffee_machine': ['on', {}],
  'lock.front_door': ['locked', {}],
  'timer.kitchen_timer': [
    'active',
    {duration: '0:10:00', finishes_at: new Date(NOW + 522000).toISOString()}
  ],
  'cover.bedroom_blinds': ['open', {current_position: 60, supported_features: 15}],
  'alarm_control_panel.home': ['armed_home', {supported_features: 47}],
  'script.good_night': ['off', {}],
  'scene.morning': ['2026-10-15T06:45:00+00:00', {}],
  'sensor.hallway_temperature': ['21.4', {unit_of_measurement: '°C', device_class: 'temperature'}],
  'weather.home': [
    'partlycloudy',
    {
      temperature: 12,
      temperature_unit: '°C',
      humidity: 76,
      wind_speed: 7,
      wind_speed_unit: 'mph',
      forecast: [
        {
          datetime: '2026-10-15T00:00:00+01:00',
          condition: 'partlycloudy',
          temperature: 14,
          templow: 9
        },
        {
          datetime: '2026-10-16T00:00:00+01:00',
          condition: 'rainy',
          temperature: 13,
          templow: 8,
          precipitation: 3
        }
      ]
    }
  ],
  'sun.sun': ['above_horizon', {next_setting: '2026-10-15T18:32:00+00:00'}],
  'media_player.kitchen_speaker': [
    'playing',
    {
      media_title: 'Blue in Green',
      media_artist: 'Miles Davis',
      media_album_name: 'Kind of Blue',
      entity_picture: '/api/media_player_proxy/media_player.kitchen_speaker?token=demo',
      volume_level: 0.35,
      supported_features: 20533
    }
  ],
  'climate.living_room': [
    'heat',
    {
      temperature: 21,
      current_temperature: 20.4,
      min_temp: 7,
      max_temp: 30,
      target_temp_step: 0.5,
      hvac_modes: ['off', 'heat', 'cool'],
      supported_features: 385
    }
  ]
};

function stateFor(id) {
  const domain = id.split('.')[0];
  const [state, attributes] = KNOWN[id] || DEFAULT_BY_DOMAIN[domain] || ['unknown', {}];
  const extra = domain === 'camera' ? {entity_picture: `/camera_proxy/${id}?token=demo`} : {};
  return {state, attributes: {friendly_name: titleCase(id), ...attributes, ...extra}};
}
const DEFAULT_BY_DOMAIN = {
  light: ['off', {}],
  switch: ['off', {}],
  fan: ['off', {}],
  lock: ['locked', {}],
  camera: ['idle', {}],
  sensor: ['0', {}],
  weather: ['sunny', {temperature: 18, temperature_unit: '°C'}],
  scene: ['2026-10-15T06:45:00+00:00', {}],
  script: ['off', {}],
  button: ['unknown', {}],
  calendar: ['off', {}],
  climate: [
    'heat',
    {temperature: 20, current_temperature: 19.5, min_temp: 7, max_temp: 30, supported_features: 385}
  ],
  timer: ['idle', {}],
  media_player: ['paused', {supported_features: 20533, volume_level: 0.3}]
};

/** Every `entity:` and camera/`sun_entity:` id mentioned anywhere in a parsed example. */
function entitiesIn(doc) {
  const ids = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (
          typeof value === 'string' &&
          /^(entity|sun_entity)$/.test(key) &&
          /^[a-z_]+\.[a-z0-9_]+$/.test(value)
        )
          ids.add(value);
        if (Array.isArray(value) && key === 'entities')
          value
            .filter((v) => typeof v === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(v))
            .forEach((v) => ids.add(v));
        visit(value);
      }
    }
  };
  visit(doc);
  return [...ids];
}

// ---- pictures that the page loads --------------------------------------------------------------------------------

const hue = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** A calm made-up "camera view" so that no real picture is ever needed. */
function cameraSvg(name) {
  const h = hue(name);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="hsl(${h},35%,62%)"/><stop offset="1" stop-color="hsl(${h},30%,38%)"/></linearGradient></defs>` +
    `<rect width="320" height="200" fill="url(#s)"/><path d="M0 140 L90 95 L150 125 L230 80 L320 130 V200 H0Z" fill="hsl(${h},25%,28%)" opacity=".7"/>` +
    `<rect x="0" y="150" width="320" height="50" fill="hsl(${h},20%,22%)" opacity=".75"/></svg>`
  );
}

/** Album art stand-in: two overlapping discs. */
const ART_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#27424a"/>' +
  '<circle cx="85" cy="100" r="62" fill="#3f7a86"/><circle cx="125" cy="100" r="62" fill="#e1b66a" opacity=".85"/></svg>';

// ---- the page --------------------------------------------------------------------------------------------------

/** Glyphs for `ha-icon`: tiny line drawings keyed by (part of) the mdi name. */
const GLYPHS = `
const G = [
  [/lightbulb|lamp|ceiling-light/, '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'],
  [/^power|plug|toaster/, '<path d="M12 3v9M6.3 6.8a8 8 0 1 0 11.4 0"/>'],
  [/^fan/, '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="6.4" rx="2.6" ry="3.8"/><ellipse cx="12" cy="6.4" rx="2.6" ry="3.8" transform="rotate(120 12 12)"/><ellipse cx="12" cy="6.4" rx="2.6" ry="3.8" transform="rotate(240 12 12)"/>'],
  [/lock-open/, '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>'],
  [/lock/, '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'],
  [/blinds|shutter|window/, '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 8h16M4 12h16M4 16h16"/>'],
  [/chevron-up/, '<path d="M6 15l6-6 6 6"/>'],
  [/chevron-down/, '<path d="M6 9l6 6 6-6"/>'],
  [/chevron-left/, '<path d="M15 6l-6 6 6 6"/>'],
  [/chevron-right/, '<path d="M9 6l6 6-6 6"/>'],
  [/^stop/, '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>'],
  [/skip-next/, '<path d="M6 6l9 6-9 6z M17 6v12" fill="currentColor"/>'],
  [/skip-previous/, '<path d="M18 6l-9 6 9 6z M7 6v12" fill="currentColor"/>'],
  [/pause/, '<path d="M8 5v14M16 5v14" stroke-width="3"/>'],
  [/play/, '<path d="M8 5l11 7-11 7z" fill="currentColor"/>'],
  [/^plus/, '<path d="M12 5v14M5 12h14"/>'],
  [/^minus/, '<path d="M5 12h14"/>'],
  [/volume|speaker/, '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/>'],
  [/music|album/, '<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'],
  [/thermo|radiator|heat|flame|water-percent|gauge/, '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/>'],
  [/video|camera|doorbell/, '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'],
  [/shield/, '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'],
  [/weather-night|moon/, '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>'],
  [/sunny|sun/, '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'],
  [/rain|pouring/, '<path d="M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3.2 3.2 0 0 1 0 6z"/><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>'],
  [/weather|cloud/, '<path d="M7 18a4.5 4.5 0 1 1 1-8.9A6 6 0 0 1 19 11a3.5 3.5 0 0 1 0 7z"/>'],
  [/calendar/, '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>'],
  [/clock|timer|alarm|bell/, '<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 2h6"/>'],
  [/script|play-circle|palette|scene|sofa/, '<circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z" fill="currentColor"/>'],
  [/water/, '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>'],
  [/eye/, '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'],
  [/brightness|night/, '<circle cx="12" cy="12" r="4"/>']
];
const glyph = (name) => (G.find(([re]) => re.test(name)) || [0, '<circle cx="12" cy="12" r="8"/>'])[1];
`;

const PAGE = (width, realTimers = false) => `<!doctype html>
<html lang="en-GB"><meta charset="utf-8"><title>HouseView screenshots</title>
<style>
  :root{--primary-text-color:#212121;--secondary-text-color:#727272;--card-background-color:#fff;--divider-color:#e0e0e0;
    --primary-color:#03a9f4;--ha-card-border-radius:12px;--ha-card-border-width:1px;--ha-card-border-color:#e0e0e0;
    --primary-background-color:#f2f2ee}
  html,body{margin:0;padding:0;background:#f2f2ee;color:#212121;font:14px/1.4 Roboto,system-ui,sans-serif}
  #stage{width:${width}px}
  #stage.grid{display:grid;gap:16px;padding:16px;box-sizing:border-box;align-items:start}
</style>
<body><div id="stage"></div>
<script>
// A frozen clock and no free-running timers: the pictures must be reproducible.
(() => {
  const FIXED = ${NOW};
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
    static now() { return FIXED; }
  }
  window.Date = FixedDate;
  let id = 1000;
  // Overviews start their work on the shared 1 s ticker, so they keep real intervals (the clock stays frozen).
  if (!${realTimers}) window.setInterval = () => ++id;
  window.clearInterval = () => {};
})();
</script>
<script type="module">
${GLYPHS}
// Stand-ins for the Home Assistant elements the cards use.
customElements.define('ha-icon', class extends HTMLElement {
  static get observedAttributes() { return ['icon']; }
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.paint();
  }
  attributeChangedCallback() { this.paint(); }
  paint() {
    const name = (this.getAttribute('icon') || '').split(':').pop();
    this.shadowRoot.innerHTML =
      '<style>:host{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;flex:none;' +
      'width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px)}svg{width:100%;height:100%;fill:none;' +
      'stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}</style>' +
      '<svg viewBox="0 0 24 24">' + glyph(name) + '</svg>';
  }
});
customElements.define('ha-card', class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'}).innerHTML =
      '<style>:host{display:block;position:relative;color:var(--primary-text-color);' +
      'background:var(--ha-card-background,var(--card-background-color,#fff));border-radius:var(--ha-card-border-radius,12px);' +
      'box-shadow:var(--ha-card-box-shadow,none);border-width:var(--ha-card-border-width,1px);border-style:solid;' +
      'border-color:var(--ha-card-border-color,var(--divider-color,#e0e0e0))}</style><slot></slot>';
  }
});
customElements.define('ha-form', class extends HTMLElement {});
customElements.define('hui-stack-card-editor', class extends HTMLElement { setConfig(c) { this.config = c; } });

await import('/dist/houseview.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeHass(states) {
  return {
    states,
    config: {unit_system: {temperature: '°C'}, time_zone: 'Europe/London'},
    locale: {language: 'en-GB', time_zone: 'server'},
    themes: {darkMode: false},
    callService: async () => {},   // nothing ever reaches a Home Assistant
    // a made-up media library for the photo frame: four pictures that this script draws itself
    callWS: async (message) => {
      if (message.type === 'media_source/browse_media') {
        return {children: [1, 2, 3, 4].map((n) => ({title: 'photo-' + n + '.jpg', media_class: 'image',
          media_content_id: 'media-source://media_source/local/Photos/photo-' + n + '.jpg'}))};
      }
      return {url: '/__shot-photos/' + message.media_content_id.split('/').pop()};
    },
    hassUrl: (path = '/') => location.origin + path
  };
}

window.mountCarousel = async (config, states, pageIndex) => {
  const stage = document.getElementById('stage');
  stage.style.height = innerHeight + 'px';
  const card = document.createElement('houseview-card');
  card.setConfig(config);
  card.hass = makeHass(states);
  stage.append(card);
  await sleep(400);
  if (pageIndex) {
    card.shadowRoot.querySelector('[data-action="page-select"][data-page="' + pageIndex + '"]').click();
    await sleep(400);
  }
  return true;
};

window.mountOverview = async (config, states) => {
  const stage = document.getElementById('stage');
  stage.style.height = innerHeight + 'px';
  const card = document.createElement('houseview-card');
  card.setConfig(config);
  card.hass = makeHass(states);
  stage.append(card);
  await sleep(2200);
  return true;
};

window.mountGrid = async (configs, states, columns) => {
  const stage = document.getElementById('stage');
  stage.className = 'grid';
  stage.style.gridTemplateColumns = 'repeat(' + columns + ', 1fr)';
  for (const config of configs) {
    const tag = config.type.replace('custom:', '');
    if (!customElements.get(tag)) {
      console.warn('skipped ' + tag + ': not defined by this build');
      continue;
    }
    const el = document.createElement(tag);
    // The music card lays out its artwork beside the controls only when it is wide enough
    if (tag.includes('media_player')) el.style.gridColumn = 'span 2';
    el.setConfig(config);
    el.hass = makeHass(states);
    stage.append(el);
  }
  await sleep(600);
  return true;
};
window.__READY__ = true;
</script></html>`;

/** A landscape picture for the photo frame: sky, sun, hills. Four different ones. */
function photoSvg(pathname) {
  const n = Number(/photo-(\d+)/.exec(pathname)?.[1] || 1);
  const skies = [
    ['#8ec5ff', '#fde4c4'],
    ['#ffb38a', '#7a5c8f'],
    ['#a9d6e5', '#f4efe6'],
    ['#2b3a67', '#e6a57e']
  ][(n - 1) % 4];
  const hills = [
    ['#4a7c59', '#2f5d44'],
    ['#6b4f6b', '#3c2d4a'],
    ['#7fa37a', '#52795a'],
    ['#3b4a3f', '#222c26']
  ][(n - 1) % 4];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skies[0]}"/>` +
    `<stop offset="1" stop-color="${skies[1]}"/></linearGradient></defs><rect width="1600" height="1200" fill="url(#s)"/>` +
    `<circle cx="${420 + n * 190}" cy="${360 + n * 20}" r="${120 + n * 12}" fill="#fff6dd" opacity=".85"/>` +
    `<path d="M0 820 Q 400 640 800 790 T 1600 740 V1200 H0Z" fill="${hills[0]}"/>` +
    `<path d="M0 960 Q 500 820 900 940 T 1600 900 V1200 H0Z" fill="${hills[1]}"/></svg>`
  );
}

// ---- driver ------------------------------------------------------------------------------------------------------

function loadExample(file) {
  const text = fs.readFileSync(path.join(REPO, 'examples', file), 'utf8');
  return parseYaml(text.split(/^---$/m)[0]);
}

async function shoot(browser, base, shot) {
  const doc = shot.kind === 'overview' ? {} : loadExample(shot.example);
  const ids =
    shot.kind === 'overview'
      ? [shot.screensaver?.entity, ...(shot.cards || []).map((c) => c.entity), 'sun.sun'].filter(
          Boolean
        )
      : entitiesIn(doc);
  const states = Object.fromEntries(ids.map((id) => [id, stateFor(id)]));
  const [width, height] = shot.size || [1280, 800];
  const page = await browser.newPage();
  // Report a capable device (CI runners have 4 cores, which makes `performance: auto` pick the light mode).
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
    Object.defineProperty(navigator, 'deviceMemory', {get: () => 8});
  });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console.error: ${m.text()}`));
  // Outside tablet mode the carousel leaves 56 px of room for Home Assistant's header, so give it that much more
  // window and cut the picture to the size asked for.
  const extra = shot.kind === 'grid' ? 0 : HEADER_ALLOWANCE;
  await page.setViewport({width, height: height + extra, deviceScaleFactor: 1});
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await page.emulateTimezone('Europe/London');
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = new URL(req.url());
    const svg = (body) => req.respond({status: 200, contentType: 'image/svg+xml', body});
    if (url.pathname === '/__shot.html') {
      req.respond({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: PAGE(width, shot.kind === 'overview')
      });
    } else if (url.pathname.startsWith('/camera_proxy/')) {
      svg(cameraSvg(url.pathname));
    } else if (url.pathname.startsWith('/__shot-photos/')) {
      svg(photoSvg(url.pathname));
    } else if (url.pathname.startsWith('/api/media_player_proxy/')) {
      svg(ART_SVG);
    } else {
      req.continue();
    }
  });
  await page.goto(`${base}/__shot.html`, {waitUntil: 'load'});
  await page.waitForFunction(() => window.__READY__ === true, {timeout: 20000});

  if (shot.kind === 'overview') {
    const config = {
      type: 'custom:houseview-card',
      wallpaper: 'teal',
      pages: [{name: 'Home', surface: 'teal', layout: 'controls'}],
      cards: shot.cards || [{type: 'custom:houseview-clock-card'}],
      ...(shot.screensaver ? {screensaver: {...shot.screensaver, preview: true}} : {})
    };
    await page.evaluate((c, s2) => window.mountOverview(c, s2), config, states);
  } else if (shot.kind === 'carousel') {
    const card = findAll(doc, (n) => n.type === 'custom:houseview-card')[0];
    // A running timer or a playing speaker would cover the page with its full-screen display: these pictures show the
    // dashboard itself.
    Object.assign(card, {timer_display: false, music_screensaver: false});
    await page.evaluate((c, s, p) => window.mountCarousel(c, s, p), card, states, shot.page);
  } else {
    const cards = findAll(
      doc,
      (n) => typeof n.type === 'string' && /^custom:houseview-.+-card$/.test(n.type)
    );
    await page.evaluate((c, s, n) => window.mountGrid(c, s, n), cards, states, shot.columns);
  }
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 300));

  const file = path.join(OUT, `${shot.name}.png`);
  fs.mkdirSync(OUT, {recursive: true});
  if (shot.kind === 'grid') {
    const box = await page.evaluate(() => {
      const r = document.getElementById('stage').getBoundingClientRect();
      return {x: 0, y: 0, width: Math.ceil(r.width), height: Math.ceil(r.height)};
    });
    await page.screenshot({path: file, clip: box});
  } else {
    await page.screenshot({path: file, clip: {x: 0, y: 0, width, height}});
  }
  await page.close();
  return problems;
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'houseview.js'))) {
    console.error(`${path.join(ROOT, 'dist/houseview.js')} is missing. Run: npm run build:dev`);
    process.exit(2);
  }
  const only = typeof opt.only === 'string' ? opt.only : null;
  const shots = SHOTS.filter((s) => !only || s.name === only);
  if (!shots.length) {
    console.error(`no picture named "${only}" (${SHOTS.map((s) => s.name).join(', ')})`);
    process.exit(2);
  }
  const server = await startServer({root: ROOT, port: 0});
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--lang=en-GB', '--force-color-profile=srgb']
  });
  let failed = false;
  try {
    for (const shot of shots) {
      const problems = await shoot(browser, server.url, shot);
      for (const problem of problems) console.error(`[${shot.name}] ${problem}`);
      failed ||= problems.length > 0;
      console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, shot.name + '.png'))}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
