// Browser behaviour tests (tests/overviews/harness.js, against dist/houseview.js with a recording mock hass).
// The home overview is built from the carousel's own widgets, so these tests mount a real carousel with `bare: true`:
// the home overview on a page of its own and every other widget on a page of its own (page index = position).
const HOME = {type: 'custom:houseview-home-overview-card', page: 'Home'};
const card = (kind, entity, extra = {}) => ({
  type: `custom:houseview-${kind}-card`,
  entity,
  page: `${kind} ${entity.split('.')[1]}`,
  ...extra
});
const CARDS = {
  climate: card('climate', 'climate.living_room'),
  light: card('light', 'light.kitchen'),
  light2: card('light', 'light.hall'),
  lock: card('lock', 'lock.front_door'),
  media: card('media_player', 'media_player.kitchen_speaker'),
  camera: card('camera', 'camera.front_door', {name: 'Front door'}),
  scene: card('action', 'scene.evening'),
  script: card('action', 'script.good_night')
};
const pagesFor = (cards) => ({
  pages: [{name: 'Home'}, ...cards.map((c) => ({name: c.page}))]
});

export default async function ({mount, check, variants}) {
  const open = (list, extra = {}, opts = {}) =>
    mount(variants.ok, {
      mode: 'carousel',
      bare: true,
      width: 900,
      height: 640,
      cards: [HOME, ...list],
      config: {...pagesFor(list), ...extra},
      ...opts
    });
  const everything = Object.values(CARDS);
  const chipKeys = (t) => t.qa('.ov-home-chip').map((c) => c.dataset.tone);
  const page = (t) => Number(t.q('.page-dot.selected')?.dataset.page);

  // ---- chips exist only for the kinds the carousel has ----
  let t = await open([CARDS.light, CARDS.light2]);
  check(
    'only lights: one yellow chip, no camera or scene section',
    chipKeys(t).join() === 'yellow' && !t.q('.ov-home-cameras') && !t.q('.ov-home-scenes')
  );
  t = await open(everything);
  check(
    'every kind: climate, lights, locks and media chips in that order',
    chipKeys(t).join() === 'cyan,yellow,teal,grey'
  );
  const values = t.qa('.ov-home-chip').map((c) => c.textContent.trim());
  check(
    'counts: the temperature range, two lights on of two, one lock locked, no number for media',
    values.join('|') === '20°|2|1|',
    values.join('|')
  );

  // ---- chips jump to the page of the first widget of their kind ----
  check('the home page is shown first', page(t) === 0 && !!t.q('.ov-home-scene'));
  await t.click('goto-widget', 'widget:2');
  check(
    'the lights chip goes to the page of the first light widget',
    page(t) === 2 && t.calls.length === 0,
    `page ${page(t)}`
  );
  t.q('[data-action="page-select"][data-page="0"]').click();
  await t.settle();
  await t.click('goto-widget', 'widget:1');
  check('the climate chip goes to the climate page', page(t) === 1);
  t.q('[data-action="page-select"][data-page="0"]').click();
  await t.settle();
  await t.click('goto-widget', 'widget:5');
  check('the media chip goes to the media player page', page(t) === 5);
  t.q('[data-action="page-select"][data-page="0"]').click();
  await t.settle();
  await t.click('goto-widget', 'widget:6');
  check('the Cameras heading goes to the first camera page', page(t) === 6);
  t.q('[data-action="page-select"][data-page="0"]').click();
  await t.settle();
  t.card._act('goto-widget', 'widget:99');
  await t.settle();
  check('an unknown widget index does nothing', page(t) === 0);

  // ---- a lock that is open turns its chip amber ----
  t = await open(everything);
  t.mock.replaceState('lock.front_door', {
    ...t.hass.states['lock.front_door'],
    state: 'unlocked'
  });
  t.el.hass = t.hass;
  await t.settle();
  check(
    'an unlocked lock: the amber chip counts it',
    chipKeys(t).includes('amber') && !chipKeys(t).includes('teal')
  );

  // ---- cameras: same-origin snapshot, a label from last_updated, the gallery or more-info ----
  t = await open(everything);
  const snap = t.q('.ov-home-snap');
  check(
    'the camera shows a same-origin /camera_proxy/ snapshot with the refresh bucket',
    !!snap &&
      new URL(snap.src).origin === location.origin &&
      new URL(snap.src).pathname.includes('/camera_proxy/') &&
      new URL(snap.src).searchParams.has('hv_refresh')
  );
  check(
    'the label says how long ago (two minutes)',
    /2\s?m/.test(t.text('.ov-home-ago')),
    t.text('.ov-home-ago')
  );
  await t.click('camera-grid', 'camera.front_door');
  check(
    'without camera_gallery a press opens more-info of the camera',
    t.infos.join() === 'camera.front_door' && !t.q('.camera-gallery')
  );
  t = await open(everything, {camera_gallery: [{entity: 'camera.front_door'}]});
  await t.click('camera-grid', 'camera.front_door');
  check(
    'with camera_gallery a press opens the gallery',
    !!t.q('.camera-gallery') && t.infos.length === 0 && t.calls.length === 0
  );

  // ---- scenes run through the card, exactly once; scripts are not listed ----
  t = await open(everything);
  check(
    'scenes are tiles; a script is not listed',
    t.qa('.ov-home-tile').length === 1 && !t.q('[data-entity="script.good_night"]')
  );
  await t.click('run-action', 'scene.evening');
  const turned = t.calls.filter((c) => c.d === 'scene' && c.s === 'turn_on');
  check(
    'pressing a scene calls scene.turn_on exactly once',
    turned.length === 1 && t.calls.length === 1 && turned[0].data?.entity_id === 'scene.evening',
    JSON.stringify(t.calls)
  );

  // ---- the markup holds no inline service call and the scroll container exists ----
  const html = t.q('.ov-home-scene').outerHTML;
  check(
    'no inline handlers or service text in the markup',
    !/\son\w+=|callService|javascript:/i.test(html)
  );
  const scroll = t.q('.ov-home-scroll');
  const style = getComputedStyle(scroll);
  check(
    'a vertical scroll container',
    style.overflowY === 'auto' && style.overscrollBehaviorY === 'contain'
  );

  // ---- hostile names are escaped ----
  const hostile = '<img src=x onerror=alert(1)>"\'&';
  t = await mount(
    {
      ...variants.ok,
      states: {
        ...variants.ok.states,
        'scene.evening': {state: 'unknown', attributes: {friendly_name: hostile}},
        'camera.front_door': {
          ...variants.ok.states['camera.front_door'],
          attributes: {
            friendly_name: hostile,
            entity_picture: '/api/camera_proxy/camera.front_door?token=t'
          }
        }
      }
    },
    {
      mode: 'carousel',
      bare: true,
      width: 900,
      height: 640,
      cards: [HOME, card('action', 'scene.evening'), card('camera', 'camera.front_door')],
      config: pagesFor([card('action', 'scene.evening'), card('camera', 'camera.front_door')])
    }
  );
  check(
    'a hostile scene or camera name is text, not markup',
    t.text('.ov-home-tile-name') === hostile &&
      !t.q('.ov-home-scene img[onerror]') &&
      t.qa('.ov-home-scene img').length === 1
  );

  // ---- no widgets: a calm line, no buttons, nothing happens ----
  // (The minute tick is tested in tests/unit/home-model.test.mjs: this harness' fake clock is shared with the timer's test and
  // must not move.)
  t = await open([]);
  check(
    'nothing to show: one calm line and no buttons',
    /Add lights, climate/.test(t.text('.ov-home-empty')) &&
      !t.q('.ov-home-scene button') &&
      t.calls.length === 0
  );

  // ---- as a screensaver it renders without buttons ----
  t = await mount(variants.ok, {
    mode: 'screensaver',
    bare: true,
    cards: [CARDS.light, CARDS.scene]
  });
  check(
    'the screensaver shows the screen and no buttons',
    !!t.layer?.querySelector('.ov-home-scene') && !t.layer.querySelector('.ov-home-scene button')
  );
}
