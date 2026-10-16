// Browser behaviour test (docs/widget-api.md). Runs against dist/houseview.js with a recording mock hass,
// a fixed clock (h.now) and intervals that only fire through h.advance.
const iso = (ms) => new Date(ms).toISOString();

/** A stand-in AudioContext that records what the widget does with it. */
function installFakeAudio(log) {
  const original = window.AudioContext;
  window.AudioContext = class {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
      log.created++;
    }
    resume() {
      log.resumed++;
      return Promise.resolve();
    }
    close() {
      log.closed++;
      this.state = 'closed';
      return Promise.resolve();
    }
    createOscillator() {
      log.tones++;
      return {frequency: {}, connect() {}, start() {}, stop() {}};
    }
    createGain() {
      return {
        gain: {setValueAtTime() {}, exponentialRampToValueAtTime() {}},
        connect() {}
      };
    }
  };
  return () => (window.AudioContext = original);
}

const pointerDown = (t) =>
  t.card.shadowRoot.dispatchEvent(new Event('pointerdown', {bubbles: true, composed: true}));

export default async function (h) {
  const {mount, check, variants} = h;

  // ---- markup -------------------------------------------------------------------------------------------------
  let t = await mount(variants.ok);
  check(
    'timer shows four presets and the idle countdown',
    t.qa('.timer-preset').length === 4 &&
      t
        .qa('.timer-preset .preset-number')
        .map((n) => n.textContent)
        .join() === '5,10,15,30' &&
      t.text('.timer-remaining') === 'Ready'
  );
  check(
    'idle timer disables pause and cancel but keeps Custom',
    t.q('[data-action="timer-pause"]').disabled &&
      t.q('[data-action="timer-cancel"]').disabled &&
      !t.q('[data-action="info"]').disabled
  );

  // ---- start / confirm ----------------------------------------------------------------------------------------
  await t.click('timer-start-10');
  check(
    'a preset starts the timer with the duration in seconds',
    t.calls.length === 1 &&
      t.calls[0].d === 'timer' &&
      t.calls[0].s === 'start' &&
      t.calls[0].data.entity_id === 'timer.test' &&
      t.calls[0].data.duration === 600
  );
  check('starting an idle timer asks nothing', h.confirms.length === 0);

  t = await mount(variants.active);
  h.confirms.length = 0;
  h.confirmWith(false);
  await t.click('timer-start-5');
  check(
    'replacing a running timer asks first, in the fixed wording, and declining calls nothing',
    h.confirms.join() === 'Replace the running kitchen timer?' && t.calls.length === 0
  );
  h.confirmWith(true);
  await t.click('timer-start-5');
  check('confirming replaces the timer', t.calls.length === 1 && t.calls[0].data.duration === 300);
  h.confirmWith(false);
  h.confirms.length = 0;

  t = await mount(variants.paused);
  await t.click('timer-start-15');
  check(
    'a paused timer also needs confirmation to be replaced',
    h.confirms.length === 1 && t.calls.length === 0
  );
  h.confirms.length = 0;

  // ---- pause / resume / cancel --------------------------------------------------------------------------------
  t = await mount(variants.active);
  check(
    'active timer offers Pause and Cancel',
    !t.q('[data-action="timer-pause"]').disabled &&
      !t.q('[data-action="timer-cancel"]').disabled &&
      t.text('[data-action="timer-pause"] .sr') === 'Pause' &&
      !t.q('[data-action="timer-resume"]')
  );
  await t.click('timer-pause');
  check(
    'pause calls timer.pause for its entity',
    t.calls.length === 1 && t.calls[0].s === 'pause' && t.calls[0].data.entity_id === 'timer.test'
  );
  await t.click('timer-cancel');
  check('cancel calls timer.cancel', t.calls.length === 1 && t.calls[0].s === 'cancel');

  t = await mount(variants.paused);
  check(
    'paused timer swaps Pause for Resume and shows the remainder',
    !!t.q('[data-action="timer-resume"]') &&
      !t.q('[data-action="timer-pause"]') &&
      t.text('[data-action="timer-resume"] .sr') === 'Resume' &&
      t.text('.timer-remaining') === '00:01:30'
  );
  await t.click('timer-resume');
  check(
    'resume is timer.start without a duration',
    t.calls.length === 1 && t.calls[0].s === 'start' && !('duration' in t.calls[0].data)
  );

  t = await mount(variants.ok);
  await t.act('timer-pause', 'timer.test');
  check('actions on an idle timer still reach the service (no extra guard)', t.calls.length === 1);

  // ---- custom -------------------------------------------------------------------------------------------------
  t = await mount(variants.ok);
  await t.hold('[data-action="info"]');
  check('holding Custom opens more-info', t.infos.includes('timer.test') && t.calls.length === 0);

  // ---- countdown ----------------------------------------------------------------------------------------------
  t = await mount({
    widget: {entity: 'timer.test'},
    states: {'timer.test': {state: 'active', attributes: {finishes_at: iso(h.now() + 90000)}}}
  });
  check('active countdown shows minutes and seconds', t.text('.timer-remaining') === '1:30');
  h.advance(5000);
  check('countdown follows the clock every second', t.text('.timer-remaining') === '1:25');
  h.advance(120000);
  check('countdown never goes below 0:00', t.text('.timer-remaining') === '0:00');

  t = await mount(variants.activeNoFinish);
  check(
    'active timer without finishes_at shows remaining',
    t.text('.timer-remaining') === '0:12:30'
  );

  // ---- availability -------------------------------------------------------------------------------------------
  t = await mount(variants.unavailable);
  check(
    'unavailable timer says so and disables every control',
    t.text('.timer-remaining') === 'Unavailable' &&
      t.qa('.timer-panel button:not(:disabled)').length === 0
  );
  await t.act('timer-start-5', 'timer.test');
  check('unavailable timer issues no action', t.calls.length === 0);

  t = await mount(variants.missing);
  await t.act('timer-start-5', 'timer.test');
  check(
    'missing timer issues no action and shows Unavailable',
    t.calls.length === 0 && t.text('.timer-remaining') === 'Unavailable'
  );

  t = await mount(variants.unknown);
  check('unknown timer is not usable', t.qa('.timer-panel button:not(:disabled)').length === 0);

  t = await mount(variants.named);
  check(
    'name is escaped and the size class is applied',
    t.text('.timer-panel .ts-name') === 'Oven & grill' && !!t.q('.timer-panel.size-wide')
  );

  // ---- finish detection and the alarm ------------------------------------------------------------------------
  const audio = {created: 0, resumed: 0, closed: 0, tones: 0};
  const restoreAudio = installFakeAudio(audio);
  try {
    const finishing = {
      widget: {entity: 'timer.test'},
      states: {'timer.test': {state: 'active', attributes: {finishes_at: iso(h.now() + 1000)}}}
    };
    t = await mount(finishing, {as: 'card'});
    check('no alarm while the timer is running', !t.q('.timer-alarm') && t.card._alarm === false);

    pointerDown(t);
    check(
      'first pointerdown creates and resumes the audio context',
      audio.created === 1 && audio.resumed === 1 && !!t.card._audio
    );
    pointerDown(t);
    check('the audio context is created once', audio.created === 1);

    h.advance(1000);
    await t.setState('timer.test', {state: 'idle', attributes: {finishes_at: undefined}});
    check(
      'active to idle at the finish time raises the alarm banner',
      !!t.q('.timer-alarm') &&
        t.card._alarm === true &&
        t.q('.timer-alarm').getAttribute('role') === 'alert'
    );
    check(
      'the banner wording',
      t.text('.timer-alarm') === 'Kitchen timer finished · Tap to dismiss'
    );
    check('the chime plays six tones', audio.tones === 6);

    await t.click('dismiss-alarm');
    check('tapping the banner dismisses it', !t.q('.timer-alarm') && t.card._alarm === false);

    // A cancel goes idle far from finishes_at: no alarm.
    await t.setState('timer.test', {
      state: 'active',
      attributes: {finishes_at: iso(h.now() + 600000)}
    });
    await t.setState('timer.test', {state: 'idle', attributes: {finishes_at: undefined}});
    check('cancelling a timer early raises no alarm', !t.q('.timer-alarm') && audio.tones === 6);

    t.remove();
    await h.settle();
    check('the audio context is closed when the card leaves the page', audio.closed === 1);
  } finally {
    restoreAudio();
  }

  // ---- no timer widget, no audio ------------------------------------------------------------------------------
  const silent = {created: 0, resumed: 0, closed: 0, tones: 0};
  const restoreSilent = installFakeAudio(silent);
  try {
    t = await mount({widget: {type: 'date'}, states: {}}, {as: 'card'});
    pointerDown(t);
    check('a card without a timer widget never creates an audio context', silent.created === 0);
  } finally {
    restoreSilent();
  }
}
