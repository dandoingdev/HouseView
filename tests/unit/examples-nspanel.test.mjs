// examples/nspanel.yaml is the public NSPanel Pro dashboard and must stay a valid configuration.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseYaml, findAll} from '../../tools/mini-yaml.mjs';
import '../../src/widgets/index.js';
import '../../src/overviews/index.js';
import {validateConfig} from '../../src/config/validate.js';

test('examples/nspanel.yaml is a four-up square panel with a header and a clock screensaver', () => {
  const text = fs.readFileSync(new URL('../../examples/nspanel.yaml', import.meta.url), 'utf8');
  const doc = parseYaml(text.split(/^---$/m)[0]);
  const card = findAll(doc, (n) => n.type === 'custom:houseview-card')[0];
  const config = validateConfig(card);
  assert.equal(config.tablet_mode, true);
  assert.equal(config.show_header, true);
  assert.equal(config.performance, 'lite');
  assert.equal(config.confirm_mode, 'inline');
  assert.deepEqual(
    config.pages.map((page) => page.name),
    ['Room', 'Scenes', 'Music']
  );
  const on = (name) => config.widgets.filter((widget) => widget.page === name);
  assert.equal(on('Room').length, 4);
  assert.equal(on('Scenes').length, 4);
  assert.equal(on('Music').length, 1);
  assert.equal(on('Music')[0].size, 'large');
  assert.equal(on('Room').find((widget) => widget.type === 'climate').size, 'normal');
  assert.equal(config.screensaver.type, 'clock');
  assert.equal(config.screensaver.face, 'bold');
});
