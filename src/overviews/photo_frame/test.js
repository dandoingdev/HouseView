// Browser behaviour tests (tests/overviews/harness.js, against dist/houseview.js with a recording mock hass).
const FOLDER = 'media-source://media_source/local/Photos';
const photos = ['a', 'b', 'c'].map((n) => ({
  title: `${n}.jpg`,
  media_class: 'image',
  media_content_id: `${FOLDER}/${n}.jpg`
}));

export default async function ({mount, check, variants, wait, advance}) {
  // ---- no folder: a calm line, no requests ----
  let t = await mount(variants.noFolder);
  check(
    'without a folder the card says so',
    t.text('.ov-photo-note') === 'Choose a photo folder' &&
      t.q('.ov-photo-frame').dataset.state === 'empty'
  );

  // ---- card mode with a fake media library ----
  const asked = [];
  t = await mount(variants.ok);
  t.hass.callWS = async (message) => {
    asked.push(message.type);
    if (message.type === 'media_source/browse_media') return {children: photos};
    return {url: '/api/media_player_proxy/media_player.photo?token=1'};
  };
  t.el.hass = t.hass;
  await t.settle();
  await advance(1000); // the tick starts the load
  await wait(300);
  check(
    'the folder is listed and one photo is loaded through resolve_media',
    asked.includes('media_source/browse_media') && asked.includes('media_source/resolve_media')
  );
  check(
    'the card is a photo: no clock, no text',
    !!t.q('.ov-photo-img') && !t.q('.ov-photo-clock') && !t.calls.length
  );
  check(
    'a tap opens the full-screen view, not more-info',
    !!t.q('.ov-tap[data-action="overview-open"]') && t.infos.length === 0
  );
}
