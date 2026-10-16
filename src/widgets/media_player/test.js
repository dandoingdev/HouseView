// Browser behaviour test (docs/widget-api.md). Runs against dist/houseview.js with a recording mock hass.
const ENTITY = 'media_player.test';

export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'music card shows title and artist over the cover, and the speaker name for screen readers',
    t.text('.mc-title') === 'Blue in Green' &&
      t.text('.mc-artist') === 'Miles Davis' &&
      t.text('.mc-top > .sr') === 'Kitchen speaker' &&
      !t.q('.mc-source') &&
      !!t.q('.mc-cover .mc-meta')
  );
  check('volume level is shown as a percentage', t.text('.mc-volume-value') === '40%');
  check('a playing player shows the pause icon', !!t.q('.play ha-icon[icon="mdi:pause"]'));
  check(
    'without artwork a music-note icon is shown',
    !!t.q('.music-art ha-icon[icon="mdi:music-note"]')
  );
  check(
    'transport and volume buttons are in render order',
    t
      .qa('.mc-transport button')
      .map((b) => b.dataset.action)
      .join() === 'media-player-shuffle,media-prev,media,media-next,media-player-repeat' &&
      t
        .qa('.mc-volume')
        .map((b) => b.dataset.action)
        .join() === 'media-player-volume-view'
  );

  await t.click('media');
  check(
    'play/pause on a playing player calls media_play_pause',
    t.calls.length === 1 &&
      t.calls[0].d === 'media_player' &&
      t.calls[0].s === 'media_play_pause' &&
      t.calls[0].data.entity_id === ENTITY
  );

  t = await mount(variants.paused);
  check('a paused player shows the play icon', !!t.q('.play ha-icon[icon="mdi:play"]'));
  await t.click('media');
  check('play/pause on a paused player calls the service', t.calls.length === 1);

  t = await mount(variants.idlePlayable);
  await t.click('media');
  check(
    'an idle speaker with PLAY support resumes its queue',
    t.calls[0]?.s === 'media_play' && t.calls[0]?.data.entity_id === ENTITY && t.infos.length === 0
  );
  t = await mount(variants.ok);
  await t.hold('.mc-details');
  check(
    'holding track information opens speaker controls',
    t.infos.includes(ENTITY) && t.calls.length === 0
  );
  for (const variant of ['idle', 'off']) {
    t = await mount(variants[variant]);
    await t.click('media');
    check(
      `play/pause on a ${variant} player opens more-info instead`,
      t.calls.length === 0 && t.infos.includes(ENTITY)
    );
  }

  t = await mount(variants.ok);
  // t.click resets t.calls first, so read the calls after each press.
  await t.click('media-prev');
  const previous = [...t.calls];
  await t.click('media-next');
  const next = [...t.calls];
  check(
    'previous and next call their services',
    previous.length === 1 &&
      next.length === 1 &&
      previous[0].s === 'media_previous_track' &&
      next[0].s === 'media_next_track' &&
      [...previous, ...next].every((c) => c.d === 'media_player' && c.data.entity_id === ENTITY)
  );

  t = await mount(variants.ok);
  await t.act('volume-up', ENTITY);
  check(
    'volume up moves 5 points',
    t.calls.length === 1 &&
      t.calls[0].s === 'volume_set' &&
      Math.abs(t.calls[0].data.volume_level - 0.45) < 1e-9 &&
      Object.keys(t.calls[0].data).sort().join() === 'entity_id,volume_level'
  );
  t = await mount(variants.ok);
  await t.act('volume-down', ENTITY);
  check('volume down moves 5 points', Math.abs(t.calls[0].data.volume_level - 0.35) < 1e-9);

  t = await mount(variants.volumeHigh);
  await t.act('volume-up', ENTITY);
  check('volume is clamped at 1', t.calls[0].data.volume_level === 1);
  t = await mount(variants.volumeZero);
  await t.act('volume-down', ENTITY);
  check('volume is clamped at 0', t.calls[0].data.volume_level === 0);

  t = await mount(variants.volumeFraction);
  check('volume percentage is rounded', t.text('.mc-volume-value') === '56%');

  t = await mount(variants.noVolume);
  check('no volume level shows a dash', t.text('.mc-volume-value') === '—');
  check(
    'volume button is disabled without the volume bit; prev and next stay enabled',
    t.q('[data-action="media-player-volume-view"]').disabled &&
      !t.q('[data-action="media-prev"]').disabled &&
      !t.q('[data-action="media-next"]').disabled
  );

  t = await mount(variants.prevOnly);
  check(
    'only the advertised transport key is enabled',
    !t.q('[data-action="media-prev"]').disabled && t.q('[data-action="media-next"]').disabled
  );
  t = await mount(variants.noFeatures);
  check(
    'no features disables prev, next and volume but not play/pause',
    t.q('[data-action="media-prev"]').disabled &&
      t.q('[data-action="media-next"]').disabled &&
      t.q('[data-action="media-player-volume-view"]').disabled &&
      !t.q('[data-action="media"]').disabled
  );

  t = await mount(variants.ok);
  await t.hold('[data-action="info"]');
  check(
    'holding speaker options opens more-info',
    t.infos.includes(ENTITY) && t.calls.length === 0
  );

  t = await mount(variants.artwork);
  const img = t.q('.music-art img');
  check(
    'proxy artwork on this origin is shown',
    !!img &&
      img.getAttribute('alt') === 'Album artwork' &&
      img.src.includes('/api/media_player_proxy/')
  );
  for (const variant of ['artworkForeign', 'artworkOtherPath']) {
    t = await mount(variants[variant]);
    check(`${variant} artwork is rejected`, !t.q('.music-art img') && !!t.q('.music-art ha-icon'));
  }

  t = await mount(variants.named);
  check(
    'text is escaped',
    t.text('.mc-title') === 'A & <b>B</b>' &&
      t.text('.mc-artist') === '<i>Artist</i>' &&
      !t.q('.mc-meta b') &&
      !t.q('.mc-top script')
  );

  t = await mount(variants.idle);
  check(
    'idle player shows the placeholder title and raw state',
    t.text('.mc-title') === 'Ready to play' && t.text('.mc-artist') === 'idle'
  );

  t = await mount(variants.unavailable);
  await t.act('media', ENTITY);
  await t.act('volume-up', ENTITY);
  check(
    'unavailable speaker is labelled, disabled and issues no action',
    t.calls.length === 0 &&
      t.infos.length === 0 &&
      t.text('.mc-title') === 'Speaker unavailable' &&
      t.text('.mc-artist') === 'Unavailable' &&
      t.qa('.face button:not(:disabled)').length === 0
  );

  t = await mount(variants.missing);
  await t.act('media-next', ENTITY);
  check('missing speaker issues no action', t.calls.length === 0);

  // ---- progress, shuffle and repeat ----
  t = await mount(variants.progress);
  check(
    'progress shows elapsed and remaining time and a filled bar',
    t.text('.mc-elapsed') === '1:35' &&
      t.text('.mc-remaining') === '-0:59' &&
      t.q('.mc-fill').style.transform.startsWith('scaleX(0.61') &&
      t.q('.mc-progress').getAttribute('role') === 'progressbar'
  );
  t = await mount(variants.ok);
  check(
    'a player without a duration shows an empty, hidden progress row',
    t.text('.mc-elapsed') === '' && t.q('.mc-progress').getAttribute('aria-hidden') === 'true'
  );

  t = await mount(variants.seekable);
  check(
    'seekable tracks expose a native labelled range',
    !t.q('.mc-seek').disabled &&
      t.q('.mc-seek').max === '200' &&
      t.q('.mc-seek').getAttribute('aria-label') === 'Track position'
  );
  await t.act('media-player-seek-90', ENTITY);
  check(
    'seeking uses media_seek with an absolute position in seconds',
    t.calls.length === 1 && t.calls[0].s === 'media_seek' && t.calls[0].data.seek_position === 90
  );
  for (const position of ['-1', '201', 'NaN', '1.5']) {
    await t.act(`media-player-seek-${position}`, ENTITY);
    check(`invalid seek ${position} is ignored`, t.calls.length === 0);
  }
  t = await mount(variants.liveSeek);
  await t.act('media-player-seek-30', ENTITY);
  check(
    'live streams with no duration cannot seek',
    t.q('.mc-seek').disabled && t.calls.length === 0
  );
  t = await mount(variants.progress);
  await t.act('media-player-seek-30', ENTITY);
  check(
    'known durations without SEEK remain read-only',
    t.q('.mc-seek').disabled && t.calls.length === 0
  );

  t = await mount(variants.shuffleRepeat);
  check(
    'shuffle and repeat show their state',
    t.q('[data-action="media-player-shuffle"]').getAttribute('aria-pressed') === 'true' &&
      !!t.q('[data-action="media-player-repeat"] ha-icon[icon="mdi:repeat"]')
  );
  await t.click('media-player-shuffle');
  check(
    'shuffle toggles through shuffle_set',
    t.calls.length === 1 &&
      t.calls[0].s === 'shuffle_set' &&
      t.calls[0].data.shuffle === false &&
      t.calls[0].data.entity_id === ENTITY
  );
  await t.click('media-player-repeat');
  check(
    'repeat cycles off -> all -> one',
    t.calls.length === 1 && t.calls[0].s === 'repeat_set' && t.calls[0].data.repeat === 'one'
  );
  t = await mount(variants.ok);
  check(
    'shuffle and repeat are disabled without the feature bits',
    t.q('[data-action="media-player-shuffle"]').disabled &&
      t.q('[data-action="media-player-repeat"]').disabled
  );
}
