import {colourModes, kelvinRange} from '../../core/light.js';

export function colourMarkup(ctx) {
  const button = (cls, icon, label, action = '') =>
    `<button type="button" class="ov-panel-key ${cls}" aria-label="${ctx.esc(ctx.t(`light_overview.${label}`))}"${action} data-entity="${ctx.esc(ctx.entityId)}">${ctx.icon(icon).replace('<ha-icon', '<ha-icon class="ov-panel-icon"')}</button>`;
  return `<div class="ov-light-colour" hidden>
    <div class="ov-light-spectrum"><span class="ov-light-swatch" aria-hidden="true"></span></div>
    <div class="ov-light-colour-head">${button('ov-light-cancel', 'close', 'close_colour')}</div>
    <input type="range" class="ov-light-colour-value" min="0" max="10000" hidden tabindex="-1" aria-hidden="true" data-value-action="light-colour-" data-entity="${ctx.esc(ctx.entityId)}">
    <div class="ov-light-colour-inputs">
      <input type="range" class="ov-light-hue" min="0" max="360" aria-label="${ctx.esc(ctx.t('light_overview.hue'))}">
      <input type="range" class="ov-light-saturation" min="0" max="100" aria-label="${ctx.esc(ctx.t('light_overview.saturation'))}">
      <input type="range" class="ov-light-kelvin" aria-label="${ctx.esc(ctx.t('light_overview.temperature'))}">
    </div>
    <footer class="ov-light-colour-foot"><output class="ov-light-kelvin-value"></output>${button('ov-light-mode', 'thermometer', 'temperature')}</footer>
  </div>`;
}

/** Live colour changes use the guarded, coalescing range-action queue shared with brightness. */
export function bindColour(ctx) {
  const pane = ctx.el.querySelector('.ov-light-colour');
  if (!pane) return;
  let local = ctx.store.get('colour');
  if (!local || local.pane !== pane) {
    local = {pane, open: false, pointer: null, ctx};
    ctx.store.set('colour', local);
    const q = (s) => pane.querySelector(s);
    const field = q('.ov-light-spectrum');
    const hue = q('.ov-light-hue');
    const saturation = q('.ov-light-saturation');
    const kelvin = q('.ov-light-kelvin');
    const value = q('.ov-light-colour-value');
    const action = () =>
      local.mode === 'temperature'
        ? `light-temperature-${local.kelvin}`
        : `light-colour-${local.hue}:${local.saturation}`;
    let timer = null;
    let pending = false;
    const flush = () => {
      clearTimeout(timer);
      timer = null;
      if (!pending) return;
      pending = false;
      if (!pane.isConnected || value.disabled || !local.open) return;
      const wanted = action();
      if (wanted === local.sent) return;
      local.sent = wanted;
      value.dataset.valueAction =
        local.mode === 'temperature' ? 'light-temperature-' : `light-colour-${local.hue}:`;
      value.value = local.mode === 'temperature' ? local.kelvin : local.saturation;
      value.dispatchEvent(new Event('change', {bubbles: true}));
    };
    const changed = () => {
      if (!local.open || value.disabled || (action() === local.selected && action() === local.sent))
        return;
      local.selected = action();
      pending = true;
      if (timer === null) {
        flush();
        timer = setTimeout(flush, 120);
      }
    };
    const paint = () => {
      const c = local.ctx;
      const modes = colourModes(c.attrs);
      const [min, max] = kelvinRange(c.attrs);
      pane.hidden = !local.open;
      c.el.querySelector('.ov-light-dimmer').hidden = local.open;
      pane.dataset.mode = local.mode;
      value.disabled = !c.ok || !(local.mode === 'temperature' ? modes.temperature : modes.colour);
      for (const input of [hue, saturation, kelvin]) input.disabled = value.disabled;
      if (value.disabled) {
        pending = false;
        clearTimeout(timer);
        timer = null;
      }
      q('.ov-light-mode').hidden = !(modes.colour && modes.temperature);
      q('.ov-light-mode').setAttribute(
        'aria-label',
        c.t(`light_overview.${local.mode === 'temperature' ? 'colour' : 'temperature'}`)
      );
      q('.ov-light-mode ha-icon').setAttribute(
        'icon',
        local.mode === 'temperature' ? 'mdi:palette' : 'mdi:thermometer'
      );
      const angle = ((240 - local.hue) * Math.PI) / 180;
      const radius = local.saturation / 200;
      const x =
        local.mode === 'temperature'
          ? (local.kelvin - min) / (max - min)
          : 0.5 + Math.sin(angle) * radius;
      const y = local.mode === 'temperature' ? 0.5 : 0.5 - Math.cos(angle) * radius;
      field.style.setProperty('--colour-x', `${x * 100}%`);
      field.style.setProperty('--colour-y', `${y * 100}%`);
      field.style.setProperty(
        '--swatch',
        local.mode === 'temperature'
          ? 'rgba(255,255,255,.55)'
          : `hsl(${local.hue} ${local.saturation}% ${100 - local.saturation / 2}%)`
      );
      hue.value = local.hue;
      saturation.value = local.saturation;
      kelvin.min = min;
      kelvin.max = max;
      kelvin.value = local.kelvin;
      q('.ov-light-kelvin-value').textContent = `${local.kelvin} K`;
    };
    local.paint = paint;
    const close = () => {
      flush();
      local.open = false;
      local.pointer = null;
      paint();
      local.ctx.el.querySelector('.ov-light-open-colour')?.focus({preventScroll: true});
    };
    const listen = (el, fn) =>
      el?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        fn();
      });
    local.openPicker = () => {
      const c = local.ctx;
      if (!c.ok) return;
      const modes = colourModes(c.attrs);
      if (!modes.colour && !modes.temperature) return;
      local.mode =
        modes.temperature && (c.attrs.color_mode === 'color_temp' || !modes.colour)
          ? 'temperature'
          : 'colour';
      const hs = c.attrs.hs_color || [0, 0];
      local.hue = Math.round(hs[0]);
      local.saturation = Math.round(hs[1]);
      const [min, max] = kelvinRange(c.attrs);
      local.kelvin = Math.round(
        Math.max(
          min,
          Math.min(
            max,
            c.attrs.color_temp_kelvin ||
              (c.attrs.color_temp ? 1e6 / c.attrs.color_temp : (min + max) / 2)
          )
        )
      );
      local.sent = local.selected = action();
      local.open = true;
      paint();
      q('.ov-light-cancel').focus({preventScroll: true});
    };
    listen(q('.ov-light-cancel'), close);
    listen(q('.ov-light-mode'), () => {
      flush();
      local.mode = local.mode === 'colour' ? 'temperature' : 'colour';
      local.selected = action();
      paint();
    });
    pane.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });
    for (const [input, key] of [
      [hue, 'hue'],
      [saturation, 'saturation'],
      [kelvin, 'kelvin']
    ]) {
      input.addEventListener('input', () => {
        local[key] = Number(input.value);
        paint();
        changed();
      });
    }
    const update = (e) => {
      const r = field.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      if (local.mode === 'temperature') {
        const [min, max] = kelvinRange(local.ctx.attrs);
        local.kelvin = Math.round(min + Math.max(0, Math.min(1, x + 0.5)) * (max - min));
      } else {
        local.hue = Math.round((240 - (Math.atan2(x, -y) * 180) / Math.PI + 360) % 360);
        local.saturation = Math.round(Math.min(1, Math.hypot(x, y) * 2) * 100);
      }
      paint();
      changed();
    };
    field.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || local.pointer !== null || !local.ctx.ok) return;
      e.preventDefault();
      local.pointer = e.pointerId;
      field.setPointerCapture(e.pointerId);
      update(e);
    });
    field.addEventListener('pointermove', (e) => {
      if (e.pointerId === local.pointer && local.ctx.ok) update(e);
    });
    const finish = (e, cancel) => {
      if (e.pointerId !== local.pointer) return;
      if (!cancel) update(e);
      flush();
      local.pointer = null;
      if (field.hasPointerCapture(e.pointerId)) field.releasePointerCapture(e.pointerId);
      paint();
      changed();
    };
    field.addEventListener('pointerup', (e) => finish(e, false));
    field.addEventListener('pointercancel', (e) => finish(e, true));
    field.addEventListener('lostpointercapture', (e) => finish(e, true));
  }
  local.ctx = ctx;
  const opener = ctx.el.querySelector('.ov-light-open-colour');
  if (opener)
    opener.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      local.openPicker();
    };
  if (local.open) local.paint();
}
