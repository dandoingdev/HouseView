export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'volume label and percentage follow the speaker',
    t.text('.ov-volume-value') === '40' &&
      t.q('.ov-volume-input').getAttribute('aria-label') === 'Volume'
  );
  check(
    'mute key is offered for supported speakers',
    !!t.q('[data-action="media-player-volume-mute"]')
  );
  t = await mount(variants.muted);
  check(
    'muted state offers unmute and a visible caption',
    t.text('.ov-volume-muted') === 'Muted' &&
      t.q('[data-action="media-player-volume-mute"]').getAttribute('aria-label') ===
        'Unmute speaker'
  );
  for (const kind of ['noVolume', 'unavailable', 'missing']) {
    t = await mount(variants[kind]);
    check(`${kind} cannot adjust`, t.q('.ov-volume-input').disabled);
    await t.card._act('media-player-volume-set-50', 'media_player.test');
    check(`${kind} sends no volume command`, t.calls.length === 0);
  }
}
