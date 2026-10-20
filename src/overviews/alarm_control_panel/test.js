// Browser behaviour tests (tests/overviews/harness.js, against dist/houseview.js with a recording mock hass).
const ENTITY = 'alarm_control_panel.home';

const only = (t, service) =>
  t.calls.length === 1 &&
  t.calls[0].d === 'alarm_control_panel' &&
  t.calls[0].s === service &&
  t.calls[0].data.entity_id === ENTITY;

const labels = (t) =>
  [...t.qa('.ov-alarm-command-label')].map((el) => el.textContent.trim()).join(' ');

export default async function ({mount, check, variants, wait}) {
  // Disarming asks first (window.confirm). The harness for overviews does not stub it, so answer here.
  const realConfirm = window.confirm;
  let asked = [];
  window.confirm = (message) => {
    asked.push(String(message));
    return true;
  };
  try {
    let t = await mount(variants.ok, {width: 480, height: 480});
    check(
      'disarmed: name, state and the four mode keys then Disarm',
      t.text('.ov-panel-title') === 'House alarm' &&
        t.text('.ov-alarm-status') === 'Disarmed' &&
        labels(t) === 'Home Away Night Holiday Disarm' &&
        t.q('.ov-alarm-scene').dataset.mood === 'disarmed'
    );
    check(
      'disarmed is green',
      getComputedStyle(t.q('.ov-alarm-scene')).backgroundColor === 'rgb(47, 107, 79)'
    );
    check(
      'a card has the keys and details, and no close key or full-card overlay',
      !!t.q('[data-action="info"]') &&
        !t.q('[data-action="overview-close"]') &&
        !t.q('.ov-tap') &&
        ['home', 'away', 'night', 'vacation'].every(
          (mode) => !t.q(`[data-action="alarm-control-panel-arm-${mode}"]`).disabled
        ) &&
        t.q('[data-action="alarm-control-panel-disarm"]').disabled &&
        !t.q('.ov-alarm-note')
    );
    check(
      'every key names the alarm',
      t.qa('.ov-alarm-scene button').every((b) => b.dataset.entity === ENTITY)
    );
    {
      const scene = t.q('.ov-alarm-scene').getBoundingClientRect();
      const bad = [...t.qa('.ov-alarm-command')]
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
        .map((button) => button.dataset.action);
      check(`alarm keys are 64px and fit a 480 panel${bad.length ? `: ${bad}` : ''}`, !bad.length);
    }
    check('rendering calls no service', t.calls.length === 0);

    await t.click('alarm-control-panel-arm-home', ENTITY);
    check('Home calls alarm_arm_home', only(t, 'alarm_arm_home'));
    t = await mount(variants.ok, {width: 480, height: 480});
    await t.click('alarm-control-panel-arm-away', ENTITY);
    check('Away calls alarm_arm_away', only(t, 'alarm_arm_away'));
    t = await mount(variants.ok, {width: 480, height: 480});
    await t.click('alarm-control-panel-arm-night', ENTITY);
    check('Night calls alarm_arm_night', only(t, 'alarm_arm_night'));
    t = await mount(variants.ok, {width: 480, height: 480});
    await t.click('alarm-control-panel-arm-vacation', ENTITY);
    check('Holiday calls alarm_arm_vacation', only(t, 'alarm_arm_vacation'));
    t = await mount(variants.ok, {width: 480, height: 480});
    await t.click('info', ENTITY);
    check(
      'the details key opens the entity dialog and calls no service',
      t.infos[0] === ENTITY && t.calls.length === 0
    );

    t = await mount(variants.armedAway, {width: 480, height: 480});
    check(
      'armed away: its key is pressed, arming is off, Disarm is on',
      t.text('.ov-alarm-status') === 'Armed away' &&
        t.q('[data-action="alarm-control-panel-arm-away"]').getAttribute('aria-pressed') ===
          'true' &&
        t.q('[data-action="alarm-control-panel-arm-home"]').getAttribute('aria-pressed') ===
          'false' &&
        ['home', 'away', 'night', 'vacation'].every(
          (mode) => t.q(`[data-action="alarm-control-panel-arm-${mode}"]`).disabled
        ) &&
        !t.q('[data-action="alarm-control-panel-disarm"]').disabled &&
        t.q('.ov-alarm-scene').dataset.mood === 'away'
    );
    asked = [];
    await t.click('alarm-control-panel-disarm', ENTITY);
    check(
      'Disarm asks first, then calls alarm_disarm',
      asked.length === 1 && asked[0] === 'Disarm House alarm?' && only(t, 'alarm_disarm')
    );
    window.confirm = () => false;
    t = await mount(variants.armedAway, {width: 480, height: 480});
    await t.click('alarm-control-panel-disarm', ENTITY);
    check('declining the confirmation sends nothing', t.calls.length === 0);
    window.confirm = (message) => {
      asked.push(String(message));
      return true;
    };

    for (const [variant, text, mood] of [
      ['armedHome', 'Armed home', 'home'],
      ['armedNight', 'Armed night', 'night'],
      ['armedVacation', 'Armed holiday', 'vacation'],
      ['armedBypass', 'Armed', 'armed'],
      ['arming', 'Arming', 'pending'],
      ['pending', 'Pending', 'pending'],
      ['triggered', 'Triggered', 'triggered']
    ]) {
      t = await mount(variants[variant], {width: 480, height: 480});
      check(
        `${variant}: reads ${text} on the ${mood} colour and can disarm`,
        t.text('.ov-alarm-status') === text &&
          t.q('.ov-alarm-scene').dataset.mood === mood &&
          !t.q('[data-action="alarm-control-panel-disarm"]').disabled &&
          t.q('[data-action="alarm-control-panel-arm-home"]').disabled
      );
    }
    t = await mount(variants.triggered);
    check(
      'triggered is red',
      getComputedStyle(t.q('.ov-alarm-scene')).backgroundColor === 'rgb(176, 42, 42)'
    );

    t = await mount(variants.homeOnly);
    check(
      'only the modes the panel advertises are keys',
      labels(t) === 'Home Disarm' && !t.q('[data-action="alarm-control-panel-arm-away"]')
    );
    t = await mount(variants.noFeatures);
    check('a panel with no arming modes still offers Disarm', labels(t) === 'Disarm');

    t = await mount(variants.codeNumber);
    check(
      'a panel that wants a code disables arming, says so, and offers the dialog',
      ['home', 'away', 'night', 'vacation'].every(
        (mode) => t.q(`[data-action="alarm-control-panel-arm-${mode}"]`).disabled
      ) &&
        t.text('.ov-alarm-note') === 'This alarm needs a code. Enter it in Home Assistant.' &&
        labels(t).endsWith('Code') &&
        !t.q('.ov-alarm-command[data-action="info"]').disabled
    );
    await t.click('alarm-control-panel-arm-home', ENTITY);
    check('a disabled key sends nothing', t.calls.length === 0);
    t = await mount(variants.codeToDisarmOnly);
    check(
      'code_arm_required: false still arms here, and the Code key is not shown',
      !t.q('[data-action="alarm-control-panel-arm-home"]').disabled &&
        !t.q('.ov-alarm-note') &&
        !labels(t).includes('Code')
    );
    t = await mount(variants.codeArmed, {width: 480, height: 480});
    check(
      'an armed panel with a code keeps Disarm disabled and points to the dialog',
      t.q('[data-action="alarm-control-panel-disarm"]').disabled && labels(t).endsWith('Code')
    );

    t = await mount(variants.hostile);
    check(
      'a hostile name is text',
      !t.q('b') && t.text('.ov-panel-title') === '<b>"Alarm" & co</b>'
    );

    t = await mount(variants.unavailable);
    check(
      'unavailable is labelled, with every key disabled',
      t.text('.ov-alarm-status') === 'Unavailable' &&
        t.q('.ov-alarm-scene').dataset.mood === 'unavailable' &&
        [...t.qa('.ov-alarm-command')].every((b) => b.disabled)
    );
    t = await mount(variants.unknown);
    check('unknown is treated as unavailable', t.text('.ov-alarm-status') === 'Unavailable');
    t = await mount(variants.missing);
    check(
      'a missing alarm renders calmly and its details key is disabled',
      t.text('.ov-alarm-status') === 'Unavailable' && t.q('[data-action="info"]').disabled
    );

    t = await mount(variants.ok);
    t.mock.replaceState(ENTITY, {
      ...t.hass.states[ENTITY],
      state: 'armed_night'
    });
    t.el.hass = t.hass;
    await t.settle();
    check(
      'the view follows the alarm',
      t.text('.ov-alarm-status') === 'Armed night' &&
        t.q('[data-action="alarm-control-panel-arm-night"]').getAttribute('aria-pressed') === 'true'
    );

    t = await mount(variants.ok, {mode: 'screensaver', width: 480, height: 480});
    const layer = () => t.root?.querySelector('.hv-screensaver');
    check(
      'the full-screen view has a close key inside the layer',
      !!layer()?.querySelector('[data-action="overview-close"]') &&
        layer().querySelector('.ov-panel-title').textContent === 'House alarm'
    );
    layer().querySelector('.ov-alarm-body').click();
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

    const widget = {
      type: 'custom:houseview-alarm_control_panel-card',
      entity: ENTITY,
      name: 'Hall alarm'
    };
    t = await mount(variants.ok, {mode: 'carousel', cards: [widget]});
    check('a carousel with an alarm tile shows no view by itself', !t.layer);
    await t.click('alarm-view');
    await t.settle(50);
    check(
      'tapping the tile opens the alarm view, named after the tile',
      !!t.layer?.querySelector('.ov-alarm-scene') &&
        t.layer.querySelector('.ov-panel-title').textContent === 'Hall alarm' &&
        t.calls.length === 0 &&
        t.infos.length === 0
    );
    await t.click('overview-close', ENTITY);
    await wait(400);
    check('and it closes again', !t.layer);

    t = await mount(variants.ok, {
      mode: 'carousel',
      cards: [widget],
      config: {alarm_view: false}
    });
    await t.hold('[data-action="info"]');
    check(
      'alarm_view: false keeps the entity dialog on the tile',
      !t.layer && t.infos.includes(ENTITY) && t.calls.length === 0
    );
  } finally {
    window.confirm = realConfirm;
  }
}
