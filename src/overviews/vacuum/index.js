// The cleaning panel: a full-screen face for one vacuum.* entity, opened by tapping a vacuum tile.
// A close key top left, the name, the activity in large type, battery and fan speed, then the commands
// the vacuum actually supports. The overview never calls a service; each key dispatches a vacuum widget
// action. Reference: docs/overview-api.md
import {defineOverview} from '../../core/define-overview.js';
import {
  batteryPercent,
  canLocate,
  canPause,
  canReturn,
  canSpot,
  canStart,
  canStop,
  fanSpeeds,
  moodOf,
  reportedStatus,
  startKind,
  stopKind,
  supports,
  VACUUM_FEATURE
} from '../../core/vacuum.js';
import {panelHeader} from '../_shared/control-panel.js';
import strings from './strings.js';

const FAN_ACTIONS = [
  'vacuum-fan-0',
  'vacuum-fan-1',
  'vacuum-fan-2',
  'vacuum-fan-3',
  'vacuum-fan-4',
  'vacuum-fan-5'
];

function activityLabel(ctx) {
  if (!ctx.ok) return ctx.t('vacuum_overview.unavailable');
  const state = ctx.state.state;
  if (state === 'cleaning') return ctx.t('vacuum_overview.state.cleaning');
  if (state === 'docked') return ctx.t('vacuum_overview.state.docked');
  if (state === 'idle') return ctx.t('vacuum_overview.state.idle');
  if (state === 'paused') return ctx.t('vacuum_overview.state.paused');
  if (state === 'returning') return ctx.t('vacuum_overview.state.returning');
  if (state === 'error') return ctx.t('vacuum_overview.state.error');
  if (state === 'charging') return ctx.t('vacuum_overview.state.charging');
  return String(state).replaceAll('_', ' ');
}

function detailOf(ctx, activity) {
  if (!ctx.ok) return '';
  const status = reportedStatus(ctx.attrs);
  if (!status || status.toLowerCase() === activity.toLowerCase()) return '';
  return status;
}

function commandButton(ctx, {action, icon, text, label, disabled}) {
  return (
    `<button type="button" class="ov-panel-key ov-vacuum-command" data-action="${action}" data-entity="${ctx.esc(ctx.entityId)}" aria-label="${ctx.esc(label)}"${disabled ? ' disabled' : ''}>` +
    `${ctx.icon(icon).replace('<ha-icon', '<ha-icon class="ov-panel-icon"')}<span class="ov-vacuum-command-label">${ctx.esc(text)}</span></button>`
  );
}

function commands(ctx) {
  const {state, attrs} = ctx;
  const buttons = [];
  if (startKind(attrs)) {
    const resume = state?.state === 'paused';
    buttons.push(
      commandButton(ctx, {
        action: 'vacuum-start',
        icon: 'play',
        text: ctx.t(resume ? 'vacuum_overview.resume' : 'vacuum_overview.start'),
        label: ctx.t(resume ? 'vacuum_overview.resume_label' : 'vacuum_overview.start_label'),
        disabled: !ctx.ok || !canStart(state, attrs)
      })
    );
  }
  if (supports(attrs, VACUUM_FEATURE.PAUSE)) {
    buttons.push(
      commandButton(ctx, {
        action: 'vacuum-pause',
        icon: 'pause',
        text: ctx.t('vacuum_overview.pause'),
        label: ctx.t('vacuum_overview.pause_label'),
        disabled: !ctx.ok || !canPause(state, attrs)
      })
    );
  }
  const stop = stopKind(attrs);
  if (stop) {
    buttons.push(
      commandButton(ctx, {
        action: 'vacuum-stop',
        icon: stop === 'off' ? 'power' : 'stop',
        text: ctx.t(stop === 'off' ? 'vacuum_overview.off' : 'vacuum_overview.stop'),
        label: ctx.t(stop === 'off' ? 'vacuum_overview.off_label' : 'vacuum_overview.stop_label'),
        disabled: !ctx.ok || !canStop(state, attrs)
      })
    );
  }
  if (supports(attrs, VACUUM_FEATURE.RETURN_HOME)) {
    buttons.push(
      commandButton(ctx, {
        action: 'vacuum-return',
        icon: 'home-map-marker',
        text: ctx.t('vacuum_overview.dock'),
        label: ctx.t('vacuum_overview.dock_label'),
        disabled: !ctx.ok || !canReturn(state, attrs)
      })
    );
  }
  if (supports(attrs, VACUUM_FEATURE.CLEAN_SPOT)) {
    buttons.push(
      commandButton(ctx, {
        action: 'vacuum-spot',
        icon: 'target',
        text: ctx.t('vacuum_overview.spot'),
        label: ctx.t('vacuum_overview.spot_label'),
        disabled: !ctx.ok || !canSpot(state, attrs)
      })
    );
  }
  if (supports(attrs, VACUUM_FEATURE.LOCATE)) {
    buttons.push(
      commandButton(ctx, {
        action: 'vacuum-locate',
        icon: 'map-marker-radius',
        text: ctx.t('vacuum_overview.find'),
        label: ctx.t('vacuum_overview.find_label'),
        disabled: !ctx.ok || !canLocate(state, attrs)
      })
    );
  }
  return buttons.join('');
}

function speeds(ctx) {
  if (!ctx.ok || !supports(ctx.attrs, VACUUM_FEATURE.FAN_SPEED)) return '';
  const list = fanSpeeds(ctx.attrs);
  if (!list.length) return '';
  const current = typeof ctx.attrs.fan_speed === 'string' ? ctx.attrs.fan_speed : '';
  const buttons = list
    .map((name, index) => {
      const pressed = name === current;
      return (
        `<button type="button" class="ov-vacuum-speed" data-action="${FAN_ACTIONS[index]}" data-entity="${ctx.esc(ctx.entityId)}" aria-label="${ctx.esc(ctx.t('vacuum_overview.fan', {name}))}" aria-pressed="${pressed ? 'true' : 'false'}">` +
        `${ctx.esc(name)}</button>`
      );
    })
    .join('');
  return `<div class="ov-vacuum-speeds" role="group" aria-label="${ctx.esc(ctx.t('vacuum_overview.fan_speeds'))}">${buttons}</div>`;
}

function figure(ctx, {cls, icon, text, label}) {
  return (
    `<span class="ov-vacuum-fig ${cls}" aria-label="${ctx.esc(label)}"><span class="ov-vacuum-ico">${ctx.icon(icon)}</span>` +
    `<span class="ov-vacuum-fig-text">${ctx.esc(text)}</span></span>`
  );
}

function sceneHTML(ctx, mode) {
  const activity = activityLabel(ctx);
  const detail = detailOf(ctx, activity);
  const battery = ctx.ok ? batteryPercent(ctx.attrs) : null;
  const fan = ctx.ok && typeof ctx.attrs.fan_speed === 'string' ? ctx.attrs.fan_speed.trim() : '';
  const header = panelHeader(ctx, mode, {
    closeLabel: ctx.t('vacuum_overview.close'),
    detailsLabel: ctx.t('vacuum_overview.more_info')
  });
  const meta = [
    battery == null
      ? ''
      : figure(ctx, {
          cls: 'ov-vacuum-battery-fig',
          icon: 'battery',
          text: `${battery}%`,
          label: ctx.t('vacuum_overview.battery', {n: battery})
        }),
    fan
      ? figure(ctx, {
          cls: 'ov-vacuum-fan-fig',
          icon: 'fan',
          text: fan,
          label: ctx.t('vacuum_overview.fan', {name: fan})
        })
      : ''
  ].join('');
  const bar =
    battery == null
      ? ''
      : `<div class="ov-vacuum-battery${battery <= 20 ? ' ov-vacuum-battery-low' : ''}" style="--battery:${battery}%"><div class="ov-vacuum-battery-fill"></div></div>`;
  const keys = commands(ctx);
  const fanKeys = speeds(ctx);
  const aria = ctx.t(battery == null ? 'vacuum_overview.aria' : 'vacuum_overview.aria_battery', {
    name: ctx.rawName,
    status: activity,
    battery
  });
  return (
    `<div class="ov-scene ov-vacuum-scene" data-mood="${moodOf(ctx.state, ctx.ok)}" role="group" aria-label="${ctx.esc(aria)}">` +
    header +
    `<div class="ov-vacuum-body">` +
    `<div class="ov-vacuum-mark" aria-hidden="true">${ctx.icon('robot-vacuum')}</div>` +
    `<p class="ov-vacuum-status">${ctx.esc(activity)}</p>` +
    (detail ? `<p class="ov-vacuum-detail">${ctx.esc(detail)}</p>` : '') +
    (meta ? `<p class="ov-vacuum-meta">${meta}</p>` : '') +
    bar +
    `</div>` +
    (keys || fanKeys
      ? `<footer class="ov-vacuum-foot">${keys ? `<div class="ov-vacuum-commands">${keys}</div>` : ''}${fanKeys}</footer>`
      : '') +
    `</div>`
  );
}

export default defineOverview({
  type: 'vacuum',
  label: 'Vacuum view',
  order: 120,
  entity: 'required',
  domains: ['vacuum'],
  strings,
  selectable: false,
  interactive: true,
  controls: true,
  actions: [
    'vacuum-start',
    'vacuum-pause',
    'vacuum-stop',
    'vacuum-return',
    'vacuum-spot',
    'vacuum-locate',
    ...FAN_ACTIONS
  ],
  tap: {card: 'none'},
  render: (ctx, mode) => sceneHTML(ctx, mode)
});
