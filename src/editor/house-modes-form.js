import {houseModeItems} from '../core/house-modes.js';
import {field} from './form.js';

export const houseModesData = (config) => ({
  house_mode_entity: config.house_mode_entity || '',
  house_modes: houseModeItems(config).map(({id, option, description, script}) => ({
    mode: id,
    option,
    description,
    ...(script ? {script} : {}),
    ...(config.house_modes?.find((mode) => mode.mode === id)?.checks
      ? {checks: config.house_modes.find((mode) => mode.mode === id).checks}
      : {})
  }))
});

export const houseModesSchema = () => [
  field('house_mode_entity', {entity: {domain: ['input_select', 'select']}}),
  field('house_modes', {
    object: {
      multiple: true,
      label_field: 'mode',
      description_field: 'description',
      fields: {
        mode: {
          required: true,
          selector: {select: {options: ['home', 'away', 'guests', 'evening', 'sleeping']}}
        },
        option: {required: true, selector: {text: {}}},
        description: {required: true, selector: {text: {multiline: true}}},
        script: {selector: {entity: {domain: 'script'}}},
        checks: {
          selector: {
            object: {
              multiple: true,
              label_field: 'name',
              description_field: 'entity',
              fields: {
                entity: {
                  required: true,
                  selector: {
                    entity: {
                      domain: ['binary_sensor', 'light', 'lock', 'climate', 'alarm_control_panel']
                    }
                  }
                },
                kind: {
                  required: true,
                  selector: {
                    select: {
                      options: [
                        {value: 'opening', label: 'Door or window closed'},
                        {value: 'light', label: 'Light off'},
                        {value: 'lock', label: 'Door locked'},
                        {value: 'climate', label: 'Heating / cooling mode'},
                        {value: 'alarm', label: 'Alarm state'}
                      ]
                    }
                  }
                },
                name: {selector: {text: {}}},
                expected_state: {selector: {text: {}}}
              }
            }
          }
        }
      }
    }
  })
];

export function applyHouseModes(config, value) {
  const next = {...config};
  const shown = houseModesData(config);
  for (const key of ['house_mode_entity', 'house_modes']) {
    if (value[key] === undefined || JSON.stringify(value[key]) === JSON.stringify(shown[key]))
      continue;
    const v = value[key];
    if (key === 'house_mode_entity') {
      if (v) next[key] = v;
      else delete next[key];
    } else if (Array.isArray(v) && v.length)
      next[key] = v.map((item) =>
        Object.fromEntries(
          Object.entries(item).filter(
            ([, value]) => value !== undefined && value !== null && value !== ''
          )
        )
      );
    else delete next[key];
    if (key === 'house_modes' && next[key])
      next[key] = next[key].map((mode) => ({
        ...mode,
        ...(mode.checks
          ? {
              checks: mode.checks.map((check) =>
                Object.fromEntries(
                  Object.entries(check).filter(
                    ([, value]) => value !== undefined && value !== null && value !== ''
                  )
                )
              )
            }
          : {})
      }));
  }
  return next;
}
