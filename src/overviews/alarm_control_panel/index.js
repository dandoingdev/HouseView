// The alarm view: a full-screen face for one alarm_control_panel.* entity, opened by tapping an alarm tile.
// A close key top left, the name, the state in large type, then a key for each arming mode the panel
// advertises and a disarm key. The overview never calls a service; each key dispatches an alarm widget
// action. HouseView has no keypad: a panel that wants a code shows its keys disabled and a Code key that
// opens Home Assistant's own dialog. Reference: docs/overview-api.md
import {defineOverview} from '../../core/define-overview.js';
import {armModes, canArm, canDisarm, codeBlocks, isArmed, moodOf} from '../../core/alarm.js';
import {panelHeader} from '../_shared/control-panel.js';
import strings from './strings.js';

const P = 'alarm_control_panel_overview';

function statusLabel(ctx) {
  if (!ctx.ok) return ctx.t(`${P}.unavailable`);
  const state = String(ctx.state.state);
  const known = [
    'disarmed',
    'armed_home',
    'armed_away',
    'armed_night',
    'armed_vacation',
    'armed_custom_bypass',
    'arming',
    'pending',
    'disarming',
    'triggered'
  ];
  return known.includes(state) ? ctx.t(`${P}.state.${state}`) : state.replaceAll('_', ' ');
}

function key(ctx, {action, icon, text, label, disabled, pressed}) {
  return (
    `<button type="button" class="ov-panel-key ov-alarm-command" data-action="${action}" data-entity="${ctx.esc(ctx.entityId)}" aria-label="${ctx.esc(label)}"${pressed === undefined ? '' : ` aria-pressed="${pressed ? 'true' : 'false'}"`}${disabled ? ' disabled' : ''}>` +
    `${ctx.icon(icon).replace('<ha-icon', '<ha-icon class="ov-panel-icon"')}<span class="ov-alarm-command-label">${ctx.esc(text)}</span></button>`
  );
}

function commands(ctx) {
  const {state, attrs} = ctx;
  const buttons = armModes(attrs).map((mode) =>
    key(ctx, {
      action: `alarm-control-panel-arm-${mode.key}`,
      icon: mode.icon,
      text: ctx.t(`${P}.arm.${mode.key}`),
      label: ctx.t(`${P}.arm.${mode.key}_label`),
      disabled: !ctx.ok || !canArm(state, attrs, mode),
      pressed: ctx.ok && state.state === `armed_${mode.key}`
    })
  );
  buttons.push(
    key(ctx, {
      action: 'alarm-control-panel-disarm',
      icon: 'shield-off',
      text: ctx.t(`${P}.disarm`),
      label: ctx.t(`${P}.disarm_label`),
      disabled: !ctx.ok || !canDisarm(state, attrs)
    })
  );
  if (ctx.ok && codeBlocks(state, attrs))
    buttons.push(
      key(ctx, {
        action: 'info',
        icon: 'dialpad',
        text: ctx.t(`${P}.code`),
        label: ctx.t(`${P}.code_label`),
        disabled: false
      })
    );
  return buttons.join('');
}

function sceneHTML(ctx, mode) {
  const status = statusLabel(ctx);
  const header = panelHeader(ctx, mode, {
    closeLabel: ctx.t(`${P}.close`),
    detailsLabel: ctx.t(`${P}.more_info`)
  });
  const note = ctx.ok && codeBlocks(ctx.state, ctx.attrs) ? ctx.t(`${P}.code_note`) : '';
  const aria = ctx.t(`${P}.aria`, {name: ctx.rawName, status});
  return (
    `<div class="ov-scene ov-alarm-scene" data-mood="${moodOf(ctx.state, ctx.ok)}" role="group" aria-label="${ctx.esc(aria)}">` +
    header +
    `<div class="ov-alarm-body">` +
    `<div class="ov-alarm-mark" aria-hidden="true">${ctx.icon(ctx.ok && isArmed(ctx.state) ? 'shield-check' : 'shield-moon-outline')}</div>` +
    `<p class="ov-alarm-status">${ctx.esc(status)}</p>` +
    (note ? `<p class="ov-alarm-note">${ctx.esc(note)}</p>` : '') +
    `</div>` +
    `<footer class="ov-alarm-foot"><div class="ov-alarm-commands">${commands(ctx)}</div></footer>` +
    `</div>`
  );
}

export default defineOverview({
  type: 'alarm_control_panel',
  label: 'Alarm view',
  order: 130,
  entity: 'required',
  domains: ['alarm_control_panel'],
  strings,
  selectable: false,
  interactive: true,
  controls: true,
  actions: [
    'alarm-control-panel-arm-home',
    'alarm-control-panel-arm-away',
    'alarm-control-panel-arm-night',
    'alarm-control-panel-arm-vacation',
    'alarm-control-panel-disarm'
  ],
  tap: {card: 'none'},
  render: (ctx, mode) => sceneHTML(ctx, mode)
});
