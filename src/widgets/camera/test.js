// Browser behaviour test (docs/widget-api.md). Runs against dist/houseview.js with a recording mock hass.
// The carousel (`as: 'card'`) is used for gallery tests because the gallery is a card-level overlay.
const GALLERY_ERROR = 'Camera view needs one to four camera entities.';

const keydown = (target, key) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', {key, bubbles: true, composed: true, cancelable: true})
  );

const hasGalleryOpen = (t) => !!t.q('.camera-gallery');

export default async function ({mount, check, variants, advance, settle}) {
  // ---- the tile -------------------------------------------------------------------------------------------------
  let t = await mount(variants.ok);
  check(
    'camera tile shows the label and a status line',
    t.text('.camera-label') === 'Front door' && t.text('.camera-status') !== null
  );
  check(
    'without a gallery the tile opens more-info',
    !!t.q('button.camera[data-action="info"]') && !t.q('[data-action="camera-grid"]')
  );
  await t.click('info');
  check('pressing the tile asks for more-info of its own camera', t.infos.join() === 'camera.test');

  const img = t.q('.camera img');
  const first = img && new URL(img.src);
  check(
    'a same-origin camera picture gets an img with a 30 s refresh bucket',
    !!img &&
      first.pathname === '/api/camera_proxy/camera.test' &&
      first.searchParams.get('token') === 'abc123' &&
      first.searchParams.has('hv_refresh')
  );
  advance(31000);
  await settle();
  const second = t.q('.camera img') && new URL(t.q('.camera img').src);
  check(
    'the 30 s tick requests a fresh snapshot and keeps the same img',
    !!second &&
      t.q('.camera img') === img &&
      second.searchParams.get('hv_refresh') !== first.searchParams.get('hv_refresh')
  );

  t = await mount(variants.loads);
  await settle(200);
  check(
    'a loaded snapshot marks the tile and clears the status',
    !!t.q('.camera.has-image') && t.text('.camera-status') === ''
  );
  await t.setState('camera.test', {
    attributes: {entity_picture: '/camera_proxy/preview.svg?token=u'}
  });
  check('a state update keeps the picture element', t.qa('.camera img').length === 1);
  await t.setState('camera.test', {attributes: {entity_picture: undefined}});
  check(
    'a camera without a picture drops the img and shows the fallback text',
    !t.q('.camera img') &&
      !t.q('.camera.has-image') &&
      t.text('.camera-status') === 'Snapshot unavailable'
  );

  for (const name of ['noPicture', 'foreignPicture', 'notProxyPicture']) {
    t = await mount(variants[name]);
    check(`${name}: no img is created`, !t.q('.camera img'));
  }

  t = await mount(variants.named);
  check(
    'a hostile name stays text',
    t.text('.camera-label') === 'Drive & <b>Gate</b>' && !t.q('.camera-label b')
  );
  t = await mount(variants.unnamed);
  check('an unnamed camera is called "camera"', t.text('.camera-label') === 'camera');

  for (const name of ['unavailable', 'missing', 'unknown']) {
    t = await mount(variants[name]);
    check(`${name} camera is disabled`, t.q('button.camera').disabled);
  }

  // ---- the gallery ----------------------------------------------------------------------------------------------
  t = await mount(variants.withGallery, {as: 'card'});
  check(
    'a configured gallery makes the tile open the camera grid',
    !!t.q('button.camera[data-action="camera-grid"]') && !t.q('.camera-gallery')
  );
  check('the card exposes the gallery as closed', t.card._galleryOpen === false);
  await t.click('camera-grid');
  const dialog = t.q('.camera-gallery');
  check(
    'camera-grid opens an accessible dialog',
    !!dialog &&
      dialog.getAttribute('role') === 'dialog' &&
      dialog.getAttribute('aria-modal') === 'true' &&
      dialog.getAttribute('aria-label') === 'Camera view'
  );
  check('the shell hides the face while the gallery is open', !!t.q('.shell.camera-view-open'));
  check('the compat flag follows', t.card._galleryOpen === true && t.card._galleryCamera === null);
  check(
    'the grid shows four cameras with a Cameras heading and a Back button',
    t.qa('.gallery-camera').length === 4 &&
      t.text('.camera-gallery header strong') === 'Cameras' &&
      t.text('.gallery-back span') === 'Back' &&
      !t.q('.camera-gallery-grid.single')
  );
  check('focus moves to the back button', t.root.activeElement?.dataset.action === 'camera-back');
  check(
    'each camera tile has a streamless picture with a 5 s bucket',
    t.qa('.gallery-camera img').length === 4 &&
      t.qa('.gallery-camera img').every((i) => new URL(i.src).searchParams.has('hv_refresh'))
  );
  check(
    'camera names come from the entities and the aria label says Expand',
    t.text('[data-camera-entity="camera.porch"] .gallery-camera-name') === 'Porch camera' &&
      t.q('[data-camera-entity="camera.porch"]').getAttribute('aria-label') ===
        'Expand Porch camera'
  );
  check(
    'slots place the cameras in the 2 x 2 grid',
    t.q('[data-camera-entity="camera.garden"]').style.gridColumn === '1' &&
      t.q('[data-camera-entity="camera.garden"]').style.gridRow === '2' &&
      t.q('[data-camera-entity="camera.garage"]').style.gridColumn === '2'
  );

  await t.click('camera-focus', 'camera.porch');
  check(
    'camera-focus shows one camera, larger',
    t.qa('.gallery-camera').length === 1 &&
      !!t.q('.camera-gallery-grid.single') &&
      t.text('.camera-gallery header strong') === 'Camera' &&
      t.text('.gallery-back span') === 'All cameras' &&
      t.card._galleryCamera === 'camera.porch'
  );
  await t.click('camera-back');
  check(
    'Back from a focused camera returns to the grid',
    t.qa('.gallery-camera').length === 4 && t.card._galleryCamera === null && hasGalleryOpen(t)
  );
  await t.act('camera-focus', 'camera.nothere');
  check(
    'focusing a camera that is not in the gallery is ignored',
    t.qa('.gallery-camera').length === 4
  );

  await t.click('camera-back');
  check(
    'Back from the grid closes the gallery and focuses the tile',
    !hasGalleryOpen(t) &&
      !t.q('.shell.camera-view-open') &&
      t.card._galleryOpen === false &&
      t.root.activeElement?.dataset.action === 'camera-grid'
  );
  await t.act('camera-focus', 'camera.porch');
  check('camera-focus does nothing while the gallery is closed', !hasGalleryOpen(t));

  await t.click('camera-grid');
  await t.click('camera-focus', 'camera.test');
  keydown(t.q('.camera-gallery'), 'Escape');
  await settle();
  check(
    'Escape steps back from a focused camera',
    hasGalleryOpen(t) && t.qa('.gallery-camera').length === 4
  );
  keydown(t.q('.camera-gallery'), 'Escape');
  await settle();
  check('Escape closes the grid', !hasGalleryOpen(t));
  t.card._galleryOpen = true;
  t.card._render();
  check('the compat flag opens the gallery', hasGalleryOpen(t));
  t.card._galleryOpen = false;
  t.card._render();
  check('and closes it', !hasGalleryOpen(t) && !t.qa('.gallery-camera img').length);

  t = await mount(variants.galleryOffline, {as: 'card'});
  check(
    'an offline camera keeps its tile usable when a gallery exists',
    !t.q('button.camera').disabled && t.q('button.camera').dataset.action === 'camera-grid'
  );
  await t.click('camera-grid');
  check(
    'an offline gallery camera says Unavailable and has no picture',
    t.text('[data-camera-entity="camera.test"] .gallery-camera-status') === 'Unavailable' &&
      !t.q('[data-camera-entity="camera.test"] img') &&
      !!t.q('[data-camera-entity="camera.porch"] img')
  );
  await t.setState('camera.test', {
    state: 'idle',
    attributes: {entity_picture: '/api/camera_proxy/camera.test?token=z'}
  });
  check(
    'a camera that comes back gets its picture on the next refresh',
    !!t.q('[data-camera-entity="camera.test"] img')
  );

  t = await mount(variants.galleryMixed, {as: 'card'});
  await t.click('camera-grid');
  check(
    'a gallery name is escaped and slot gaps stay gaps',
    t.text('[data-camera-entity="camera.test"] .gallery-camera-name') === 'Door <b>1</b>' &&
      !t.q('.gallery-camera-name b') &&
      t.q('[data-camera-entity="camera.porch"]').style.gridColumn === '2' &&
      t.q('[data-camera-entity="camera.porch"]').style.gridRow === '2'
  );
  check(
    'a streaming camera uses the stream URL and no refresh bucket',
    new URL(t.q('[data-camera-entity="camera.porch"] img').src).pathname.includes(
      '/camera_proxy_stream/'
    ) && !new URL(t.q('[data-camera-entity="camera.porch"] img').src).searchParams.has('hv_refresh')
  );

  t = await mount(variants.gallerySingle, {as: 'card'});
  await t.click('camera-grid');
  check(
    'one configured camera fills the grid',
    !!t.q('.camera-gallery-grid.single') && !t.q('.gallery-camera').style.gridColumn
  );

  t = await mount(variants.withGallery, {as: 'card'});
  await t.click('camera-grid');
  const pageBefore = t.card._pageIndex || 0;
  keydown(t.q('.camera-gallery'), 'ArrowRight');
  check('arrow keys do not turn pages behind the gallery', (t.card._pageIndex || 0) === pageBefore);

  // ---- configuration --------------------------------------------------------------------------------------------
  const rejects = (gallery) => {
    const card = document.createElement('houseview-card');
    try {
      card.setConfig({widgets: [{type: 'camera', entity: 'camera.test'}], camera_gallery: gallery});
      return null;
    } catch (error) {
      return error.message;
    }
  };
  check(
    'five cameras are rejected',
    rejects(Array.from({length: 5}, (_, i) => ({entity: `camera.c${i}`}))) === GALLERY_ERROR
  );
  check('an empty gallery is rejected', rejects([]) === GALLERY_ERROR);
  check('a non-camera entity is rejected', rejects([{entity: 'light.hall'}]) === GALLERY_ERROR);
  check(
    'a gallery that is not a list is rejected',
    rejects({entity: 'camera.a'}) === GALLERY_ERROR
  );
  check(
    'one to four cameras are accepted',
    rejects([{entity: 'camera.a'}, {entity: 'camera.b'}]) === null
  );

  const card = document.createElement('houseview-card');
  try {
    card.setConfig({widgets: [{type: 'camera', entity: 'light.hall'}]});
    check('a camera widget needs a camera entity', false);
  } catch (error) {
    check(
      'a camera widget needs a camera entity',
      error.message === 'camera widget needs a camera entity.'
    );
  }
}
