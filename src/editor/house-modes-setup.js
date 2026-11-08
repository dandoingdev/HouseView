import {suggestedRoutineChecks} from '../core/house-routines.js';
import {fromCard} from '../config/convert.js';
import {houseModesData} from './house-modes-form.js';
import {HOUSE_MODES} from '../core/house-modes.js';
import {text} from './form.js';

/** Explicit editor action only. Recover an existing helper on retry, including after an uncertain create result. */
export async function createHouseModeSelector(hass) {
  if (!hass?.user?.is_admin || typeof hass.callWS !== 'function')
    throw new Error('Sign in as a Home Assistant administrator to create the house mode helper.');
  const call = async (message) => {
    let timer;
    try {
      return await Promise.race([
        hass.callWS(message),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error('Home Assistant did not respond. Check Helpers before retrying.')),
            15000
          );
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const options = HOUSE_MODES.map((mode) => mode.option);
  const existing = await call({type: 'input_select/list'});
  const helper =
    existing.find(
      (item) =>
        item.name === 'HouseView house mode' &&
        JSON.stringify(item.options) === JSON.stringify(options)
    ) ||
    (await call({
      type: 'input_select/create',
      name: 'HouseView house mode',
      options,
      icon: 'mdi:home-switch-outline'
    }));
  // Resolve the registry identity: helper IDs and entity IDs can differ after a rename or name collision.
  const entries = await call({type: 'config/entity_registry/list'});
  const entry = entries.find(
    (item) =>
      item.platform === 'input_select' &&
      item.unique_id === helper.id &&
      item.entity_id.startsWith('input_select.')
  );
  if (!entry)
    throw new Error(
      'The helper is ready in Home Assistant. Choose it in House mode selector below.'
    );
  return entry.entity_id;
}

export function renderHouseModeSetup(editor, parent) {
  const guide = document.createElement('div');
  guide.className = 'house-mode-setup';
  const title = document.createElement('h3');
  title.textContent = text(editor._hass, 'editor.house_modes_setup');
  const steps = document.createElement('p');
  steps.textContent = text(editor._hass, 'editor.helper.house_modes_setup');
  const create = document.createElement('button');
  create.type = 'button';
  create.className = 'house-mode-create';
  create.textContent = text(editor._hass, 'editor.house_modes_create');
  Object.assign(create.style, {
    minHeight: '44px',
    padding: '10px 16px',
    borderRadius: '12px',
    border: '1px solid var(--divider-color)',
    background: 'var(--primary-color)',
    color: 'var(--text-primary-color)',
    font: 'inherit',
    cursor: 'pointer'
  });
  const links = document.createElement('p');
  for (const [path, key] of [
    ['/config/helpers', 'editor.house_modes_helpers'],
    ['/config/script/dashboard', 'editor.house_modes_scripts']
  ]) {
    const link = document.createElement('a');
    link.href = path;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = text(editor._hass, key);
    link.style.marginRight = '16px';
    links.append(link);
  }
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const sync = () => {
    create.disabled =
      !!editor._houseModeSetupBusy ||
      !!editor._config.house_mode_entity ||
      !editor._hass?.user?.is_admin ||
      !editor._hass?.callWS;
  };
  create.addEventListener('click', async () => {
    if (create.disabled) return;
    editor._houseModeSetupBusy = true;
    sync();
    status.textContent = text(editor._hass, 'editor.house_modes_creating');
    const initial = editor._config.house_mode_entity;
    try {
      const entity = await createHouseModeSelector(editor._hass);
      if (!editor.isConnected || editor._config.house_mode_entity !== initial) return;
      editor._config = {...editor._config, house_mode_entity: entity};
      editor._view.houseModes.data = {...editor._view.houseModes.data, house_mode_entity: entity};
      editor._emit();
      status.textContent = text(editor._hass, 'editor.house_modes_ready');
    } catch (error) {
      status.textContent = error.message;
    } finally {
      editor._houseModeSetupBusy = false;
      sync();
    }
  });
  const suggest = document.createElement('button');
  suggest.type = 'button';
  suggest.className = 'house-routine-suggest';
  suggest.textContent = text(editor._hass, 'editor.house_routines_suggest');
  Object.assign(suggest.style, {
    minHeight: '44px',
    padding: '10px 16px',
    borderRadius: '12px',
    font: 'inherit',
    cursor: 'pointer'
  });
  suggest.addEventListener('click', () => {
    const config = {
      ...editor._config,
      widgets: editor._config.cards?.map(fromCard) || editor._config.widgets || []
    };
    const checks = suggestedRoutineChecks(config);
    const modes = houseModesData(editor._config).house_modes.map((mode) =>
      ['away', 'sleeping'].includes(mode.mode) && !mode.checks?.length
        ? {...mode, checks: checks.map((check) => ({...check}))}
        : mode
    );
    editor._config = {...editor._config, house_modes: modes};
    editor._view.houseModes.data = houseModesData(editor._config);
    editor._emit();
    status.textContent = text(
      editor._hass,
      checks.length ? 'editor.house_routines_suggested' : 'editor.house_routines_no_suggestions'
    );
  });
  guide.append(title, steps, create, suggest, links, status);
  parent.append(guide);
  sync();
  return sync;
}
