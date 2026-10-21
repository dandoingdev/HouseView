import {relativeTimeFormatter} from '../../core/intl.js';
import {defineOverview} from '../../core/define-overview.js';
import {attentionRules, attentionIds, attentionItems} from '../../core/home-attention.js';
import {plantEntities} from '../../core/plants.js';
import {panelKey} from '../_shared/control-panel.js';
import {cameraUrl} from '../../core/media-url.js';
import strings from './strings.js';
import {
  ago,
  bucketOf,
  cameraOk,
  chips,
  collect,
  binsEntity,
  binsThisWeek,
  minuteOf,
  transportChip,
  transportItems,
  parseTime,
  visibleCameras
} from './model.js';

const CHIP_ICONS = {
  climate: 'mdi:thermostat',
  lights: 'mdi:lightbulb',
  locks: 'mdi:lock',
  unlocked: 'mdi:lock-open-variant',
  media: 'mdi:speaker',
  plants: 'mdi:leaf'
};

/** "2m ago", "now", "3h ago" in the user's language; '' when the time is unknown. */
function agoText(ctx, since) {
  const when = ago(since, ctx.now());
  if (!when) return '';
  const format = relativeTimeFormatter(
    ctx.lang() || undefined,
    {numeric: 'auto', style: 'narrow'},
    {fallback: true}
  );
  return format.format(when.value, when.unit);
}

/**
 * A Home control in both embedded and full-screen modes.
 * `attrs` is a string of extra, already escaped attributes.
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

/** The bins going out this week: one chip of icons (a bin icon per type), nothing when none is due. */
function binsChipHTML(ctx, live) {
  const id = binsEntity(ctx.config?.home_bins);
  if (!id) return '';
  const bins = binsThisWeek(ctx.stateOf(id), ctx.now());
  if (!bins.length) return '';
  const when = (days) =>
    days === 0
      ? ctx.t('home_overview.bin.today')
      : days === 1
        ? ctx.t('home_overview.bin.tomorrow')
        : ctx.t('home_overview.bin.in', {n: days});
  const names = bins.map((bin) => `${bin.type} (${when(bin.days)})`).join(', ');
  const icons = bins.map((bin) => iconBox(ctx, bin.icon)).join('');
  const soon = bins[0].days <= 1;
  const attrs = ` data-tone="${soon ? 'amber' : 'teal'}" aria-label="${ctx.esc(ctx.t('home_overview.bins', {names}))}" title="${ctx.esc(names)}"`;
  return control(live, 'span', {
    action: 'info',
    entity: ctx.esc(id),
    cls: 'ov-home-chip ov-home-bins',
    inner: icons,
    attrs
  });
}

/** A departure chip per `home_transport` item: icon, label and the next time; amber when the line is not running. */
function transportChipsHTML(ctx, live) {
  return transportItems(ctx.config?.home_transport)
    .map((item) => {
      const chip = transportChip(item, ctx.stateOf);
      const label = ctx.esc(chip.label);
      const aria = chip.running
        ? ctx.t('home_overview.transport', {label: chip.label, time: chip.time})
        : ctx.t('home_overview.transport.down', {label: chip.label});
      const value = chip.running
        ? `<span class="ov-home-chip-value">${ctx.esc(chip.time)}</span>`
        : `<span class="ov-home-chip-value">${ctx.esc(ctx.t('home_overview.transport.none'))}</span>`;
      return control(live, 'span', {
        action: 'info',
        entity: ctx.esc(chip.entity),
        cls: `ov-home-chip ov-home-transport${chip.running ? '' : ' ov-home-down'}`,
        inner: `${iconBox(ctx, chip.icon)}<span class="ov-home-chip-label">${label}</span>${value}`,
        attrs: ` data-tone="${chip.running ? 'cyan' : 'amber'}" aria-label="${ctx.esc(aria)}"`
      });
    })
    .join('');
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

function attentionHTML(ctx) {
  if (!ctx.config?.home_battery_auto && !attentionRules(ctx.config, ctx.hass).length) return '';
  const rows = attentionItems(ctx.config, ctx.stateOf, ctx.now(), ctx.hass);
  const heading = ctx.esc(ctx.t('home_overview.attention.title'));
  const content = rows.length
    ? `<div class="ov-home-attention-list">${rows
        .map((row) => {
          const detail =
            row.reason === 'battery_value'
              ? ctx.t('home_overview.attention.battery_value', {value: ctx.formatNumber(row.value)})
              : row.reason === 'light'
                ? ctx.t(
                    row.hours
                      ? 'home_overview.attention.light_hours'
                      : 'home_overview.attention.light_minutes',
                    {value: ctx.formatNumber(row.hours || row.minutes)}
                  )
                : ctx.t(`home_overview.attention.${row.reason}`);
          return control(true, 'div', {
            action: 'info',
            entity: ctx.esc(row.entity),
            cls: 'ov-home-attention-item',
            attrs: ` data-tone="${row.tone}"`,
            inner: `${iconBox(ctx, row.icon)}<span class="ov-home-attention-text"><strong class="ov-home-attention-name">${ctx.esc(row.name)}</strong><small class="ov-home-attention-detail">${ctx.esc(detail)}</small></span><span class="ov-home-attention-arrow">${ctx.icon('mdi:chevron-right').replace('<ha-icon', '<ha-icon class="ov-home-attention-chevron"')}</span>`
          });
        })
        .join('')}</div>`
    : `<p class="ov-home-attention-clear">${iconBox(ctx, 'mdi:check-circle-outline')}${ctx.esc(ctx.t('home_overview.attention.clear'))}</p>`;
  return `<section class="ov-home-section ov-home-attention"><h3 class="ov-home-heading">${heading}<span class="ov-home-attention-count">${ctx.esc(ctx.formatNumber(rows.length))}</span></h3>${content}</section>`;
}

function sceneHTML(ctx, mode) {
  const live = true;
  const groups = collect(ctx.config?.widgets);
  const row = chips(groups, ctx.stateOf, (n) => ctx.formatNumber(n));
  const extras = binsChipHTML(ctx, live) + transportChipsHTML(ctx, live);
  const cameras = visibleCameras(groups);
  const scenes = groups.scene;
  const attention = attentionHTML(ctx);
  const empty = !row.length && !extras && !cameras.length && !scenes.length && !attention;
  const title = ctx.esc(ctx.options.title || ctx.t('home_overview.title'));
  const time = ctx.options.show_time
    ? `<p class="ov-home-time">${ctx.esc(ctx.timeParts(ctx.now()).text)}</p>`
    : '';
  let body = '';
  if (empty) {
    body = `<p class="ov-home-empty">${ctx.esc(ctx.t('home_overview.empty'))}</p>`;
  } else {
    if (row.length || extras) {
      body += `<div class="ov-home-chips">${row.map((chip) => chipHTML(ctx, chip, live)).join('')}${extras}</div>`;
    }
    body += attention;
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
    `${body}</div>` +
    (mode === 'screensaver'
      ? panelKey(
          {...ctx, entityId: 'home'},
          {
            action: 'overview-close',
            icon: 'close',
            label: ctx.t('home_overview.close'),
            cls: 'ov-home-close'
          }
        )
      : '') +
    '</div>'
  );
}

/**
 * What changes on its own: the clock and "2m ago" (per minute) and the snapshots (per 30 s, only with a camera).
 * `null` when nothing on the screen depends on time.
 */
function stampOf(ctx) {
  const cameras = collect(ctx.config?.widgets).camera.length > 0;
  if (
    !ctx.options.show_time &&
    !cameras &&
    !binsEntity(ctx.config?.home_bins) &&
    !ctx.config?.home_battery_auto &&
    !attentionRules(ctx.config, ctx.hass).length
  )
    return null;
  return `${minuteOf(ctx.now())}|${cameras ? bucketOf(ctx.now()) : 0}`;
}

function remember(ctx) {
  ctx.store.set('stamp', stampOf(ctx));
  ctx.store.set('attentionKey', attentionKey(ctx));
}

function rememberStamp(ctx) {
  ctx.store.set('stamp', stampOf(ctx));
}

/** Rows that the attention section shows; rebuilt only when this key changes. */
function attentionKey(ctx) {
  return JSON.stringify(
    attentionItems(ctx.config, ctx.stateOf, ctx.now(), ctx.hass).map((row) => [
      row.entity,
      row.reason,
      row.value,
      row.hours,
      row.minutes,
      row.tone
    ])
  );
}

function patchTime(ctx) {
  if (!ctx.options.show_time) return;
  const node = ctx.el.querySelector('.ov-home-time');
  if (!node) return;
  const text = ctx.timeParts(ctx.now()).text;
  if (node.textContent !== text) node.textContent = text;
}

/** Refresh snapshot URLs and "2m ago" labels without rebuilding the home scene. */
function patchCameras(ctx) {
  for (const cam of ctx.el.querySelectorAll('.ov-home-cam[data-entity]')) {
    const entity = cam.dataset.entity;
    const state = ctx.stateOf(entity);
    const url = cameraOk(state) ? cameraUrl(ctx.attrsOf(entity).entity_picture, ctx.hass) : null;
    let img = cam.querySelector('.ov-home-snap');
    if (url) {
      url.searchParams.set('hv_refresh', String(bucketOf(ctx.now())));
      if (!img) {
        ctx.requestRender();
        return false;
      }
      if (img.getAttribute('src') !== url.href) img.setAttribute('src', url.href);
      cam.classList.add('ov-home-has-picture');
    } else {
      img?.remove();
      cam.classList.remove('ov-home-has-picture');
      img = null;
    }
    const since = agoText(ctx, parseTime(state?.last_updated));
    let agoEl = cam.querySelector('.ov-home-ago');
    if (since && img) {
      if (!agoEl) {
        agoEl = document.createElement('span');
        agoEl.className = 'ov-home-ago';
        img.after(agoEl);
      }
      if (agoEl.textContent !== since) agoEl.textContent = since;
    } else {
      agoEl?.remove();
    }
  }
  return true;
}

/** Replace the attention block when its rows change; otherwise leave the scene alone. */
function patchAttention(ctx) {
  const key = attentionKey(ctx);
  if (ctx.store.get('attentionKey') === key) return true;
  ctx.store.set('attentionKey', key);
  const html = attentionHTML(ctx);
  const section = ctx.el.querySelector('.ov-home-attention');
  if (!html) {
    section?.remove();
    return true;
  }
  const template = document.createElement('template');
  template.innerHTML = html;
  const next = template.content.firstElementChild;
  if (!next) return true;
  if (section) {
    section.replaceWith(next);
    return true;
  }
  // First appearance of the section: geometry depends on siblings; rebuild once.
  ctx.requestRender();
  return false;
}

/**
 * Once a second: one comparison. When the minute or snapshot bucket changes, patch the clock,
 * camera pictures and attention rows in place instead of rebuilding the whole home scene.
 */
function refresh(ctx) {
  if (!ctx.el) return;
  const stamp = stampOf(ctx);
  if (stamp === null || ctx.store.get('stamp') === stamp) return;
  const first = !ctx.store.has('stamp');
  rememberStamp(ctx);
  if (first) {
    ctx.store.set('attentionKey', attentionKey(ctx));
    return;
  }
  patchTime(ctx);
  if (!patchCameras(ctx)) return;
  patchAttention(ctx);
}

/** Every entity the home screen reads: the widgets' own, so a light, lock or scene change repaints it. */
const watched = (config, hass) => {
  const groups = collect(config?.widgets);
  return [
    ...groups.climate,
    ...groups.light,
    ...groups.lock,
    ...groups.media,
    ...visibleCameras(groups),
    ...groups.scene
  ]
    .map((item) => item.entity)
    .concat(
      groups.plants.flatMap((item) => plantEntities(item.plants)),
      attentionIds(config, hass),
      binsEntity(config?.home_bins) || [],
      transportItems(config?.home_transport).map((item) => item.entity)
    );
};

export default defineOverview({
  type: 'home',
  label: 'Home summary',
  order: 60,
  entity: 'none',
  domains: [],
  strings,
  // Full-screen Home keeps its controls; only the shared close button or Escape dismisses it.
  interactive: true,
  controls: true,
  tap: {card: 'none'},

  options: {
    title: {type: 'text', default: ''},
    show_time: {type: 'boolean', default: true}
  },

  watch: (_options, config, hass) => watched(config, hass),

  render: (ctx, mode) => sceneHTML(ctx, mode),

  afterRender: remember,
  tick: {every: 1000, run: refresh}
});
