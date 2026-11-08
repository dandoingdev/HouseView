import test from 'node:test';
import assert from 'node:assert/strict';
import {lineAlert, validateLineAlert} from '../../src/core/line-alert.js';
import {watchedIds, hassChanged} from '../../src/core/hass-signature.js';
const config = {line_alert_entity: 'sensor.demo_line'};
const hass = (state, attributes = {}) => ({
  states: {
    'sensor.demo_line': {
      state,
      attributes: {friendly_name: 'London Underground Example', ...attributes}
    }
  }
});

test('only documented disruptions become alerts; good, unknown, unavailable and informational states stay silent', () => {
  for (const state of [
    'Good Service',
    'No Issues',
    'Information',
    'unknown',
    'unavailable',
    '',
    'on',
    'unrecognised report'
  ])
    assert.equal(lineAlert(config, hass(state)), null, state);
  assert.equal(lineAlert(config, {}), null);
  assert.equal(lineAlert({}, hass('Minor Delays')), null);
  assert.equal(lineAlert(config, {...hass('Minor Delays'), connected: false}), null);
  assert.equal(lineAlert({...config, single_widget: true}, hass('Minor Delays')), null);
  for (const state of [
    'Special Service',
    'Planned Closure',
    'Reduced Service',
    'Bus Service',
    'Minor Delays',
    'Exit Only',
    'No Step Free Access',
    'Change of frequency',
    'Diverted',
    'Issues Reported'
  ])
    assert.equal(lineAlert(config, hass(state)).severity, 'warning', state);
  for (const state of [
    'Closed',
    'Suspended',
    'Part Suspended',
    'Part Closure',
    'Severe Delays',
    'Part Closed',
    'Not Running',
    'No Service'
  ])
    assert.equal(lineAlert(config, hass(state)).severity, 'critical', state);
});

test('names, description, compact label and state normalisation follow the configured sensor without inferring from stale descriptions', () => {
  assert.deepEqual(lineAlert(config, hass(' Minor_Delays ', {Description: '  Signal issue.  '})), {
    entity: 'sensor.demo_line',
    name: 'Example',
    status: 'Minor_Delays',
    severity: 'warning',
    detail: 'Signal issue.',
    short: 'delays'
  });
  assert.equal(
    lineAlert({...config, line_alert_name: '  City line '}, hass('Closed')).name,
    'City line'
  );
  assert.equal(
    lineAlert(config, hass('Closed', {description: 'Partial closure.'})).detail,
    'Partial closure.'
  );
  assert.equal(
    lineAlert(config, hass('Good Service', {Description: 'Old disruption message.'})),
    null
  );
  assert.equal(lineAlert(config, hass('Closed', {friendly_name: undefined})).name, 'demo line');
});

test('configuration is validated and watched even when no matching widget exists', () => {
  for (const value of [undefined, null, '', 'sensor.demo_line'])
    validateLineAlert({line_alert_entity: value});
  for (const value of ['light.demo', {}, ['sensor.demo_line'], 5, 'sensor.foo.bar'])
    assert.throws(() => validateLineAlert({line_alert_entity: value}), {
      message: 'line_alert_entity must be a sensor entity id.'
    });
  assert.throws(() => validateLineAlert({line_alert_name: 5}), {
    message: 'line_alert_name must be text.'
  });
  assert.deepEqual(watchedIds(config), ['sensor.demo_line']);
  assert.deepEqual(watchedIds({...config, line_alert_entity: 'sensor.other'}), ['sensor.other']);
  assert.deepEqual(watchedIds({}), []);
});

test('connection changes invalidate the configured alert without requiring a new sensor state object', () => {
  const card = {_config: config};
  const connected = hass('Minor Delays');
  assert.equal(hassChanged(card, connected), true);
  assert.equal(hassChanged(card, {...connected, connected: false}), true);
  assert.equal(hassChanged(card, {...connected, connected: false}), false);
  assert.equal(hassChanged(card, {...connected, connected: true}), true);
});
