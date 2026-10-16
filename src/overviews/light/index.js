import {defineOverview} from '../../core/define-overview.js';
import {brightnessOf, canDim, colorOf} from '../../core/light.js';
import strings from './strings.js';
import {panelHeader, panelKey} from '../_shared/control-panel.js';

/** Keep the control local while dragging; HA updates may arrive before the user releases their finger. */
function bindControl(ctx) {
  const input = ctx.el?.querySelector('.ov-light-input');
  if (!input) return;
  const control = input.closest('.ov-light-control');
  let local = ctx.store.get('brightness');
  if (!local || local.input !== input) {
    local = {input, pointer: null, value: brightnessOf(ctx.state), state: ctx.state};
    ctx.store.set('brightness', local);
    const paint = () => {
      input.closest('.ov-light-control').style.setProperty('--brightness', `${input.value}%`);
      ctx.el.querySelector('.ov-light-value').textContent = local.ok ? input.value : '—';
    };
    const update = (e) => {
      const rect = input.getBoundingClientRect();
      if (!rect.height) return;
      input.value = String(
        Math.round(Math.max(0, Math.min(1, (rect.bottom - e.clientY) / rect.height)) * 100)
      );
      local.value = Number(input.value);
      paint();
    };
    input.addEventListener('input', () => {
      local.value = Number(input.value);
      paint();
    });
    control.addEventListener('pointerdown', (e) => {
      if (input.disabled || e.button !== 0 || local.pointer !== null) return;
      e.preventDefault();
      e.stopPropagation();
      input.focus({preventScroll: true});
      local.pointer = e.pointerId;
      local.before = local.value;
      control.setPointerCapture(e.pointerId);
      update(e);
    });
    control.addEventListener('pointermove', (e) => {
      if (e.pointerId !== local.pointer || input.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      update(e);
    });
    const finish = (e, cancelled) => {
      if (e.pointerId !== local.pointer) return;
      e.preventDefault();
      e.stopPropagation();
      local.pointer = null;
      if (control.hasPointerCapture(e.pointerId)) control.releasePointerCapture(e.pointerId);
      if (cancelled || input.disabled) {
        input.value = String(local.before);
        local.value = local.before;
        paint();
      } else {
        update(e);
        input.dispatchEvent(new Event('change', {bubbles: true}));
      }
    };
    control.addEventListener('pointerup', (e) => finish(e, false));
    control.addEventListener('pointercancel', (e) => finish(e, true));
    control.addEventListener('lostpointercapture', (e) => finish(e, true));
    // The native range handles arrows, Page Up/Down, Home and End, including assistive technology.
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
    });
  }
  // Preserve local feedback across an unrelated render; follow new authoritative entity state after release.
  if (local.pointer === null && local.state !== ctx.state) local.value = brightnessOf(ctx.state);
  local.state = ctx.state;
  local.ok = ctx.ok;
  input.value = String(local.value);
  input.closest('.ov-light-control').style.setProperty('--brightness', `${local.value}%`);
  ctx.el.querySelector('.ov-light-value').textContent = ctx.ok ? String(local.value) : '—';
}

export default defineOverview({
  type: 'light',
  label: 'Light view',
  order: 80,
  entity: 'required',
  domains: ['light'],
  strings,
  selectable: false,
  interactive: true,
  controls: true,
  actions: ['light'],
  tap: {card: 'none'},
  options: {icon: {type: 'icon'}},
  render(ctx, mode) {
    const value = brightnessOf(ctx.state);
    const adjustable = ctx.ok && canDim(ctx.attrs);
    const header = panelHeader(ctx, mode, {
      closeLabel: ctx.t('light_overview.close'),
      detailsLabel: ctx.t('light_overview.more_info')
    });
    const icon = ctx.options.icon || ctx.attrs.icon || 'lightbulb-outline';
    const input = `<input class="ov-light-input" type="range" min="0" max="100" step="1" value="${value}" aria-orientation="vertical" aria-label="${ctx.esc(ctx.t('light_overview.brightness'))}" data-value-action="light-brightness-" data-entity="${ctx.esc(ctx.entityId)}"${adjustable ? '' : ' disabled'}>`;
    return (
      `<div class="ov-scene ov-light-scene" role="group" aria-label="${ctx.name}">` +
      header +
      `<div class="ov-light-control" style="--brightness:${value}%;--light-color:${colorOf(ctx.attrs)}">` +
      `<div class="ov-light-fill" aria-hidden="true"></div><div class="ov-light-readout" aria-hidden="true">${ctx.icon(icon).replace('<ha-icon', '<ha-icon class="ov-light-icon"')}<div><span class="ov-light-value">${ctx.ok ? value : '—'}</span><span class="ov-light-percent">%</span></div></div>${input}</div>` +
      `<footer class="ov-light-foot">${!ctx.ok ? ctx.esc(ctx.t('light_overview.unavailable')) : panelKey(ctx, {action: 'light', icon: 'power', label: ctx.t('light_overview.toggle')})}</footer></div>`
    );
  },
  afterRender: bindControl
});
