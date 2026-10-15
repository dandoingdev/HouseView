import {defineOverview} from '../../core/define-overview.js';
import {cameraUrl} from '../../core/media-url.js';
import strings from './strings.js';
import {
  ago,
  bucketOf,
  cameraOk,
  chips,
  collect,
  minuteOf,
  parseTime,
  visibleCameras
} from './model.js';

const CHIP_ICONS = {
  climate: 'mdi:thermostat',
  lights: 'mdi:lightbulb',
  locks: 'mdi:lock',
  unlocked: 'mdi:lock-open-variant',
  media: 'mdi:speaker'
};

/** One formatter per language: Intl objects are expensive to build. */
const relativeFormats = new Map();

/** "2m ago", "now", "3h ago" in the user's language; '' when the time is unknown. */
function agoText(ctx, since) {
  const when = ago(since, ctx.now());
  if (!when) return '';
  const lang = ctx.lang() || '';
  let format = relativeFormats.get(lang);
  if (!format) {
    const options = {numeric: 'auto', style: 'narrow'};
    try {
      format = new Intl.RelativeTimeFormat(lang || undefined, options);
    } catch {
      format = new Intl.RelativeTimeFormat(undefined, options);
    }
    relativeFormats.set(lang, format);
  }
  return format.format(when.value, when.unit);
}

/**
 * A control in card mode, plain markup in screensaver mode (an interactive overview renders without buttons there:
 * a screensaver press only wakes the dashboard). `attrs` is a string of extra, already escaped attributes.
 */
function control(live, tag, {action, entity, cls, inner, attrs = '', disabled = false}) {
  if (!live) return `<${tag} class="${cls}"${attrs}>${inner}</${tag}>`;
  return (
    `<button type="button" class="${cls}" data-action="${action}" data-entity="${entity}"${attrs}` +
    `${disabled ? ' disabled' : ''}>${inner}</button>`
  );
}

/**
 * An icon in a fixed box. The carousel gives every `ha-icon` its own size and a bottom margin (`.adaptive ha-icon`, 42 px, 32 px
 * on a phone); the box takes that size so the margin does not push the icon off the line it sits on.
 */
const iconBox = (ctx, name, cls = 'ov-home-ico') => `<span class="${cls}">${ctx.icon(name)}</span>`;

const widgetTarget = (index) => `widget:${index}`;

function chipHTML(ctx, chip, live) {
  const unit = chip.key === 'climate' ? '°' : '';
  const label =
    chip.key === 'climate'
      ? ctx.t('home_overview.chip.climate', {value: `${chip.value}${unit}`})
      : chip.key === 'media'
        ? ctx.t(chip.active ? 'home_overview.chip.media_playing' : 'home_overview.chip.media')
        : ctx.t(`home_overview.chip.${chip.key}`, {n: chip.value});
  const value = chip.value
    ? `<span class="ov-home-chip-value">${ctx.esc(chip.value + unit)}</span>`
    : '';
  return control(live, 'span', {
    action: 'goto-widget',
    entity: widgetTarget(chip.target),
    cls: `ov-home-chip${chip.dim ? ' ov-home-dim' : ''}${chip.active ? ' ov-home-playing' : ''}`,
    inner: `${iconBox(ctx, CHIP_ICONS[chip.key])}${value}`,
    attrs: ` data-tone="${chip.tone}" aria-label="${ctx.esc(label)}"`
  });
}

function sectionHeader(ctx, live, key, firstIndex) {
  const text = ctx.esc(ctx.t(`home_overview.section.${key}`));
  const inner = `<span class="ov-home-heading-text">${text}</span>${iconBox(ctx, 'mdi:chevron-right')}`;
  return control(live, 'p', {
    action: 'goto-widget',
    entity: widgetTarget(firstIndex),
    cls: 'ov-home-heading',
    inner
  });
}

function cameraHTML(ctx, camera, live) {
  const state = ctx.stateOf(camera.entity);
  const hasGallery = !!ctx.config?.camera_gallery?.length;
  const rawName = camera.name || ctx.attrsOf(camera.entity).friendly_name || camera.entity;
  let picture = '';
  const url = cameraOk(state)
    ? cameraUrl(ctx.attrsOf(camera.entity).entity_picture, ctx.hass)
    : null;
  if (url) {
    url.searchParams.set('hv_refresh', String(bucketOf(ctx.now())));
    picture = `<img class="ov-home-snap" src="${ctx.esc(url.href)}" alt="" decoding="async" draggable="false">`;
  }
  const since = agoText(ctx, parseTime(state?.last_updated));
  const stamp = since && picture ? `<span class="ov-home-ago">${ctx.esc(since)}</span>` : '';
  return control(live, 'div', {
    action: 'camera-grid',
    entity: ctx.esc(camera.entity),
    cls: `ov-home-cam${picture ? ' ov-home-has-picture' : ''}`,
    inner: `<span class="ov-home-cam-icon">${ctx.icon('mdi:video-outline')}</span>${picture}${stamp}<span class="ov-home-cam-name">${ctx.esc(rawName)}</span>`,
    attrs: ` aria-label="${ctx.esc(ctx.t('home_overview.camera', {name: rawName}))}"`,
    disabled: !state && !hasGallery
  });
}

function sceneTileHTML(ctx, scene, live) {
  const state = ctx.stateOf(scene.entity);
  const attrs = ctx.attrsOf(scene.entity);
  const name = ctx.esc(
    scene.name || attrs.friendly_name || scene.entity.split('.')[1].replaceAll('_', ' ')
  );
  const icon = scene.icon || attrs.icon || 'mdi:palette';
  const off = !state || state.state === 'unavailable';
  return control(live, 'div', {
    action: 'run-action',
    entity: ctx.esc(scene.entity),
    cls: `ov-home-tile${off ? ' ov-home-dim' : ''}`,
    inner: `${iconBox(ctx, icon, 'ov-home-ico ov-home-tile-icon')}<span class="ov-home-tile-name">${name}</span>`,
    disabled: off
  });
}

function sceneHTML(ctx, mode) {
  const live = mode === 'card';
  const groups = collect(ctx.config?.widgets);
  const row = chips(groups, ctx.stateOf, (n) => ctx.formatNumber(n));
  const cameras = visibleCameras(groups);
  const scenes = groups.scene;
  const empty = !row.length && !cameras.length && !scenes.length;
  const title = ctx.esc(ctx.options.title || ctx.t('home_overview.title'));
  const time = ctx.options.show_time
    ? `<p class="ov-home-time">${ctx.esc(ctx.timeParts(ctx.now()).text)}</p>`
    : '';
  let body = '';
  if (empty) {
    body = `<p class="ov-home-empty">${ctx.esc(ctx.t('home_overview.empty'))}</p>`;
  } else {
    if (row.length) {
      body += `<div class="ov-home-chips">${row.map((chip) => chipHTML(ctx, chip, live)).join('')}</div>`;
    }
    let main = '';
    if (cameras.length) {
      main +=
        `<section class="ov-home-section ov-home-cameras" data-count="${cameras.length}">` +
        `${sectionHeader(ctx, live, 'cameras', cameras[0].index)}` +
        `<div class="ov-home-cams">${cameras.map((camera) => cameraHTML(ctx, camera, live)).join('')}</div></section>`;
    }
    if (scenes.length) {
      main +=
        `<section class="ov-home-section ov-home-scenes">` +
        `${sectionHeader(ctx, live, 'scenes', scenes[0].index)}` +
        `<div class="ov-home-tiles">${scenes.map((scene) => sceneTileHTML(ctx, scene, live)).join('')}</div></section>`;
    }
    body += `<div class="ov-home-body" data-split="${cameras.length > 0 && scenes.length > 0}">${main}</div>`;
  }
  return (
    `<div class="ov-scene ov-home-scene" data-mode="${mode}">` +
    `<div class="ov-home-scroll"><header class="ov-home-head"><h2 class="ov-home-title">${title}</h2>${time}</header>` +
    `${body}</div></div>`
  );
}

/**
 * What changes on its own: the clock and "2m ago" (per minute) and the snapshots (per 30 s, only with a camera).
 * `null` when nothing on the screen depends on time.
 */
function stampOf(ctx) {
  const cameras = collect(ctx.config?.widgets).camera.length > 0;
  if (!ctx.options.show_time && !cameras) return null;
  return `${minuteOf(ctx.now())}|${cameras ? bucketOf(ctx.now()) : 0}`;
}

function remember(ctx) {
  ctx.store.set('stamp', stampOf(ctx));
}

/** Once a second: one comparison, and a re-render only when the minute or the snapshot bucket has changed. */
function refresh(ctx) {
  if (!ctx.el) return;
  const stamp = stampOf(ctx);
  if (stamp === null || ctx.store.get('stamp') === stamp) return;
  const first = !ctx.store.has('stamp');
  remember(ctx);
  if (!first) ctx.requestRender();
}

/** Every entity the home screen reads: the widgets' own, so a light, lock or scene change repaints it. */
const watched = (config) => {
  const groups = collect(config?.widgets);
  return [
    ...groups.climate,
    ...groups.light,
    ...groups.lock,
    ...groups.media,
    ...visibleCameras(groups),
    ...groups.scene
  ].map((item) => item.entity);
};

export default defineOverview({
  type: 'home',
  label: 'Home overview',
  order: 60,
  entity: 'none',
  domains: [],
  strings,
  // Also offered as a screensaver (the summary instead of, say, the weather): there it is read-only and a press wakes.
  // Its chips, headings, cameras and scenes are buttons (card mode only).
  interactive: true,
  tap: {card: 'none'},

  options: {
    title: {type: 'text', default: ''},
    show_time: {type: 'boolean', default: true}
  },

  watch: (_options, config) => watched(config),

  render: (ctx, mode) => sceneHTML(ctx, mode),

  afterRender: remember,
  tick: {every: 1000, run: refresh}
});
