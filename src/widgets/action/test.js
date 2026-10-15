// Browser behaviour tests (docs/widget-api.md). `calls` records every hass.callService.
const tile = '[data-action="run-action"]';

export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  check(
    'scene tile shows name and the Scene caption',
    t.text(`${tile} small`) === 'Scene' && !!t.q(`${tile}.scene.control`)
  );
  await t.click('run-action');
  check(
    'scene tap calls scene.turn_on for its own entity only',
    t.calls.length === 1 &&
      t.calls[0].d === 'scene' &&
      t.calls[0].s === 'turn_on' &&
      t.calls[0].data.entity_id === 'scene.test'
  );

  t = await mount(variants.sceneUnknown);
  check('a scene in state unknown stays pressable', !t.q(tile).disabled);

  t = await mount(variants.script);
  check('idle script shows Run', t.text(`${tile} small`) === 'Run' && !t.q(tile).disabled);
  await t.click('run-action');
  check(
    'script tap calls script.turn_on',
    t.calls.length === 1 && t.calls[0].d === 'script' && t.calls[0].s === 'turn_on'
  );

  t = await mount(variants.scriptRunning);
  check(
    'running script is active, disabled and says Running',
    t.q(tile).disabled && !!t.q(`${tile}.active`) && t.text(`${tile} small`) === 'Running'
  );
  await t.act('run-action', 'script.test');
  check('a running script cannot be started again', t.calls.length === 0);

  t = await mount(variants.scriptUnknown);
  check('script in state unknown is disabled', t.q(tile).disabled);
  await t.act('run-action', 'script.test');
  check('script in state unknown issues no call', t.calls.length === 0);

  t = await mount(variants.button);
  check(
    'button shows Press and is enabled while unknown',
    t.text(`${tile} small`) === 'Press' && !t.q(tile).disabled
  );
  await t.click('run-action');
  check(
    'button tap calls button.press',
    t.calls.length === 1 && t.calls[0].d === 'button' && t.calls[0].s === 'press'
  );

  t = await mount(variants.inputButton);
  await t.click('run-action');
  check(
    'input_button tap calls input_button.press',
    t.calls.length === 1 && t.calls[0].d === 'input_button' && t.calls[0].s === 'press'
  );

  t = await mount(variants.note);
  check(
    'note caption is escaped text',
    t.text(`${tile} .control-note`) === 'Tap & hold <b>"now"</b>' && !t.q(`${tile} b`)
  );

  t = await mount(variants.customIcon);
  check(
    'custom icon and name are used',
    t.q('ha-icon').getAttribute('icon') === 'mdi:lamps' && t.text(`${tile} span`) === 'Evening'
  );

  t = await mount(variants.entityIcon);
  check(
    'entity icon attribute is the fallback icon',
    t.q('ha-icon').getAttribute('icon') === 'mdi:sofa' && t.text(`${tile} span`) === 'Movie'
  );

  t = await mount(variants.hostileName);
  check(
    'name is escaped, not parsed as markup',
    !t.q(`${tile} b`) && t.text(`${tile} span`) === '<b>"Scene" & co</b>'
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable action is disabled and labelled',
    t.q(tile).disabled && t.text(tile).includes('Unavailable')
  );
  await t.act('run-action', 'scene.test');
  check('unavailable action issues no call', t.calls.length === 0);

  t = await mount(variants.missing);
  await t.act('run-action', 'scene.test');
  check(
    'missing entity renders disabled and issues no call',
    t.q(tile).disabled && t.calls.length === 0
  );

  t = await mount(variants.ok);
  await t.act('run-action', 'light.other');
  check('run-action ignores entities outside the four domains', t.calls.length === 0);
  await t.act('run-action', 'scene.not_configured');
  check('run-action ignores an entity that has no action tile', t.calls.length === 0);
  await t.act('scene', 'scene.test');
  check(
    'the scene action calls scene.turn_on',
    t.calls.length === 1 && t.calls[0].d === 'scene' && t.calls[0].s === 'turn_on'
  );
}
