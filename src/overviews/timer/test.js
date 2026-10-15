// Browser behaviour tests (tests/overviews/harness.js, against dist/houseview.js with a recording mock hass).
// The harness' clock is fake: intervals only fire through advance, and Date.now moves with them. The clock is shared
// by every overview's test and cannot go back, so this file advances it by under a minute in all (weather's clock test
// expects to start in the 10:10 minute).

const KITCHEN = 'timer.kitchen_timer';

export default async function ({mount, check, variants, wait, now}) {
  /** Change the timer the way Home Assistant does: a NEW state object, then hass again. */
  const update = async (t, state, attributes = {}) => {
    const current = t.hass.states[KITCHEN];
    t.mock.replaceState(KITCHEN, {
      ...current,
      state,
      attributes: {...current.attributes, ...attributes}
    });
    t.el.hass = t.hass;
    await t.settle();
  };
  const lit = (t) => t.qa('.ov-timer-tick.on').length;
  /** A running 15 minute timer that finishes `left` seconds after the fake clock's NOW (for freeze: false mounts). */
  const running = (left, total = 900) => ({
    ...variants.ok,
    states: {
      [KITCHEN]: {
        ...variants.ok.states[KITCHEN],
        attributes: {
          ...variants.ok.states[KITCHEN].attributes,
          duration: `0:${String(total / 60).padStart(2, '0')}:00`,
          finishes_at: new Date(now() + left * 1000).toISOString()
        }
      }
    }
  });

  // ---- card mode: the reference face ----
  let t = await mount(variants.ok);
  check(
    'the reference face: 10:56, 15 MIN, 44 of 60 ticks lit',
    t.text('[data-ov="time"]') === '10:56' &&
      t.text('[data-ov="caption"]') === '15 MIN' &&
      t.qa('.ov-timer-tick').length === 60 &&
      lit(t) === 44
  );
  check(
    'the lit ticks come first, the elapsed ones are the last 16',
    t.qa('.ov-timer-tick').every((tick, i) => tick.classList.contains('on') === i < 44)
  );
  check(
    'it is a timer role with a label, and the ticks are decoration',
    t.q('.ov-timer-scene')?.getAttribute('role') === 'timer' &&
      t.q('.ov-timer-scene').getAttribute('aria-label') === 'Kitchen timer, 10:56 remaining' &&
      t.q('.ov-timer-ring')?.getAttribute('aria-hidden') === 'true'
  );
  check(
    'it is black with the orange of the reference',
    getComputedStyle(t.q('.ov-timer-scene')).backgroundColor === 'rgb(0, 0, 0)' &&
      getComputedStyle(t.q('.ov-timer-tick.on')).backgroundColor === 'rgb(244, 161, 75)' &&
      getComputedStyle(t.q('[data-ov="caption"]')).color === 'rgb(244, 161, 75)'
  );
  check(
    'the dim ticks are the same orange at low alpha',
    getComputedStyle(t.qa('.ov-timer-tick')[59]).backgroundColor === 'rgba(244, 161, 75, 0.22)'
  );
  check(
    'the time is white, medium weight, with tabular figures',
    getComputedStyle(t.q('[data-ov="time"]')).color === 'rgb(255, 255, 255)' &&
      getComputedStyle(t.q('[data-ov="time"]')).fontWeight === '500' &&
      getComputedStyle(t.q('[data-ov="time"]')).fontVariantNumeric.includes('tabular-nums')
  );
  await t.click('info');
  check(
    'a tap on the card opens more-info of the timer and calls no service',
    t.infos[0] === KITCHEN && t.calls.length === 0
  );

  // ---- the stage is a square and the ring stays inside it ----
  const stage = t.q('.ov-timer-stage').getBoundingClientRect();
  const scene = t.q('.ov-timer-scene').getBoundingClientRect();
  check(
    'the stage is the largest centred square of the card',
    Math.abs(stage.width - stage.height) < 1 &&
      Math.abs(stage.width - Math.min(scene.width, scene.height)) < 1 &&
      Math.abs(stage.left + stage.width / 2 - (scene.left + scene.width / 2)) < 1
  );
  check(
    'every tick lies within the stage',
    t.qa('.ov-timer-tick').every((tick) => {
      const r = tick.getBoundingClientRect();
      return (
        r.left >= stage.left - 1 &&
        r.right <= stage.right + 1 &&
        r.top >= stage.top - 1 &&
        r.bottom <= stage.bottom + 1
      );
    })
  );

  // ---- the tick hook: one patch per second, no re-render ----
  t = await mount(running(656), {freeze: false});
  check('on the fake clock the countdown starts at 10:56', t.text('[data-ov="time"]') === '10:56');
  const face = t.q('.ov-timer-time');
  t.advance(1);
  check('one second later it reads 10:55', t.text('[data-ov="time"]') === '10:55');
  check('the time element is patched in place, not replaced', t.q('.ov-timer-time') === face);
  check(
    'the aria label follows the countdown',
    t.q('.ov-timer-scene').getAttribute('aria-label') === 'Kitchen timer, 10:55 remaining'
  );
  t.advance(11); // 12 s in: 644 left, ceil(60 * 644 / 900) = 43
  check(
    'after 12 s: 10:44 and 43 ticks lit (the 44th went dim)',
    t.text('[data-ov="time"]') === '10:44' &&
      lit(t) === 43 &&
      t.q('.ov-timer-scene').dataset.lit === '43'
  );
  t = await mount(running(15), {freeze: false});
  t.advance(15);
  check(
    'at the end it shows 0:00 with no ticks lit, never a negative time',
    t.text('[data-ov="time"]') === '0:00' && lit(t) === 0
  );
  t.advance(3);
  check('and stays at 0:00', t.text('[data-ov="time"]') === '0:00');
  check('the ticking called no service', t.calls.length === 0);

  // ---- hours ----
  t = await mount(variants.oneHalf);
  check(
    'an hour and a half: 1:12:34, 1 H 30 MIN, the smaller h:mm:ss size',
    t.text('[data-ov="time"]') === '1:12:34' &&
      t.text('[data-ov="caption"]') === '1 H 30 MIN' &&
      t.q('.ov-timer-time').classList.contains('ov-timer-long') &&
      parseFloat(getComputedStyle(t.q('.ov-timer-time')).fontSize) <
        parseFloat(getComputedStyle(t.q('[data-ov="caption"]')).fontSize) * 5
  );
  t = await mount(variants.shortTimer);
  check('a 45 second timer is captioned 45 SEC', t.text('[data-ov="caption"]') === '45 SEC');
  t = await mount(variants.hour);
  check('a one hour timer is captioned 1 H', t.text('[data-ov="caption"]') === '1 H');

  // ---- paused, idle, unavailable ----
  t = await mount(variants.paused);
  check(
    'paused: 7:30 with PAUSED · 15 MIN and 30 ticks lit',
    t.text('[data-ov="time"]') === '7:30' &&
      t.text('[data-ov="caption"]') === 'PAUSED · 15 MIN' &&
      lit(t) === 30
  );
  t.advance(5);
  check(
    'a paused timer does not count down',
    t.text('[data-ov="time"]') === '7:30' && lit(t) === 30
  );

  t = await mount(variants.idle);
  check(
    'idle card: the length, READY and an unlit ring',
    t.text('[data-ov="time"]') === '15:00' &&
      t.text('[data-ov="caption"]') === 'READY' &&
      lit(t) === 0 &&
      t.qa('.ov-timer-tick').length === 60
  );
  for (const name of ['unavailable', 'unknown', 'missing']) {
    t = await mount(variants[name]);
    check(
      `${name}: a calm "Timer unavailable", no caption, no lit ticks`,
      t.text('[data-ov="time"]') === 'Timer unavailable' &&
        t.text('[data-ov="caption"]') === '' &&
        lit(t) === 0
    );
  }

  // ---- degenerate data ----
  t = await mount(variants.noDuration);
  check(
    'a missing duration still draws a full, sensible face (10:56, 44 lit)',
    t.text('[data-ov="time"]') === '10:56' && lit(t) === 44
  );
  t = await mount(variants.pastFinish);
  check(
    'a finishes_at in the past shows 0:00, not a negative time',
    t.text('[data-ov="time"]') === '0:00' && lit(t) === 0
  );
  t = await mount(variants.evilName);
  check(
    'a hostile friendly_name is text, never markup',
    !t.q('img') && t.q('.ov-timer-scene').getAttribute('aria-label').startsWith('<img src=x')
  );

  // ---- live updates ----
  t = await mount(variants.ok);
  await update(t, 'paused', {remaining: '0:05:00'});
  check(
    'pausing re-renders: PAUSED · 15 MIN, 5:00, 20 ticks',
    t.text('[data-ov="caption"]') === 'PAUSED · 15 MIN' &&
      t.text('[data-ov="time"]') === '5:00' &&
      lit(t) === 20
  );
  await update(t, 'idle');
  check(
    'going idle: READY and an unlit ring',
    t.text('[data-ov="caption"]') === 'READY' && lit(t) === 0
  );

  // ---- screensaver layer: the same face, over the page ----
  t = await mount(variants.ok, {mode: 'screensaver'});
  check(
    'in the screensaver layer the scene is the same face',
    !!t.layer?.querySelector('.ov-timer-scene') &&
      t.layer.querySelector('[data-ov="time"]').textContent === '10:56' &&
      t.layer.querySelectorAll('.ov-timer-tick.on').length === 44
  );
  await t.tap();
  await wait(400);
  check('the first tap dismisses it and calls no service', !t.layer && t.calls.length === 0);

  t = await mount(running(656), {mode: 'screensaver', freeze: false});
  check(
    'the layer shows 10:56',
    t.layer?.querySelector('[data-ov="time"]')?.textContent === '10:56'
  );
  await t.settle(400); // fade in, then the carousel is covered
  t.advance(5);
  check(
    "the layer's tick hook advances the countdown (10:51)",
    t.layer?.querySelector('[data-ov="time"]')?.textContent === '10:51'
  );

  // ---- event activation: it comes up by itself while the timer runs ----
  const block = {type: 'timer', entity: KITCHEN};
  // (idle_timeout is accepted but ignored: the 5 s here pass, then it must still be quiet)
  t = await mount(variants.idle, {mode: 'carousel', screensaver: {...block, idle_timeout: 5}});
  check('an idle timer shows nothing over the dashboard', !t.layer);
  t.advance(6);
  await t.settle();
  check('idle time never starts it, whatever idle_timeout says', !t.layer);

  await update(t, 'active', {
    remaining: '0:15:00',
    finishes_at: new Date(now() + 900e3).toISOString()
  });
  check(
    'a timer that starts brings the display up by itself',
    !!t.layer?.querySelector('.ov-timer-scene') &&
      t.layer.querySelector('[data-ov="caption"]').textContent === '15 MIN'
  );
  check('which calls no service', t.calls.length === 0);

  await t.tap();
  await wait(400);
  check(
    'a tap dismisses it and the timer keeps running',
    !t.layer && t.hass.states[KITCHEN].state === 'active'
  );
  check('the tap pressed nothing underneath', t.calls.length === 0);
  await update(t, 'active', {remaining: '0:14:30'});
  t.advance(5);
  await t.settle();
  check('it stays dismissed while the timer runs on', !t.layer);

  await update(t, 'idle');
  await update(t, 'active', {
    finishes_at: new Date(now() + 600e3).toISOString(),
    remaining: '0:10:00'
  });
  check('once the timer has stopped and started again it comes back', !!t.layer);

  await update(t, 'paused', {remaining: '0:08:00'});
  check(
    'pausing keeps it and says PAUSED',
    !!t.layer && t.layer.querySelector('[data-ov="caption"]').textContent === 'PAUSED · 15 MIN'
  );
  await update(t, 'idle');
  check(
    'a finished or cancelled timer takes it away at once (no tap swallow)',
    t.layerState === 'leaving' || !t.layer
  );
  await wait(400);
  check('and it is gone', !t.layer);
}
