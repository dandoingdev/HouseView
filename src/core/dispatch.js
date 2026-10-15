// dispatchAction: the original `_act` pipeline, driven by data instead of an if-chain.
// The ORDER of the steps is the contract (docs/architecture.md); each step is one entry of the pipeline:
//
//   1  immediate actions            camera-grid/focus/back, dim, dismiss-alarm, page-prev/next: run, done
//   2  info on state "unknown"      the shared `info` action opens more-info even for an "unknown" entity
//   3  pending / availability       a call already in flight for this entity, or an entity that is not usable
//   4  guard                        false = ignore, 'info' = open more-info instead
//   5  confirm                      a message to confirm (native window.confirm, or the inline sheet)
//   6  pending.add, clear the feedback message, refresh the tiles
//   7  run                          the service call(s), only ever through ctx.call
//   8  catch                        "Could not complete action: <reason>"
//   9  finally                      pending.delete, refresh
//
// An action name nobody owns still goes through 3 and 6-9 with a no-op run: it clears the feedback line and
// refreshes. Everything before step 6 is synchronous unless a confirmation returns a promise.
import {isThenable, requestConfirmation} from './confirm.js';
import {createActionContext} from './context.js';
import {resolveAction} from './registry.js';
import {isUsable} from './state.js';

const NO_OP = Object.freeze({run() {}});

/**
 * @param {any} card       the HouseViewCard (or a test double)
 * @param {string} action  data-action value, e.g. 'cover-open' or 'timer-start-15'
 * @param {string} [id]    data-entity value
 */
export async function dispatchAction(card, action, id) {
  const hit = resolveAction(action);
  const def = hit?.def ?? NO_OP;
  const ctx = createActionContext(card, action, id, hit);

  // 1 immediate
  if (def.immediate) return def.run(ctx, id);

  // 2 info on an "unknown" entity
  const state = ctx.stateOf(id);
  if (def.infoWhenUnknown && state?.state === 'unknown') return card._info(id);

  // 3 pending / availability
  if (card._pending.has(id) || !isUsable(state, id, def.availability)) return undefined;

  // 4 guard. Anything but true or 'info' ignores the press, so a guard that forgets to return is safe.
  if (def.guard) {
    const verdict = def.guard(ctx, id);
    if (verdict === 'info') return card._info(id);
    if (!verdict) return undefined;
  }

  // 5 confirm
  if (def.confirm) {
    const message = def.confirm(ctx, id);
    if (message) {
      const answer = requestConfirmation(card, message);
      if (!(isThenable(answer) ? await answer : answer)) return undefined;
      // The user took time to answer; another press may have started this entity's call meanwhile.
      if (card._pending.has(id)) return undefined;
    }
  }

  // 6 pending
  card._pending.add(id);
  card._message = '';
  card._refreshActionState();
  try {
    // 7 run
    await def.run(ctx, id);
  } catch (error) {
    // 8 failure shows in the feedback line
    card._message = ctx.t('error.action', {reason: error?.message || ctx.t('error.try_again')});
  } finally {
    // 9
    card._pending.delete(id);
    card._refreshActionState();
  }
  return undefined;
}
