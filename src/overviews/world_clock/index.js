import {defineOverview} from '../../core/define-overview.js';
import {panelHeader} from '../_shared/control-panel.js';
import {clockRows, localZoneOf} from './model.js';
import {worldClocksSpec} from './data.js';
import strings from './strings.js';

function subtitle(ctx, row) {
  if (!row.available) return ctx.t('world_clock_overview.unavailable');
  if (!row.relative) return '';
  const {days, hours} = row.relative;
  const day =
    days === 0
      ? ctx.t('world_clock_overview.today')
      : days === -1
        ? ctx.t('world_clock_overview.yesterday')
        : days === 1
          ? ctx.t('world_clock_overview.tomorrow')
          : ctx.t('world_clock_overview.days', {count: days});
  const offset =
    hours === 0
      ? ''
      : ctx.t('world_clock_overview.hours', {
          value: `${hours > 0 ? '+' : '−'}${ctx.formatNumber(Math.abs(hours), {maximumFractionDigits: 2})}`
        });
  return [day, offset].filter(Boolean).join(', ');
}

function timeHTML(ctx, time) {
  const period = /^(.*?)(\s*[ap]m)$/i.exec(time);
  return period
    ? `${ctx.esc(period[1])}<span class="ov-world-clock-period">${ctx.esc(period[2])}</span>`
    : ctx.esc(time);
}

function localMark(ctx) {
  const icon = ctx.icon('map-marker').replace('<ha-icon', '<ha-icon class="ov-world-clock-pin"');
  return `<span class="ov-world-clock-location" aria-label="${ctx.esc(ctx.t('world_clock_overview.local'))}">${icon}</span>`;
}

function rowsOf(ctx) {
  const rows = clockRows(ctx.hass, ctx.data.clocks || [], ctx.options, ctx.now());
  if (ctx.options.show_local) {
    rows.unshift({
      entity: 'local',
      name: localZoneOf(ctx.hass).split('/').pop().replaceAll('_', ' '),
      available: true,
      local: true,
      time: ctx.timeParts(ctx.now()).text,
      relative: {days: 0, hours: 0}
    });
  }
  return rows;
}

function refresh(ctx) {
  const rows = JSON.stringify(rowsOf(ctx));
  if (ctx.store.get('rows') !== rows) {
    ctx.store.set('rows', rows);
    ctx.requestRender();
  }
}

export default defineOverview({
  type: 'world_clock',
  label: 'World Clock',
  order: 90,
  entity: 'none',
  strings,
  selectable: false,
  interactive: true,
  controls: true,
  tap: {card: 'none'},
  options: {show_local: {type: 'boolean', default: true}, entities: {type: 'text'}},
  data: ({options}) => ({clocks: worldClocksSpec(options)}),
  render(ctx, mode) {
    const rows = rowsOf(ctx);
    const header = panelHeader({...ctx, overview: 'world-clock', entityId: 'world_clock'}, mode, {
      closeLabel: ctx.t('world_clock_overview.close'),
      showDetails: false
    });
    const content = rows
      .map(
        (row) =>
          `<div class="ov-world-clock-row${row.available ? '' : ' ov-world-clock-unavailable'}" data-clock="${ctx.esc(row.entity)}" role="group" aria-label="${ctx.esc(`${row.name}, ${subtitle(ctx, row)}, ${row.time}`)}">` +
          `<div class="ov-world-clock-place"><span class="ov-world-clock-sub">${ctx.esc(subtitle(ctx, row))}</span><strong class="ov-world-clock-city">${ctx.esc(row.name)}${row.local ? localMark(ctx) : ''}</strong></div><span class="ov-world-clock-time">${timeHTML(ctx, row.time)}</span></div>`
      )
      .join('');
    const empty = rows.some((row) => !row.local)
      ? ''
      : `<div class="ov-world-clock-empty"><strong>${ctx.esc(ctx.t('world_clock_overview.empty'))}</strong><p>${ctx.esc(ctx.t('world_clock_overview.empty_help'))}</p></div>`;
    return `<div class="ov-scene ov-world-clock-scene" role="group" aria-label="${ctx.name}">${header}<div class="ov-world-clock-list">${content}${empty}</div></div>`;
  },
  afterRender: (ctx) => {
    ctx.store.set('rows', JSON.stringify(rowsOf(ctx)));
  },
  tick: {every: 1000, run: refresh}
});
