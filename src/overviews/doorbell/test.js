// Browser behaviour tests (tests/overviews/harness.js, against dist/houseview.js with a recording mock hass).
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'the card is the camera stream with its name',
    t.q('.ov-doorbell-img')?.dataset.path === '/api/camera_proxy_stream/camera.front_door' &&
      t.text('.ov-doorbell-name') === 'Front door'
  );
  check(
    'a tap opens the full-screen view, not more-info',
    !!t.q('.ov-tap[data-action="overview-open"]') && t.infos.length === 0
  );

  t = await mount(variants.noCamera);
  check(
    'without a camera the card says so',
    t.text('.ov-doorbell-note') === 'Choose a camera' &&
      t.q('.ov-doorbell-scene').dataset.state === 'empty'
  );
}
