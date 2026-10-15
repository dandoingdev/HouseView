// Zero impact: a carousel with no screensaver, or only disabled ones, is the same carousel as before this
// feature existed: no state, no listeners, no layer, no overview element, an identical shadow root.
// Run by tests/overviews/harness.js once for the first overview that starts by idle time (the flow below) and once
// for the first overview with `activation: 'event'` (`eventZeroImpact`, at the end of this file).

/** The shadow root HTML with the per-instance parts removed (each card gets its own stylesheet Blob URL). */
const htmlOf = (t) => t.root.innerHTML.replace(/blob:[^"']+/g, 'blob:');

export default async function ({mount, check, variants, overview, activation = 'idle'}) {
  if (activation === 'event') return eventZeroImpact({mount, check, variants, overview});
  const variant = variants.ok;
  const disabled = {type: overview, ...variant.options, enabled: false};

  const plain = await mount(variant, {mode: 'carousel'});
  const baseline = htmlOf(plain);
  check('a carousel without the key has no screensaver state', plain.card._screensaver === null);
  check(
    'it has no layer, no overview element and no sessions',
    !plain.q('.hv-screensaver') && !plain.q('.ov') && !plain.card._overviewSessions
  );

  const off = await mount(variant, {mode: 'carousel', screensaver: [disabled]});
  check('a disabled screensaver leaves the shadow root identical', htmlOf(off) === baseline);
  check('a disabled screensaver allocates nothing', off.card._screensaver === null);
  const offObject = await mount(variant, {mode: 'carousel', screensaver: disabled});
  check('a disabled single block is the same', htmlOf(offObject) === baseline);

  // enabled but not yet idle: still nothing in the DOM
  const idle = await mount(variant, {
    mode: 'carousel',
    screensaver: {type: overview, ...variant.options, idle_timeout: 600}
  });
  check(
    'an enabled screensaver that has not started adds nothing to the DOM',
    htmlOf(idle) === baseline && !idle.q('.hv-screensaver')
  );
  check('but it is armed', idle.card._screensaver !== null);

  // the layer comes and goes without touching the page under it
  const active = await mount(variant, {
    mode: 'carousel',
    screensaver: {type: overview, ...variant.options, idle_timeout: 5}
  });
  const face = active.q('.face')?.outerHTML;
  active.advance(6);
  await active.settle();
  check('the layer appears over the page', !!active.layer);
  check('the page under it is byte-identical', active.q('.face')?.outerHTML === face);
  await active.tap();
  check('the first tap wakes it and calls nothing', active.calls.length === 0);
  await active.settle(400);
  check('the layer is gone after the fade', !active.layer);
  check('the shadow root is back to the baseline', htmlOf(active) === baseline);

  // removing a card with a running screensaver leaves nothing behind
  active.advance(6);
  await active.settle();
  check('the layer is up again', !!active.layer);
  await active.remove();
  check(
    'removing the card removes the layer and disarms the idle manager',
    !active.card.shadowRoot.querySelector('.hv-screensaver') && !active.card._screensaver.idle
  );
}

/**
 * An event overview (a running timer, a ringing doorbell) is never started by idle time. Armed, with its predicate
 * false, it adds nothing to the DOM and never starts however long it waits; with its predicate true it shows, the first
 * tap only dismisses it (nothing underneath is pressed), and the dismissal sticks.
 */
async function eventZeroImpact({mount, check, variants, overview}) {
  const quiet = variants.unavailable ?? variants.missing; // autoShow is false for these (the contract suite checks)
  const disabled = {type: overview, ...quiet.options, enabled: false};

  const plain = await mount(quiet, {mode: 'carousel'});
  const baseline = htmlOf(plain);
  check(
    'no screensaver key: no state and no layer',
    plain.card._screensaver === null && !plain.layer
  );
  const off = await mount(quiet, {mode: 'carousel', screensaver: [disabled]});
  check(
    'a disabled event entry changes nothing and allocates nothing',
    htmlOf(off) === baseline && off.card._screensaver === null
  );

  const armed = await mount(quiet, {
    mode: 'carousel',
    screensaver: {type: overview, ...quiet.options, idle_timeout: 5}
  });
  check('armed with the predicate false: nothing in the DOM', htmlOf(armed) === baseline);
  check('it is armed, with one event entry', armed.card._screensaver?.entries[0]?.event === true);
  armed.advance(600);
  await armed.settle();
  check('idle time never starts it, whatever idle_timeout says', !armed.layer);
  check('it adds nothing to the DOM after ten minutes either', htmlOf(armed) === baseline);

  const entry = armed.card._screensaver.entries[0];
  const triggers = (t) => {
    const e = t.card._screensaver.entries[0];
    return !!e.overview.autoShow(t.card._screensaverContext(e));
  };
  const live = await mount(variants.ok, {mode: 'screensaver', event: true});
  if (!triggers(live)) {
    check('the ok variant triggers it (skipped: this overview triggers on something else)', true);
  } else {
    await live.settle();
    check('with the predicate true it shows over the page', !!live.layer);
    check(
      'the layer is the overview scene, in a modal dialog',
      !!live.layer?.querySelector('.ov-scene') && live.layer.getAttribute('aria-modal') === 'true'
    );
    await live.tap();
    check(
      'the first tap only dismisses it and calls nothing',
      live.calls.length === 0 && live.infos.length === 0
    );
    await live.settle(400);
    check('the layer is gone after the fade', !live.layer);
    live.advance(600);
    await live.settle();
    check('the dismissal sticks while the predicate stays true', !live.layer);
    await live.remove();
    check(
      'removing the card leaves no layer and disarms the manager',
      !live.card.shadowRoot.querySelector('.hv-screensaver') && !live.card._screensaver.idle
    );
  }
  check(
    'the armed entry is still the same object (nothing re-created it)',
    armed.card._screensaver.entries[0] === entry
  );
}
