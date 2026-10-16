/** Shared light/volume gesture: local feedback while dragging, one native value action on release. */
export function bindVerticalLevel(ctx, {prefix, readValue, storeKey, property}) {
  const input = ctx.el?.querySelector(`.ov-${prefix}-input`);
  if (!input) return;
  const control = input.closest(`.ov-${prefix}-control`);
  let local = ctx.store.get(storeKey);
  if (!local || local.input !== input) {
    local = {input, pointer: null, value: readValue(ctx.state), state: ctx.state};
    ctx.store.set(storeKey, local);
    const paint = () => {
      control.style.setProperty(property, `${input.value}%`);
      ctx.el.querySelector(`.ov-${prefix}-value`).textContent = local.ok ? input.value : '—';
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
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
    });
  }
  if (local.pointer === null && local.state !== ctx.state) local.value = readValue(ctx.state);
  local.state = ctx.state;
  local.ok = ctx.ok;
  input.value = String(local.value);
  control.style.setProperty(property, `${local.value}%`);
  ctx.el.querySelector(`.ov-${prefix}-value`).textContent = ctx.ok ? String(local.value) : '—';
}
