// Browser behaviour tests (tests/overviews/harness.js, against dist/houseview.js with a recording mock hass).
const ENTITY = 'vacuum.robot';

const only = (t, service, data) =>
  t.calls.length === 1 &&
  t.calls[0].d === 'vacuum' &&
  t.calls[0].s === service &&
  Object.entries(data).every(([k, v]) => t.calls[0].data[k] === v);

const labels = (t) =>
  [...t.qa('.ov-vacuum-command-label')].map((el) => el.textContent.trim()).join(' ');

export default async function ({mount, check, variants, wait}) {
  const update = async (t, patch) => {
    const current = t.hass.states[ENTITY];
    t.mock.replaceState(ENTITY, {
      ...current,
      ...patch,
      attributes: {...current.attributes, ...(patch.attributes || {})}
    });
    t.el.hass = t.hass;
    await t.settle();
  };

  let t = await mount(variants.ok, {width: 480, height: 480});
  check(
    'cleaning: Robot, Cleaning, 72% battery, Balanced, and the command keys',
    t.text('.ov-vacuum-title') === 'Robot' &&
      t.text('.ov-vacuum-status') === 'Cleaning' &&
      t.text('.ov-vacuum-battery-fig') === '72%' &&
      t.text('.ov-vacuum-fan-fig') === 'Balanced' &&
      labels(t) === 'Start Pause Stop Dock Spot Find' &&
      t.q('.ov-vacuum-scene').dataset.mood === 'cleaning' &&
      !t.q('.ov-vacuum-detail')
  );
  check(
    'cleaning is teal',
    getComputedStyle(t.q('.ov-vacuum-scene')).backgroundColor === 'rgb(14, 124, 116)'
  );
  check(
    'a card has the keys and details, and no close key or full-card overlay',
    !!t.q('[data-action="info"]') &&
      !t.q('[data-action="overview-close"]') &&
      !t.q('.ov-tap') &&
      t.q('[data-action="vacuum-start"]').disabled &&
      !t.q('[data-action="vacuum-pause"]').disabled &&
      !t.q('[data-action="vacuum-stop"]').disabled &&
      !t.q('[data-action="vacuum-return"]').disabled &&
      t.q('[data-action="vacuum-spot"]').disabled &&
      !t.q('[data-action="vacuum-locate"]').disabled
  );
  check(
    'the current fan speed is pressed and the others are not',
    t.q('[data-action="vacuum-fan-1"]').getAttribute('aria-pressed') === 'true' &&
      t.q('[data-action="vacuum-fan-0"]').getAttribute('aria-pressed') === 'false' &&
      t.qa('.ov-vacuum-speed').length === 3
  );
  check(
    'every key names the vacuum',
    t.qa('.ov-vacuum-scene button').every((b) => b.dataset.entity === ENTITY)
  );
  {
    const scene = t.q('.ov-vacuum-scene').getBoundingClientRect();
    const overflow = [...t.qa('.ov-vacuum-command, .ov-vacuum-speed')]
      .filter((button) => {
        const box = button.getBoundingClientRect();
        return (
          box.width < 64 ||
          box.height < 64 ||
          box.top < scene.top - 1 ||
          box.bottom > scene.bottom + 1 ||
          box.left < scene.left - 1 ||
          box.right > scene.right + 1
        );
      })
      .map((button) => {
        const box = button.getBoundingClientRect();
        return `${button.dataset.action} ${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.left)},${Math.round(box.top)} scene ${Math.round(scene.width)}x${Math.round(scene.height)}`;
      });
    check(
      `cleaning controls fit a 480 panel${overflow.length ? `: ${overflow.join('; ')}` : ''}`,
      overflow.length === 0
    );
  }
  check('rendering calls no service', t.calls.length === 0);

  await t.click('vacuum-pause', ENTITY);
  check('pause calls vacuum.pause', only(t, 'pause', {entity_id: ENTITY}));
  t = await mount(variants.ok, {width: 480, height: 480});
  await t.click('vacuum-return', ENTITY);
  check('dock calls vacuum.return_to_base', only(t, 'return_to_base', {entity_id: ENTITY}));
  t = await mount(variants.ok, {width: 480, height: 480});
  await t.click('vacuum-stop', ENTITY);
  check('stop calls vacuum.stop', only(t, 'stop', {entity_id: ENTITY}));
  t = await mount(variants.ok, {width: 480, height: 480});
  await t.click('vacuum-locate', ENTITY);
  check('find calls vacuum.locate', only(t, 'locate', {entity_id: ENTITY}));
  t = await mount(variants.ok, {width: 480, height: 480});
  await t.click('vacuum-fan-0', ENTITY);
  check(
    'a fan-speed key sends that speed',
    only(t, 'set_fan_speed', {entity_id: ENTITY, fan_speed: 'Quiet'})
  );
  t = await mount(variants.ok, {width: 480, height: 480});
  await t.click('info', ENTITY);
  check(
    'the details key opens the entity dialog and calls no service',
    t.infos[0] === ENTITY && t.calls.length === 0
  );

  t = await mount(variants.docked, {width: 480, height: 480});
  check(
    'docked offers start and spot, and rests in deep teal',
    t.text('.ov-vacuum-status') === 'Docked' &&
      t.q('.ov-vacuum-scene').dataset.mood === 'docked' &&
      !t.q('[data-action="vacuum-start"]').disabled &&
      t.q('[data-action="vacuum-pause"]').disabled &&
      t.q('[data-action="vacuum-return"]').disabled &&
      !t.q('[data-action="vacuum-spot"]').disabled &&
      getComputedStyle(t.q('.ov-vacuum-scene')).backgroundColor === 'rgb(28, 78, 82)'
  );
  await t.click('vacuum-start', ENTITY);
  check('start calls vacuum.start', only(t, 'start', {entity_id: ENTITY}));
  t = await mount(variants.docked, {width: 480, height: 480});
  await t.click('vacuum-spot', ENTITY);
  check('spot calls vacuum.clean_spot', only(t, 'clean_spot', {entity_id: ENTITY}));

  t = await mount(variants.paused);
  check(
    'paused says Resume and can dock',
    t.text('[data-action="vacuum-start"] .ov-vacuum-command-label') === 'Resume' &&
      !t.q('[data-action="vacuum-start"]').disabled &&
      t.q('[data-action="vacuum-pause"]').disabled &&
      !t.q('[data-action="vacuum-return"]').disabled &&
      t.q('.ov-vacuum-scene').dataset.mood === 'paused'
  );
  await t.click('vacuum-start', ENTITY);
  check('resume calls vacuum.start', only(t, 'start', {entity_id: ENTITY}));

  t = await mount(variants.returning);
  check(
    'returning can pause and stop, and cannot start or dock again',
    t.text('.ov-vacuum-status') === 'Returning' &&
      t.q('[data-action="vacuum-start"]').disabled &&
      !t.q('[data-action="vacuum-pause"]').disabled &&
      t.q('[data-action="vacuum-return"]').disabled &&
      t.q('.ov-vacuum-scene').dataset.mood === 'returning'
  );
  t = await mount(variants.error);
  check(
    'an error names the fault, shows a low battery, and can start again',
    t.text('.ov-vacuum-status') === 'Error' &&
      t.text('.ov-vacuum-detail') === 'Brush stuck' &&
      t.q('.ov-vacuum-battery').classList.contains('ov-vacuum-battery-low') &&
      !t.q('[data-action="vacuum-start"]').disabled &&
      t.q('.ov-vacuum-scene').dataset.mood === 'error' &&
      getComputedStyle(t.q('.ov-vacuum-scene')).backgroundColor === 'rgb(157, 67, 48)'
  );
  t = await mount(variants.charging);
  check(
    'charging reads as charging on the docked colour',
    t.text('.ov-vacuum-status') === 'Charging' && t.q('.ov-vacuum-scene').dataset.mood === 'docked'
  );
  t = await mount(variants.idle);
  check(
    'idle has no battery figure and no fan row when the speed is blank',
    t.text('.ov-vacuum-status') === 'Idle' &&
      !t.q('.ov-vacuum-battery') &&
      !t.q('.ov-vacuum-fan-fig')
  );
  t = await mount(variants.lowBattery);
  check(
    'a battery at 20% or below uses the low marker',
    t.q('.ov-vacuum-battery-low') && t.text('.ov-vacuum-battery-fig') === '15%'
  );
  t = await mount(variants.legacy);
  check(
    'an older vacuum offers Start and Off only',
    labels(t) === 'Start Off' &&
      !t.q('[data-action="vacuum-pause"]') &&
      !t.q('.ov-vacuum-speeds') &&
      !t.q('[data-action="vacuum-start"]').disabled &&
      !t.q('[data-action="vacuum-stop"]').disabled
  );
  await t.click('vacuum-start', ENTITY);
  check('an older vacuum starts with vacuum.turn_on', only(t, 'turn_on', {entity_id: ENTITY}));
  t = await mount(variants.legacy);
  await t.click('vacuum-stop', ENTITY);
  check('an older vacuum turns off with vacuum.turn_off', only(t, 'turn_off', {entity_id: ENTITY}));
  t = await mount(variants.noFeatures);
  check(
    'a vacuum with no commands still shows its activity',
    t.text('.ov-vacuum-status') === 'Idle' && !t.q('.ov-vacuum-foot')
  );
  t = await mount(variants.manySpeeds);
  check(
    'only the first six fan speeds are keys; the current speed stays in the summary',
    t.qa('.ov-vacuum-speed').length === 6 &&
      !t.q('[data-action="vacuum-fan-6"]') &&
      t.text('.ov-vacuum-fan-fig') === 'Seven' &&
      [...t.qa('.ov-vacuum-speed')].every((b) => b.getAttribute('aria-pressed') === 'false')
  );
  t = await mount(variants.hostile);
  check(
    'a hostile name and fan speed are text',
    !t.q('b') &&
      t.text('.ov-vacuum-title') === '<b>"Bot" & co</b>' &&
      t.text('.ov-vacuum-speed') === '<b>Max</b>'
  );
  await t.click('vacuum-fan-0', ENTITY);
  check(
    'the fan-speed command sends the raw speed',
    only(t, 'set_fan_speed', {entity_id: ENTITY, fan_speed: '<b>Max</b>'})
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable is labelled and has no cleaning keys',
    t.text('.ov-vacuum-status') === 'Unavailable' &&
      t.q('.ov-vacuum-scene').dataset.mood === 'unavailable' &&
      !t.q('.ov-vacuum-command') &&
      getComputedStyle(t.q('.ov-vacuum-scene')).backgroundColor === 'rgb(43, 47, 54)'
  );
  t = await mount(variants.unknown);
  check('unknown is treated as unavailable', t.text('.ov-vacuum-status') === 'Unavailable');
  t = await mount(variants.missing);
  check(
    'a missing vacuum renders calmly and its details key is disabled',
    t.text('.ov-vacuum-status') === 'Unavailable' && t.q('[data-action="info"]').disabled
  );

  t = await mount(variants.ok);
  await update(t, {state: 'paused', attributes: {battery_level: 60}});
  check(
    'the panel follows a new activity',
    t.text('.ov-vacuum-status') === 'Paused' &&
      t.text('[data-action="vacuum-start"] .ov-vacuum-command-label') === 'Resume' &&
      t.text('.ov-vacuum-battery-fig') === '60%'
  );

  t = await mount(variants.ok, {mode: 'screensaver', width: 480, height: 480});
  const layer = () => t.root?.querySelector('.hv-screensaver');
  check(
    'the full-screen panel has a close key inside the layer',
    !!layer()?.querySelector('[data-action="overview-close"]') &&
      layer().querySelector('.ov-vacuum-title').textContent === 'Robot'
  );
  layer().querySelector('.ov-vacuum-body').click();
  await t.settle(10);
  check(
    'a press on the background does nothing',
    !!layer() && t.layerState === 'on' && t.calls.length === 0
  );
  await t.click('overview-close', ENTITY);
  await wait(400);
  check('the close key closes it and calls no service', !layer() && t.calls.length === 0);

  t = await mount(variants.ok, {mode: 'screensaver'});
  t.layer.dispatchEvent(
    new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, composed: true, cancelable: true})
  );
  await wait(400);
  check('Escape closes it', !t.layer);

  const widget = {type: 'custom:houseview-vacuum-card', entity: ENTITY, name: 'Hall robot'};
  t = await mount(variants.ok, {mode: 'carousel', cards: [widget]});
  check('a carousel with a vacuum tile shows no panel by itself', !t.layer);
  await t.click('vacuum-view');
  await t.settle(50);
  check(
    'tapping the tile opens the cleaning panel, named after the tile',
    !!t.layer?.querySelector('.ov-vacuum-scene') &&
      t.layer.querySelector('.ov-vacuum-title').textContent === 'Hall robot' &&
      t.calls.length === 0 &&
      t.infos.length === 0
  );
  await t.click('overview-close', ENTITY);
  await wait(400);
  check('and it closes again', !t.layer);

  t = await mount(variants.ok, {
    mode: 'carousel',
    cards: [widget],
    config: {vacuum_view: false}
  });
  await t.hold('[data-action="info"]');
  check(
    'vacuum_view: false keeps the entity dialog on the tile',
    !t.layer && t.infos.includes(ENTITY) && t.calls.length === 0
  );
}
