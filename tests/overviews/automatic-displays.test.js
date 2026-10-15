// The automatic displays (docs/overview-api.md): a `timer` card on the dashboard brings up the timer display while the
// timer runs, a `media_player` card brings up the album cover when the screensaver would start and the speaker plays.
// Neither needs a `screensaver` key. Run by tests/overviews/harness.js once for the `timer` overview and once for the
// `cover_art` overview, with that overview's fixtures (an overview that is not in the bundle has no checks).

/** The shadow root HTML with the per-instance parts removed (each card gets its own stylesheet Blob URL). */
const htmlOf = (t) => t.root.innerHTML.replace(/blob:[^"']+/g, 'blob:');

/** The overviews that have automatic-display checks, and what each check needs. */
export const AUTOMATIC = {timer: automaticTimer, cover_art: automaticCoverArt};

export default async function ({mount, check, variants, overview}) {
  await AUTOMATIC[overview]({mount, check, variants});
}

const timerCard = (entity) => ({type: 'custom:houseview-timer-card', entity});
const playerCard = (entity) => ({
  type: 'custom:houseview-widget-card',
  widget_type: 'media_player',
  entity
});
const kindOf = (t) => t.layer?.dataset.screensaver ?? null;

/**
 * `timer_display`: a timer card on the dashboard is the whole configuration. No `screensaver` key, the display comes up
 * while the timer runs, a tap dismisses it without pressing anything, and `timer_display: false` leaves a carousel that
 * allocates nothing and is byte-identical to one that never heard of the feature.
 */
async function automaticTimer({mount, check, variants}) {
  const entity = variants.ok.options.entity;
  const cards = [timerCard(entity)];
  const quiet = variants.unavailable ?? variants.missing;

  const off = await mount(quiet, {mode: 'carousel', cards, config: {timer_display: false}});
  const baseline = htmlOf(off);
  check('timer_display: false allocates nothing', off.card._screensaver === null && !off.layer);

  const armed = await mount(quiet, {mode: 'carousel', cards});
  check(
    'a timer card alone arms one implicit event entry',
    armed.card._screensaver?.entries.length === 1 &&
      armed.card._screensaver.entries[0].implicit === true &&
      armed.card._screensaver.entries[0].event === true
  );
  armed.advance(600);
  await armed.settle();
  check('with the timer not running nothing shows, however long it waits', !armed.layer);
  check('and the shadow root is the one without the feature', htmlOf(armed) === baseline);

  const live = await mount(variants.ok, {mode: 'carousel', cards});
  await live.settle();
  check('a running timer shows its display with no screensaver key', kindOf(live) === 'timer');
  await live.tap();
  check('the first tap only dismisses it and calls nothing', live.calls.length === 0);
  await live.settle(400);
  check('the layer is gone after the fade', !live.layer);
  live.advance(600);
  await live.settle();
  check('the dismissal sticks while the timer keeps running', !live.layer);
  await live.remove();

  const over = await mount(variants.ok, {mode: 'carousel', cards, config: {timer_display: false}});
  await over.settle();
  check('timer_display: false keeps a running timer off the screen', !over.layer);
}

/**
 * `music_screensaver`: a media player card is the whole configuration. The cover wins an idle activation only while
 * the speaker plays; a configured weather screensaver stays the default; nothing eligible and nothing else shows nothing.
 */
async function automaticCoverArt({mount, check, variants}) {
  const entity = variants.ok.options.entity;
  const cards = [playerCard(entity)];
  const sky = {state: 'sunny', attributes: {friendly_name: 'Home', temperature: 18}};
  const withSky = (variant) => ({...variant, states: {...variant.states, 'weather.home': sky}});
  const weather = {type: 'weather', entity: 'weather.home', idle_timeout: 30};

  const off = await mount(variants.ok, {
    mode: 'carousel',
    cards,
    config: {music_screensaver: false}
  });
  const baseline = htmlOf(off);
  check('music_screensaver: false allocates nothing', off.card._screensaver === null);

  const armed = await mount(variants.ok, {mode: 'carousel', cards});
  check(
    'a media player card alone arms one implicit idle entry of priority 10',
    armed.card._screensaver?.entries.length === 1 &&
      armed.card._screensaver.entries[0].implicit === true &&
      armed.card._screensaver.entries[0].event === false &&
      armed.card._screensaver.entries[0].priority === 10
  );
  check('it adds nothing to the DOM until idle time is up', htmlOf(armed) === baseline);
  armed.advance(4);
  await armed.settle();
  check('on the music page the cover starts after 5 s, not the 120 s default', !armed.layer);
  armed.advance(2);
  await armed.settle();
  check(
    'a playing speaker shows its cover when the screensaver would start',
    kindOf(armed) === 'cover_art'
  );
  await armed.tap();
  check('the first tap only dismisses it and calls nothing', armed.calls.length === 0);
  await armed.settle(400);
  check('the layer is gone after the fade', !armed.layer);
  await armed.remove();

  const paused = await mount(variants.paused ?? variants.ok, {mode: 'carousel', cards});
  paused.advance(125);
  await paused.settle();
  check('a paused speaker is not eligible: nothing shows', !paused.layer);
  check('and the idle manager is not left active', paused.card._screensaver.idle.active === false);

  const idleSpeaker = variants.idle ?? variants.off ?? variants.unavailable;
  if (idleSpeaker) {
    const quiet = await mount(idleSpeaker, {mode: 'carousel', cards});
    quiet.advance(125);
    await quiet.settle();
    check('a speaker that is not playing shows nothing', !quiet.layer);
  }

  const stack = await mount(withSky(variants.ok), {
    mode: 'carousel',
    cards,
    screensaver: weather
  });
  stack.advance(4);
  await stack.settle();
  check('with weather configured the music page still starts the cover after 5 s', !stack.layer);
  stack.advance(2);
  await stack.settle();
  check('a playing speaker beats the weather screensaver', kindOf(stack) === 'cover_art');
  await stack.remove();

  const calm = await mount(withSky(variants.paused ?? variants.ok), {
    mode: 'carousel',
    cards,
    screensaver: weather
  });
  calm.advance(31);
  await calm.settle();
  check('weather stays the default while nothing plays', kindOf(calm) === 'weather');
}
