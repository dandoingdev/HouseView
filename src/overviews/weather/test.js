// Browser behaviour tests (tests/overviews/harness.js, against dist/houseview.js with a recording mock hass).
import {CONDITIONS} from './model.js';
import {GROUP} from './sky.js';

export default async function ({mount, check, variants, wait}) {
  /**
   * Change an entity the way Home Assistant does: a NEW state object, then hass again. (The harness' own setState
   * mutates in place, which a card on a real connection does not see: it compares state objects by reference.)
   */
  const update = async (t, id, state, attributes = {}) => {
    const current = t.hass.states[id];
    t.mock.replaceState(id, {
      ...current,
      state: state ?? current.state,
      attributes: {...current.attributes, ...attributes}
    });
    t.el.hass = t.hass;
    await t.settle();
  };

  // ---- tile mode: a small button that opens the full scene ----
  let t = await mount(variants.tile);
  check(
    'tile shows the condition icon, condition and range, and no scene',
    !!t.q('.ov-mode-tile') &&
      t.text('.ov-tile-cond') === 'Partly Cloudy' &&
      t.text('.ov-tile-hl') === 'H:14° L:9°' &&
      !t.q('.ov-sky') &&
      !t.q('.ov-temp')
  );
  await t.click('overview-open');
  check(
    'tapping the tile opens the full-page layer with a close button and calls no service',
    !!t.layer &&
      !!t.layer.querySelector('.ov-weather-scene') &&
      t.layer.querySelector('[data-action="overview-close"]')?.getAttribute('aria-label') ===
        'Close' &&
      !t.layer.querySelector('.ov-dismiss') &&
      t.calls.length === 0
  );
  t.layer.querySelector('.ov-weather-scene').click();
  await t.settle();
  check('a tap on the scene leaves the weather view open', !!t.layer && t.layerState === 'on');
  await t.click('overview-close');
  await wait(400);
  t.advance(1); // the fake clock must pass the tap-swallow window before another open
  check('the close button dismisses the layer', !t.layer && !!t.q('.ov-mode-tile'));
  await t.click('overview-open');
  t.layer
    .querySelector('[data-action="overview-close"]')
    .dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
  await wait(400);
  check('Escape dismisses the weather view', !t.layer);

  // ---- card mode: the reference look ----
  t = await mount(variants.ok);
  check(
    'card mode shows condition, range, temperature, time and four details',
    t.text('.ov-cond-text') === 'Partly Cloudy' &&
      t.text('.ov-hl') === 'H:14° L:9°' &&
      t.text('.ov-temp') === '12°' &&
      t.text('.ov-time') === '10:09' &&
      t.qa('.ov-detail').length === 4
  );
  check(
    'the details read sunset, wind, humidity and next rain',
    JSON.stringify(t.qa('.ov-detail').map((d) => d.dataset.detail)) ===
      '["sunset","wind","humidity","rain"]' &&
      t.text('[data-detail="sunset"] .ov-detail-value') === '19:32' &&
      t.text('[data-detail="wind"] .ov-detail-value') === '7 mph' &&
      t.text('[data-detail="humidity"] .ov-detail-value') === '76%' &&
      t.text('[data-detail="rain"] .ov-detail-value') === 'In 1d'
  );
  check(
    'the card root does not carry the shared widget styling',
    !t.q('[data-widget]').classList.contains('tile') &&
      !t.q('[data-widget]').classList.contains('widget')
  );
  await t.hold('[data-action="info"]');
  check(
    'card hold opens more-info for the weather entity and calls no service',
    t.infos[0] === 'weather.test' && t.calls.length === 0
  );

  // ---- all 15 conditions ----
  for (const condition of CONDITIONS) {
    t = await mount(variants[condition]);
    const scene = t.q('.ov-weather-scene');
    check(
      `${condition}: sky group ${GROUP[condition]}, an icon and a label`,
      scene?.dataset.group === GROUP[condition] &&
        !!t.q('.ov-cond-line ha-icon') &&
        t.text('.ov-cond-text').length > 0
    );
  }

  // ---- night: the artwork follows the sun entity ----
  t = await mount(variants.night);
  check(
    'a sun below the horizon paints the night sky and turns Sunset into Sunrise',
    t.q('.ov-weather-scene').dataset.tod === 'night' &&
      !!t.q('.ov-moon') &&
      t.text('[data-detail="sunset"] .ov-detail-label') === 'Sunrise'
  );
  t = await mount(variants.ok);
  await update(t, 'sun.sun', 'below_horizon');
  check(
    'the sun entity is watched: going down re-renders the scene at night',
    t.q('.ov-weather-scene').dataset.tod === 'night'
  );

  // ---- live data: a hass update patches the numbers ----
  t = await mount(variants.ok);
  await update(t, 'weather.test', undefined, {temperature: 15, humidity: 55});
  check(
    'a new temperature and humidity are shown without a reload',
    t.text('.ov-temp') === '15°' && t.text('[data-detail="humidity"] .ov-detail-value') === '55%'
  );

  // ---- options and locale ----
  t = await mount(variants.noTime);
  check('show_time: false removes the clock', !t.q('.ov-time'));
  t = await mount(variants.solid);
  check('frosted: false gives solid numerals', !!t.q('.ov-temp-solid'));
  t = await mount(variants.customDetails);
  check(
    'six details are shown in their own order in three columns',
    t.qa('.ov-detail').length === 6 &&
      t.q('.ov-details').style.getPropertyValue('--ov-cols') === '3'
  );
  t = await mount(variants.twelveHour);
  check(
    'a 12 hour profile shows AM or PM beside the time',
    /^(AM|PM)$/i.test(t.text('.ov-period'))
  );
  t = await mount(variants.longLocale);
  check(
    'a German profile shows German words',
    t.text('.ov-cond-text') === 'Gewitter mit Regen' &&
      t.text('[data-detail="humidity"] .ov-detail-label') === 'Luftfeuchtigkeit'
  );

  // ---- states that must not crash ----
  for (const name of ['unavailable', 'unknown', 'missing']) {
    t = await mount(variants[name]);
    check(
      `${name}: calm "Weather unavailable", the time, no temperature`,
      t.text('.ov-cond-text') === 'Weather unavailable' && !!t.q('.ov-time') && !t.q('.ov-temp')
    );
  }
  t = await mount(variants.missing);
  check('a missing entity disables the more-info tap', t.q('button[data-action="info"]')?.disabled);
  t = await mount(variants.evilName);
  check('entity names never become markup', !t.qa('img').length);

  // ---- the standalone card ----
  t = await mount(variants.ok, {as: 'standalone'});
  check('the standalone card paints the same scene', t.text('.ov-temp') === '12°');

  // ---- clock tick: only the time text changes ----
  t = await mount(variants.ok, {mode: 'screensaver', freeze: false}); // ctx.now follows the fake clock
  const scene = t.q('.ov-weather-scene');
  const start = t.text('.ov-time');
  t.advance(60);
  check(
    'tick moves the clock on without re-rendering the scene',
    start === '10:10' && t.text('.ov-time') === '10:11' && t.q('.ov-weather-scene') === scene
  );

  // ---- screensaver mode ----
  check(
    'screensaver layer is a labelled dialog above the page',
    !!t.layer &&
      t.layer.getAttribute('role') === 'dialog' &&
      t.layer.querySelector('.ov-dismiss').getAttribute('aria-label') === 'Dismiss screensaver'
  );
  const dismiss = t.layer.querySelector('.ov-dismiss');
  dismiss.focus({focusVisible: true});
  const dismissStyle = getComputedStyle(dismiss);
  check(
    'weather screensaver has no border while focused',
    dismiss.matches(':focus-visible') &&
      dismissStyle.outlineStyle === 'none' &&
      dismissStyle.borderTopWidth === '0px' &&
      dismissStyle.borderRightWidth === '0px' &&
      dismissStyle.borderBottomWidth === '0px' &&
      dismissStyle.borderLeftWidth === '0px'
  );
  await t.tap();
  check(
    'first tap dismisses and reaches nothing underneath',
    t.calls.length === 0 && t.layerState === 'leaving'
  );

  // ---- the covered card: an opaque layer hides what is under it and the card stops working ----
  t = await mount(variants.rainNow, {mode: 'screensaver', freeze: false});
  const shell = t.q('.shell');
  const face = t.q('.face');
  check('the card is still painted while the layer fades in', !shell.hasAttribute('data-covered'));
  t.advance(1);
  check(
    'once the layer is opaque the shell is marked and nothing under it is painted',
    shell.hasAttribute('data-covered') &&
      getComputedStyle(face).visibility === 'hidden' &&
      getComputedStyle(t.q('.page-nav')).visibility === 'hidden' &&
      getComputedStyle(t.layer).visibility === 'visible'
  );
  await t.tap();
  check(
    'a tap uncovers the card at once, before the layer has faded',
    !shell.hasAttribute('data-covered') &&
      getComputedStyle(face).visibility === 'visible' &&
      t.layerState === 'leaving'
  );

  // ---- performance: the scene's cost is the card's choice ----
  const moving = matchMedia('(prefers-reduced-motion: no-preference)').matches;
  t = await mount(variants.rainNow, {mode: 'screensaver', config: {performance: 'full'}});
  check(
    'performance: full keeps the rain and, with motion allowed, the animation (clouds drift as one layer)',
    t.qa('.ov-clouds').length === 1 &&
      getComputedStyle(t.q('.ov-fx')).display !== 'none' &&
      !t.q('.shell').classList.contains('perf-lite') &&
      (!moving || t.layer.getAnimations({subtree: true}).length >= 2)
  );
  check('at most three animations run at once', t.layer.getAnimations({subtree: true}).length <= 3);
  t = await mount(variants.rainNow, {mode: 'screensaver', config: {performance: 'lite'}});
  check(
    'performance: lite marks the shell, shows a still scene without rain, and fades nothing',
    t.q('.shell').classList.contains('perf-lite') &&
      t.layer.getAnimations({subtree: true}).length === 0 &&
      getComputedStyle(t.q('.ov-fx')).display === 'none' &&
      getComputedStyle(t.layer).transitionDuration === '0s'
  );
  t = await mount(variants.ok, {mode: 'screensaver', config: {performance: 'lite'}});
  check(
    'lite drops the shadow copy of the numerals and the sun rays but keeps the numerals',
    getComputedStyle(t.q('.ov-temp-shade')).display === 'none' &&
      t.text('.ov-temp') === '12°' &&
      getComputedStyle(t.q('.ov-sun'), '::before').display === 'none'
  );
  t = await mount(variants.ok, {mode: 'card', config: {performance: 'lite'}});
  check(
    'a lite overview card is still too, with no animation on the page',
    t.q('.shell').classList.contains('perf-lite') &&
      t.q('.shell').getAnimations({subtree: true}).length === 0 &&
      t.text('.ov-temp') === '12°'
  );

  // ---- forecast subscriptions: shared, live updates, released ----
  t = await mount(variants.rainTomorrow, {mode: 'screensaver'});
  const live = () =>
    t.connection.subscriptions
      .filter((s) => s.active)
      .map((s) => s.msg.forecast_type)
      .sort();
  check(
    'daily and hourly forecasts are subscribed once each',
    JSON.stringify(live()) === '["daily","hourly"]'
  );
  t.pushForecast('hourly', variants.rainSoon.forecasts.hourly);
  await t.settle();
  check(
    'a pushed forecast re-renders the rain detail',
    t.text('[data-detail="rain"] .ov-detail-value') === 'In 3h'
  );
  const second = await mount(variants.rainTomorrow, {
    mode: 'screensaver',
    connection: t.connection
  }); // same HA session
  check(
    'a second card on the same connection shares the subscriptions',
    t.connection.subscriptions.length === 2
  );
  await second.remove({settle: true});
  await t.remove({settle: true});
  check(
    'everything is unsubscribed after the cards are removed',
    t.connection.subscriptions.every((s) => !s.active)
  );

  // ---- entities without a forecast type ----
  t = await mount(
    {
      ...variants.ok,
      states: {
        ...variants.ok.states,
        'weather.test': {
          ...variants.ok.states['weather.test'],
          attributes: {...variants.ok.states['weather.test'].attributes, supported_features: 1}
        }
      }
    },
    {mode: 'screensaver'}
  );
  check(
    'an entity without hourly support only subscribes to daily',
    JSON.stringify(t.connection.subscriptions.map((s) => s.msg.forecast_type)) === '["daily"]'
  );
}
