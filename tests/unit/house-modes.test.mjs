import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUSE_MODES,
  houseModeItems,
  houseModeState,
  canActivateHouseMode,
  validateHouseModes
} from '../../src/core/house-modes.js';
import {houseModesData, applyHouseModes} from '../../src/editor/house-modes-form.js';
import {watchedIds} from '../../src/core/hass-signature.js';
const config = {
  house_mode_entity: 'input_select.mode',
  house_modes: HOUSE_MODES.map(({id, option}) => ({
    mode: id,
    option,
    description: `Explanation for ${id}`
  }))
};
const hass = (state = 'Home', options = HOUSE_MODES.map((item) => item.option)) => ({
  states: {'input_select.mode': {state, attributes: {options}}}
});
test('house modes use reported state and exact selector options; Home must be usable to end modes', () => {
  const model = houseModeState(config, hass());
  assert.equal(model.current.id, 'home');
  assert.equal(canActivateHouseMode(model, model.items[0]), false);
  assert.equal(canActivateHouseMode(model, model.items[2]), true);
  for (const state of ['unknown', 'unavailable'])
    assert.equal(canActivateHouseMode(houseModeState(config, hass(state)), model.items[2]), false);
  assert.equal(houseModeState(config, hass('Holiday')).current, undefined);
  assert.equal(
    canActivateHouseMode(houseModeState(config, hass('Home', ['Guests'])), model.items[2]),
    false
  );
  const noHome = {
    ...config,
    house_modes: config.house_modes.filter((item) => item.mode !== 'home')
  };
  assert.equal(canActivateHouseMode(houseModeState(noHome, hass()), model.items[2]), false);
});
test('mode validation rejects malformed entities, duplicate modes and ambiguous option mappings', () => {
  assert.doesNotThrow(() => validateHouseModes(config));
  assert.doesNotThrow(() => validateHouseModes({...config, house_mode_entity: 'select.mode'}));
  for (const bad of [
    {house_mode_entity: 'script.mode'},
    {house_modes: {}},
    {house_modes: [{mode: 'holiday'}]},
    {house_modes: [{mode: 'home'}, {mode: 'home'}]},
    {house_modes: [{mode: 'home', option: 'Guests'}]},
    {house_modes: [{mode: 'home', description: 12}]}
  ])
    assert.throws(() => validateHouseModes(bad));
});
test('mode definitions and derived lookups stay defensive and configuration is watched', () => {
  const items = houseModeItems(config);
  items[0].option = 'Changed';
  assert.equal(houseModeItems(config)[0].option, 'Home');
  assert.equal(Object.isFrozen(HOUSE_MODES[0]), true);
  assert.ok(watchedIds(config).includes('input_select.mode'));
});
test('Home editor preserves untouched YAML and saves mode options and explanations', () => {
  assert.deepEqual(applyHouseModes(config, houseModesData(config)), config);
  assert.deepEqual(applyHouseModes({}, houseModesData({})), {});
  assert.deepEqual(
    applyHouseModes(
      {},
      {
        ...houseModesData({}),
        house_mode_entity: config.house_mode_entity,
        house_modes: config.house_modes
      }
    ),
    config
  );
  assert.equal(applyHouseModes(config, {house_mode_entity: ''}).house_mode_entity, undefined);
});

test('helper setup creates five standard options only on request and resolves renamed registry identities', async () => {
  const {createHouseModeSelector} = await import('../../src/editor/house-modes-setup.js');
  const calls = [];
  const entity = await createHouseModeSelector({
    user: {is_admin: true},
    callWS: async (message) => {
      calls.push(message);
      if (message.type === 'input_select/list') return [];
      if (message.type === 'input_select/create') return {id: 'houseview_house_mode'};
      return [
        {
          platform: 'input_select',
          unique_id: 'houseview_house_mode',
          entity_id: 'input_select.renamed_house_mode'
        }
      ];
    }
  });
  assert.equal(entity, 'input_select.renamed_house_mode');
  assert.deepEqual(calls[1].options, ['Home', 'Away', 'Guests', 'Evening', 'Sleeping']);
  assert.equal(
    calls.some((call) => call.type === 'call_service'),
    false
  );
});
test('helper setup reuses a matching helper on retries without duplicating or replacing it', async () => {
  const {createHouseModeSelector} = await import('../../src/editor/house-modes-setup.js');
  const calls = [];
  await createHouseModeSelector({
    user: {is_admin: true},
    callWS: async (message) => {
      calls.push(message.type);
      if (message.type === 'input_select/list')
        return [
          {
            id: 'existing',
            name: 'HouseView house mode',
            options: ['Home', 'Away', 'Guests', 'Evening', 'Sleeping']
          }
        ];
      return [
        {platform: 'input_select', unique_id: 'existing', entity_id: 'input_select.house_mode'}
      ];
    }
  });
  assert.deepEqual(calls, ['input_select/list', 'config/entity_registry/list']);
  await assert.rejects(() => createHouseModeSelector({user: {is_admin: false}}), /administrator/);
});
test('scripts must be valid and available; Home editor retains script choices', () => {
  const scripted = {
    ...config,
    house_modes: config.house_modes.map((mode) =>
      mode.mode === 'guests' ? {...mode, script: 'script.guests'} : mode
    )
  };
  assert.deepEqual(applyHouseModes(scripted, houseModesData(scripted)), scripted);
  assert.throws(
    () => validateHouseModes({...config, house_modes: [{mode: 'home', script: 'light.hall'}]}),
    /script entity/
  );
  const model = houseModeState(scripted, hass());
  assert.equal(canActivateHouseMode(model, model.items[2]), false);
  assert.ok(watchedIds(scripted).includes('script.guests'));
});
