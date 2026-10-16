// Browser behaviour tests (tests/overviews/harness.js, against dist/houseview.js with a recording mock hass).
// The harness' clock is fake and shared by every overview's test and cannot go back: the timer overview's test uses 51 s
// of the minute that weather's clock test needs, so this file never advances it.

const PLAYER = 'media_player.living_room';
const ART_PATH = '/api/media_player_proxy/media_player.living_room';
const px = (value) => parseFloat(value);
const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;

export default async function ({mount, check, variants, wait}) {
  /** Change the speaker the way Home Assistant does: a NEW state object, then hass again. */
  const update = async (t, state, attributes = {}) => {
    const current = t.hass.states[PLAYER];
    t.mock.replaceState(PLAYER, {
      ...current,
      state: state ?? current.state,
      attributes: {...current.attributes, ...attributes}
    });
    t.el.hass = t.hass;
    await t.settle();
  };
  const title = (t) => t.q('.ov-cover_art-title');
  const artist = (t) => t.q('.ov-cover_art-artist');
  const rect = (el) => el.getBoundingClientRect();

  // ---- card mode: the reference face ----
  let t = await mount(variants.ok);
  const scene = t.q('.ov-cover_art-scene');
  const img = t.q('.ov-cover_art-img');
  check(
    'the reference face: the cover, the title, the artist',
    !!img &&
      t.text('.ov-cover_art-title') === 'Questions' &&
      t.text('.ov-cover_art-artist') === 'Maisie Peters'
  );
  check(
    'the picture is the entity picture from this origin, decorative, decoded off the main thread',
    new URL(img.src).origin === location.origin &&
      new URL(img.src).pathname === ART_PATH &&
      img.getAttribute('alt') === '' &&
      img.getAttribute('decoding') === 'async' &&
      getComputedStyle(img).objectFit === 'cover'
  );
  check(
    'it is pure black with white type',
    getComputedStyle(scene).backgroundColor === 'rgb(0, 0, 0)' &&
      getComputedStyle(title(t)).color === 'rgb(255, 255, 255)'
  );
  check(
    'the title is semibold, the artist regular at 62% white on one line with an ellipsis',
    getComputedStyle(title(t)).fontWeight === '600' &&
      getComputedStyle(artist(t)).fontWeight === '400' &&
      getComputedStyle(artist(t)).color === 'rgba(255, 255, 255, 0.62)' &&
      getComputedStyle(artist(t)).whiteSpace === 'nowrap' &&
      getComputedStyle(artist(t)).textOverflow === 'ellipsis'
  );
  await t.hold('[data-action="info"]');
  check(
    'a hold on the card opens more-info of the speaker and calls no service',
    t.infos[0] === PLAYER && t.calls.length === 0
  );

  // ---- geometry: a big rounded square inset from the edges ----
  t = await mount(variants.ok);
  const box = rect(t.q('.ov-cover_art-scene'));
  const sq = rect(t.q('.ov-cover_art-frame'));
  const side = Math.min(box.width, box.height);
  check(
    'the art is a square, centred, 88.4% of the smaller side (the black frame is part of the look)',
    near(sq.width, sq.height, 0.5) &&
      near(sq.width, side * 0.884, 1) &&
      near(sq.left + sq.width / 2, box.left + box.width / 2, 1) &&
      near(sq.top + sq.height / 2, box.top + box.height / 2, 1)
  );
  check(
    'its corners are large: 12.5% of the side, on the frame, the picture and the scrim alike',
    ['.ov-cover_art-frame', '.ov-cover_art-img', '.ov-cover_art-scrim'].every((selector) =>
      near(px(getComputedStyle(t.q(selector)).borderTopLeftRadius), sq.width * 0.125, 1.5)
    )
  );
  check(
    'the picture fills the whole square',
    near(rect(t.q('.ov-cover_art-img')).width, sq.width, 0.5) &&
      near(rect(t.q('.ov-cover_art-img')).height, sq.height, 0.5)
  );
  const text = rect(t.q('.ov-cover_art-text'));
  check(
    'the text sits bottom left, 9% in from the left and the bottom of the square',
    near(text.left - sq.left, sq.width * 0.09, 1.5) &&
      near(sq.bottom - text.bottom, sq.height * 0.084, 1.5) &&
      text.right <= sq.right &&
      text.top >= sq.top
  );
  check(
    'the type scale: title about 5.8% of the square, artist about 3.8%',
    near(px(getComputedStyle(title(t)).fontSize) / sq.width, 0.059, 0.004) &&
      near(px(getComputedStyle(artist(t)).fontSize) / sq.width, 0.038, 0.004)
  );

  // ---- cheap to paint: one static gradient, nothing that blurs, filters or moves ----
  const painted = [t.q('.ov-cover_art-scene'), ...t.qa('.ov-cover_art-scene *')];
  check(
    'the scrim is a static linear gradient',
    getComputedStyle(t.q('.ov-cover_art-scrim')).backgroundImage.startsWith('linear-gradient(')
  );
  check(
    'no filter, backdrop-filter, animation or transition anywhere in the face',
    painted.every((el) => {
      const style = getComputedStyle(el);
      return (
        style.filter === 'none' &&
        (style.backdropFilter || 'none') === 'none' &&
        style.animationName === 'none' &&
        style.transitionDuration === '0s' &&
        style.textShadow === 'none' &&
        style.boxShadow === 'none'
      );
    })
  );

  // ---- paused, buffering ----
  t = await mount(variants.paused);
  check(
    'paused shows the same face',
    !!t.q('.ov-cover_art-img') && t.text('.ov-cover_art-title') === 'Questions'
  );
  t = await mount(variants.buffering);
  check(
    'so does buffering',
    !!t.q('.ov-cover_art-img') && t.text('.ov-cover_art-title') === 'Questions'
  );

  // ---- long text ----
  t = await mount(variants.longTitle);
  const lineHeight = px(getComputedStyle(title(t)).lineHeight);
  check(
    'a long title is clamped to two lines',
    near(rect(title(t)).height, lineHeight * 2, 1.5) &&
      title(t).scrollHeight > title(t).clientHeight
  );
  check(
    'and the text block never leaves the square, even with two lines',
    rect(t.q('.ov-cover_art-text')).top >= rect(t.q('.ov-cover_art-frame')).top
  );
  t = await mount(variants.longArtist);
  check(
    'a very long artist stays on one line, cut with an ellipsis',
    near(rect(artist(t)).height, px(getComputedStyle(artist(t)).lineHeight), 1.5) &&
      artist(t).scrollWidth > artist(t).clientWidth &&
      rect(artist(t)).right <= rect(t.q('.ov-cover_art-frame')).right
  );

  // ---- hostile text ----
  t = await mount(variants.hostile);
  check(
    'a hostile title and artist are text, never markup',
    t.text('.ov-cover_art-title') === '<img src=x onerror=alert(1)> & "quotes"' &&
      t.text('.ov-cover_art-artist') === '</p><b onclick="x()">Mallory</b>' &&
      t.qa('.ov-cover_art-scene img').length === 1 &&
      !t.q('.ov-cover_art-scene b') &&
      !t.q('.ov-cover_art-scene script')
  );

  // ---- artwork rules ----
  t = await mount(variants.noArt);
  check(
    'no artwork: a dark tile with a large music note (35% of the smaller side), and the text',
    !t.q('img') &&
      !!t.q('.ov-cover_art-tile ha-icon[icon="mdi:music-note"]') &&
      t.text('.ov-cover_art-title') === 'Questions' &&
      t.q('.ov-cover_art-tile ha-icon').getAttribute('style').includes('--ov-ca-note') &&
      getComputedStyle(t.q('.ov-cover_art-scene')).getPropertyValue('--ov-ca-note').trim() ===
        '35cqmin'
  );
  t = await mount(variants.foreignArt);
  check(
    'artwork from another origin is rejected: no <img>, the tile instead, and nothing was requested from it',
    !t.q('img') &&
      !!t.q('.ov-cover_art-tile') &&
      !performance
        .getEntriesByType('resource')
        .some((entry) => entry.name.includes('images.example.com'))
  );
  t = await mount(variants.remoteWithLocal);
  check(
    'a remote entity_picture falls back to the local proxy picture',
    new URL(t.q('.ov-cover_art-img')?.src ?? 'http://x/').pathname === ART_PATH
  );
  t = await mount(variants.noMetadata);
  check('a player with no metadata names itself', t.text('.ov-cover_art-title') === 'Living room');

  // ---- nothing playing ----
  for (const name of ['idle', 'off', 'unavailable', 'unknown', 'missing']) {
    t = await mount(variants[name]);
    check(
      `${name}: a calm black face that says "Nothing playing", no picture`,
      t.text('.ov-cover_art-empty') === 'Nothing playing' &&
        !t.q('img') &&
        !t.q('.ov-cover_art-frame') &&
        getComputedStyle(t.q('.ov-cover_art-scene')).backgroundColor === 'rgb(0, 0, 0)'
    );
  }

  // ---- the track changes: patched in place, nothing is rebuilt ----
  t = await mount(variants.ok);
  const [imgBefore, titleBefore, artistBefore, frameBefore] = [
    t.q('.ov-cover_art-img'),
    title(t),
    artist(t),
    t.q('.ov-cover_art-frame')
  ];
  await update(t, 'playing', {
    media_title: 'Better Place',
    media_artist: 'Gracie Abrams',
    entity_picture: `${ART_PATH}?token=abc123&cache=91be`
  });
  check(
    'a new track updates the texts and the picture URL',
    t.text('.ov-cover_art-title') === 'Better Place' &&
      t.text('.ov-cover_art-artist') === 'Gracie Abrams' &&
      t.q('.ov-cover_art-img').src.includes('cache=91be')
  );
  check(
    'in place: the same <img>, title, artist and frame elements (the old cover stays until the new one loads)',
    t.q('.ov-cover_art-img') === imgBefore &&
      title(t) === titleBefore &&
      artist(t) === artistBefore &&
      t.q('.ov-cover_art-frame') === frameBefore
  );
  await update(t, 'playing', {entity_picture: undefined});
  check(
    'a track without a picture swaps the <img> for the tile and keeps the text',
    !t.q('img') && !!t.q('.ov-cover_art-tile') && t.text('.ov-cover_art-title') === 'Better Place'
  );
  await update(t, 'playing', {entity_picture: `${ART_PATH}?token=abc123&cache=c0de`});
  check(
    'and a picture brings the <img> back',
    t.q('.ov-cover_art-img')?.src.includes('cache=c0de')
  );
  await update(t, 'idle');
  check(
    'when the speaker goes idle the card says "Nothing playing"',
    t.text('.ov-cover_art-empty') === 'Nothing playing'
  );
  check('none of this called a service', t.calls.length === 0);

  // ---- screensaver layer: the same face over the page ----
  t = await mount(variants.ok, {mode: 'screensaver'});
  check(
    'in the screensaver layer the scene is the same face, full screen',
    !!t.layer?.querySelector('.ov-cover_art-img') &&
      t.layer.querySelector('.ov-cover_art-title').textContent === 'Questions'
  );
  const layerBox = rect(t.layer);
  const layerFrame = rect(t.layer.querySelector('.ov-cover_art-frame'));
  check(
    'the square is the largest that fits the screen, centred, black bars either side',
    near(layerFrame.width, Math.min(layerBox.width, layerBox.height) * 0.884, 1) &&
      near(layerFrame.left + layerFrame.width / 2, layerBox.left + layerBox.width / 2, 1)
  );
  await update(t, 'playing', {media_title: 'Another one', media_artist: 'Someone Else'});
  check(
    'the layer follows a track change live',
    t.layer?.querySelector('.ov-cover_art-title').textContent === 'Another one' &&
      t.layer.querySelector('.ov-cover_art-artist').textContent === 'Someone Else'
  );
  await update(t, 'paused');
  check('pausing keeps the layer up', !!t.layer && t.layerState !== 'leaving');
  await update(t, 'buffering');
  check('and so does the gap between two tracks', !!t.layer && t.layerState !== 'leaving');
  await update(t, 'playing');
  check('playing again: still there', !!t.layer && t.layerState !== 'leaving');
  await update(t, 'idle');
  check(
    'a preview ignores autoWake: it stays up to be looked at, and says "Nothing playing"',
    !!t.layer && t.layerState !== 'leaving' && !!t.layer.querySelector('.ov-cover_art-empty')
  );

  t = await mount(variants.ok, {mode: 'screensaver'});
  await t.tap();
  await wait(400);
  check('the first tap dismisses it and calls no service', !t.layer && t.calls.length === 0);

  // ---- the standalone card ----
  t = await mount(variants.ok, {as: 'standalone'});
  check(
    'the standalone card draws the face too',
    !!t.q('.ov-cover_art-img') && t.text('.ov-cover_art-title') === 'Questions'
  );

  // ---- idle screensaver with a priority: weather is the default, the cover wins only while a speaker plays ----
  // The activation is asked for directly (idle.activate, as the zero-impact test does): the shared fake clock has no
  // spare seconds for a real idle timeout, and the pick (priority, eligible) happens at activation either way.
  const weather = {
    'weather.home': {
      state: 'sunny',
      attributes: {
        friendly_name: 'Home',
        temperature: 12,
        temperature_unit: '°C',
        supported_features: 3
      }
    }
  };
  const mixed = (name) => ({...variants[name], states: {...variants[name].states, ...weather}});
  const blocks = [
    {type: 'weather', entity: 'weather.home', idle_timeout: 5},
    {type: 'cover_art', entity: PLAYER}
  ];
  const activate = async (card) => {
    card.el._screensaver?.idle?.activate();
    await card.settle(50);
    return card.layer?.dataset.screensaver ?? null;
  };

  t = await mount(mixed('ok'), {mode: 'carousel', screensaver: blocks});
  check('nothing is on screen before the idle time is up', !t.layer);
  check(
    'a playing speaker with art wins over weather (priority 10 over 0)',
    (await activate(t)) === 'cover_art'
  );
  check(
    'it shows the cover and called no service',
    !!t.layer?.querySelector('.ov-cover_art-img') && t.calls.length === 0
  );
  await update(t, 'idle');
  check(
    'when the speaker stops the layer goes at once (no tap swallow)',
    t.layerState === 'leaving' || !t.layer
  );
  await wait(400);
  check('the speaker stopping dismisses it, and it is gone', !t.layer);
  for (const state of ['off', 'standby', 'unavailable']) {
    await update(t, 'playing');
    await activate(t);
    await update(t, state);
    await wait(400);
    check(`${state} dismisses it too`, !t.layer);
  }
  await update(t, 'paused');
  check(
    'a paused speaker is not eligible: weather is the screensaver',
    (await activate(t)) === 'weather'
  );
  await t.tap();
  await wait(400);
  await update(t, 'playing', {entity_picture: undefined});
  check('playing without artwork is not eligible either', (await activate(t)) === 'weather');
  await t.tap();
  await wait(400);
  await update(t, 'playing', {entity_picture: 'https://images.example.com/cover.jpg'});
  check('nor is playing with a foreign picture', (await activate(t)) === 'weather');
  await t.tap();
  await wait(400);
  await update(t, 'playing', {entity_picture: `${ART_PATH}?token=abc123&cache=7f3a`});
  check('and a playing speaker with art wins again', (await activate(t)) === 'cover_art');

  // only cover art configured, and the speaker is not eligible: nothing is shown at all
  t = await mount(variants.paused, {
    mode: 'carousel',
    screensaver: {type: 'cover_art', entity: PLAYER}
  });
  check(
    'with only cover art configured, a paused speaker shows nothing',
    (await activate(t)) === null
  );

  // a speaker the user never listed: music_screensaver adds an implicit entry for each media_player widget
  t = await mount(mixed('ok'), {mode: 'carousel'});
  t.el.setConfig({
    preview_time: '2026-10-15T10:09:00+01:00',
    cards: [{type: 'custom:houseview-media_player-card', entity: PLAYER}],
    screensaver: {type: 'weather', entity: 'weather.home', idle_timeout: 5}
  });
  t.el.hass = t.hass;
  await t.settle();
  check(
    'a media_player widget makes its speaker an implicit entry: no cover_art block needed',
    (await activate(t)) === 'cover_art'
  );
}
