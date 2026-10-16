// Browser behaviour tests (tests/overviews/harness.js, against dist/houseview.js with a recording mock hass).
// `calls` records every hass.callService, `infos` every more-info request.
const ENTITY = 'climate.living_room';

const only = (t, service, data) =>
  t.calls.length === 1 &&
  t.calls[0].d === 'climate' &&
  t.calls[0].s === service &&
  Object.entries(data).every(([k, v]) => t.calls[0].data[k] === v);

export default async function ({mount, check, variants, wait}) {
  /** Change the thermostat the way Home Assistant does: a NEW state object, then hass again. */
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
  const figures = (t, root = t.root) =>
    [...root.querySelectorAll('.ov-climate-fig-text')].map((el) => el.textContent.trim()).join(' ');
  const mood = (t, root = t.root) => root.querySelector('.ov-climate-scene')?.dataset.mood;

  // ---- card mode: the reference face ----
  let t = await mount(variants.ok);
  check(
    'the reference face: Thermostat, Cooling to 70, the room at 70° and 30%',
    t.text('.ov-climate-title') === 'Thermostat' &&
      t.text('.ov-climate-caption') === 'Cooling to' &&
      t.text('.ov-climate-value') === '70' &&
      figures(t) === '70° 30%' &&
      mood(t) === 'cooling'
  );
  check(
    'it is blue',
    getComputedStyle(t.q('.ov-climate-scene')).backgroundColor === 'rgb(42, 148, 228)'
  );
  check('the header shows the time', t.text('.ov-climate-time') === '10:09');
  check(
    'a card has the keys but no close key and no full-card overlay',
    !!t.q('[data-action="down"]') &&
      !!t.q('[data-action="up"]') &&
      !!t.q('[data-action="info"]') &&
      !t.q('[data-action="overview-close"]') &&
      !t.q('.ov-tap')
  );
  check(
    'every key names the entity',
    t.qa('.ov-climate-scene button').every((b) => b.dataset.entity === ENTITY)
  );
  check(
    'the shared three-dot details key is top right',
    (() => {
      const scene = t.q('.ov-climate-scene').getBoundingClientRect();
      const key = t.q('.ov-climate-info').getBoundingClientRect();
      return (
        key.right <= scene.right &&
        key.bottom <= scene.bottom &&
        key.left > scene.left + scene.width / 2 &&
        key.top < scene.top + scene.height / 4 &&
        t.q('.ov-climate-info').classList.contains('ov-panel-key') &&
        t.q('.ov-climate-info ha-icon').getAttribute('icon') === 'mdi:dots-horizontal'
      );
    })()
  );
  check(
    'the keys are large enough to touch',
    t.qa('.ov-climate-scene button').every((b) => {
      const r = b.getBoundingClientRect();
      return r.width >= 44 && r.height >= 44;
    })
  );
  check('rendering calls no service', t.calls.length === 0);

  await t.click('up');
  check(
    'up raises the target by a whole degree in Fahrenheit (the thermostat widget steps it)',
    only(t, 'set_temperature', {entity_id: ENTITY, temperature: 71})
  );
  t = await mount(variants.ok);
  await t.click('down');
  check('down lowers it', only(t, 'set_temperature', {temperature: 69}));
  t = await mount(variants.ok);
  await t.click('info');
  check(
    'the thermostat key opens the entity dialog and calls no service',
    t.infos[0] === ENTITY && t.calls.length === 0
  );

  // ---- moods ----
  t = await mount(variants.heating);
  check(
    'heating: "Heating to 21", orange, the room at 20.5° and 42%',
    t.text('.ov-climate-caption') === 'Heating to' &&
      t.text('.ov-climate-value') === '21' &&
      figures(t) === '20.5° 42%' &&
      mood(t) === 'heating' &&
      getComputedStyle(t.q('.ov-climate-scene')).backgroundColor === 'rgb(239, 125, 44)'
  );
  await t.click('up');
  check('Celsius steps by a half degree', only(t, 'set_temperature', {temperature: 21.5}));
  t = await mount(variants.idle);
  check(
    'a resting unit says "Set to" on slate',
    t.text('.ov-climate-caption') === 'Set to' && mood(t) === 'idle'
  );
  t = await mount(variants.coolNoAction);
  check(
    'without hvac_action the mode decides: cool is cooling',
    t.text('.ov-climate-caption') === 'Cooling to' && mood(t) === 'cooling'
  );
  t = await mount(variants.heatNoAction);
  check(
    'and heat is heating',
    t.text('.ov-climate-caption') === 'Heating to' && mood(t) === 'heating'
  );
  t = await mount(variants.off);
  check(
    'off: "Off", grey, the target dimmed, the keys still usable',
    t.text('.ov-climate-caption') === 'Off' &&
      mood(t) === 'off' &&
      parseFloat(getComputedStyle(t.q('.ov-climate-value')).opacity) < 1 &&
      !t.q('[data-action="up"]').disabled
  );

  // ---- limits and modes without a single target ----
  t = await mount(variants.heatCool);
  check(
    'heat_cool: the room temperature, a range caption and no stepping',
    t.text('.ov-climate-value') === '20.5' &&
      t.text('.ov-climate-caption') === 'Heat to 19° · Cool to 24°' &&
      t.q('[data-action="up"]').disabled &&
      t.q('[data-action="down"]').disabled
  );
  t = await mount(variants.atMin);
  check(
    'down is disabled at min_temp',
    t.q('[data-action="down"]').disabled && !t.q('[data-action="up"]').disabled
  );
  t = await mount(variants.atMax);
  check(
    'up is disabled at max_temp',
    t.q('[data-action="up"]').disabled && !t.q('[data-action="down"]').disabled
  );
  t = await mount(variants.noLimits);
  check(
    'no limits: both keys work',
    !t.q('[data-action="up"]').disabled && !t.q('[data-action="down"]').disabled
  );
  t = await mount(variants.noTargetFeature);
  check(
    'no target-temperature feature: no stepping',
    t.q('[data-action="up"]').disabled && t.q('[data-action="down"]').disabled
  );
  t = await mount(variants.noTarget);
  check(
    'no target: the room temperature under "Set to", no stepping',
    t.text('.ov-climate-value') === '20.5' &&
      t.text('.ov-climate-caption') === 'Set to' &&
      t.q('[data-action="up"]').disabled
  );
  t = await mount(variants.decimalTarget);
  check(
    'one decimal at most, in both numbers',
    t.text('.ov-climate-value') === '21.5' && figures(t).startsWith('20.3°')
  );

  // ---- the figures line ----
  t = await mount(variants.noHumidity);
  check(
    'no humidity: the room temperature alone',
    figures(t) === '20.5°' && !t.q('.ov-climate-humidity')
  );
  t = await mount(variants.noRoomTemperature);
  check(
    'no room temperature: the humidity alone',
    figures(t) === '42%' && !t.q('.ov-climate-current')
  );
  t = await mount(variants.noFigures);
  check('neither: an empty line', figures(t) === '' && !!t.q('.ov-climate-meta'));

  // ---- names and the clock ----
  t = await mount(variants.customName);
  check('the name option is the title', t.text('.ov-climate-title') === 'Lounge AC');
  t = await mount(variants.hostileName);
  check(
    'a hostile friendly_name is text, never markup',
    !t.q('.ov-climate-scene b') &&
      t.text('.ov-climate-title') === '<b>"AC" & co</b>' &&
      t
        .q('.ov-climate-scene')
        .getAttribute('aria-label')
        .startsWith('<b>"AC" & co</b>, Heating to 21')
  );
  t = await mount(variants.noTime);
  check('show_time: false drops the clock', !t.q('.ov-climate-time'));
  t = await mount(variants.twelveHour);
  check('the clock follows the time format', /^10:09\s?am$/i.test(t.text('.ov-climate-time')));

  // ---- unavailable, unknown, missing ----
  for (const name of ['unavailable', 'unknown']) {
    t = await mount(variants[name]);
    check(
      `${name}: "Unavailable", a dash, no stepping, the dialog key still works`,
      t.text('.ov-climate-caption') === 'Unavailable' &&
        t.text('.ov-climate-value') === '—' &&
        mood(t) === 'unavailable' &&
        t.q('[data-action="up"]').disabled &&
        t.q('[data-action="down"]').disabled &&
        !t.q('[data-action="info"]').disabled
    );
  }
  t = await mount(variants.missing);
  check(
    'a missing entity renders calmly with every key disabled',
    t.text('.ov-climate-value') === '—' &&
      t.qa('.ov-climate-scene button:not(:disabled)').length === 0
  );
  await t.card._act('up', ENTITY);
  check('and issues no call', t.calls.length === 0);

  // ---- live updates ----
  t = await mount(variants.heating);
  await update(t, {attributes: {temperature: 22, hvac_action: 'idle'}});
  check(
    'a state change re-renders: 22 under "Set to"',
    t.text('.ov-climate-value') === '22' &&
      t.text('.ov-climate-caption') === 'Set to' &&
      mood(t) === 'idle'
  );

  // ---- the full-page layer: a control panel ----
  t = await mount(variants.ok, {mode: 'screensaver'});
  const layer = () => t.layer;
  check(
    'the layer shows the same face with a close key and no full-area dismiss button',
    !!layer()?.querySelector('.ov-climate-scene') &&
      layer().classList.contains('hv-controls') &&
      !!layer().querySelector('[data-action="overview-close"]') &&
      !layer().querySelector('.ov-dismiss') &&
      layer().querySelector('.ov-climate-value').textContent === '70'
  );
  check(
    'the close key is top left',
    (() => {
      const scene = layer().querySelector('.ov-climate-scene').getBoundingClientRect();
      const key = layer().querySelector('.ov-climate-close').getBoundingClientRect();
      return key.left < scene.left + scene.width / 4 && key.top < scene.top + scene.height / 4;
    })()
  );
  await t.click('up', ENTITY);
  check(
    'up in the layer steps the target and the layer stays',
    only(t, 'set_temperature', {temperature: 71}) && !!layer() && t.layerState === 'on'
  );
  await update(t, {attributes: {temperature: 71}});
  check(
    'the layer follows the new target',
    layer()?.querySelector('.ov-climate-value').textContent === '71'
  );
  await t.click('info', ENTITY);
  check(
    'the thermostat key opens the entity dialog over the layer',
    t.infos.includes(ENTITY) && !!layer() && t.layerState === 'on'
  );
  layer().querySelector('.ov-climate-body').click();
  await t.settle(10);
  check(
    'a press on the background does nothing',
    !!layer() && t.layerState === 'on' && t.calls.length === 0
  );
  await t.click('overview-close', ENTITY);
  await wait(400);
  check('the close key closes it and calls no service', !layer() && t.calls.length === 0);

  t = await mount(variants.ok, {mode: 'screensaver'});
  layer().dispatchEvent(
    new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, composed: true, cancelable: true})
  );
  await wait(400);
  check('Escape closes it', !layer());

  // ---- opened from the thermostat widget ----
  const widget = {type: 'custom:houseview-climate-card', entity: ENTITY, name: 'Lounge'};
  t = await mount(variants.ok, {mode: 'carousel', cards: [widget]});
  check('a carousel with a thermostat widget shows no layer by itself', !t.layer);
  await t.hold('.cs-number');
  await t.settle(50);
  check(
    'holding the number on the widget opens the thermostat view, named after the widget',
    !!t.layer?.querySelector('.ov-climate-scene') &&
      t.layer.querySelector('.ov-climate-title').textContent === 'Lounge' &&
      t.calls.length === 0 &&
      t.infos.length === 0
  );
  await t.click('overview-close', ENTITY);
  await wait(400);
  check('and it closes again', !t.layer);

  t = await mount(variants.ok, {mode: 'carousel', cards: [widget], config: {climate_view: false}});
  await t.hold('.cs-number');
  await t.settle(50);
  check(
    'climate_view: false keeps the entity dialog on the widget instead',
    !t.layer && t.infos.includes(ENTITY)
  );
}
