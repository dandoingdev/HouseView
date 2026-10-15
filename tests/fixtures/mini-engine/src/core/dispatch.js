import {resolveAction} from './registry.js';
import {createActionContext} from './context.js';
export async function dispatchAction(card, action, id) {
  const hit = resolveAction(action);
  const ctx = createActionContext(card, action, id);
  const def = hit?.def || {run() {}};
  ctx.param = hit?.param || '';
  const state = card._hass.states[id];
  if (def.immediate) return def.run(ctx, id);
  if (action === 'info' && state?.state === 'unknown') return card._info(id);
  if (
    card._pending.has(id) ||
    (!card._available(id) && !(def.availability === 'allow-unknown' && state?.state === 'unknown'))
  )
    return;
  const g = def.guard?.(ctx, id);
  if (g === false) return;
  if (g === 'info') return card._info(id);
  const msg = def.confirm?.(ctx, id);
  if (msg && !window.confirm(msg)) return;
  card._pending.add(id);
  card._message = '';
  card._refreshActionState();
  try {
    await def.run(ctx, id);
  } catch (err) {
    card._message = `Could not complete action: ${err.message || 'please try again'}`;
  } finally {
    card._pending.delete(id);
    card._refreshActionState();
  }
}
