// examples/home-overview.yaml goes through the real configuration validation with the real widgets and overviews.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseYaml, findAll} from '../../tools/mini-yaml.mjs';
import '../../src/widgets/index.js';
import '../../src/overviews/index.js';
import {validateConfig} from '../../src/config/validate.js';
import {collect} from '../../src/overviews/home/model.js';

test('examples/home-overview.yaml validates and holds the home overview on the first page', () => {
  const text = fs.readFileSync(
    new URL('../../examples/home-overview.yaml', import.meta.url),
    'utf8'
  );
  const doc = parseYaml(text.split(/^---$/m)[0]);
  const card = findAll(doc, (n) => n.type === 'custom:houseview-card')[0];
  const config = validateConfig(card);
  const [first] = config.widgets;
  assert.equal(first.type, 'home_overview');
  assert.equal(first.title, 'My Home');
  assert.equal(first.page, 'Home');
  const groups = collect(config.widgets);
  assert.ok(groups.light.length && groups.climate.length && groups.lock.length);
  assert.ok(groups.camera.length && groups.scene.length >= 3 && groups.media.length);
});

test('the home overview card needs no entity, takes title and show_time, and rejects a bad option', () => {
  const base = {cards: [{type: 'custom:houseview-home-overview-card'}]};
  assert.equal(validateConfig(base).widgets[0].type, 'home_overview');
  validateConfig({
    cards: [{type: 'custom:houseview-home-overview-card', title: 'X', show_time: false}]
  });
  assert.throws(
    () => validateConfig({cards: [{type: 'custom:houseview-home-overview-card', show_time: 'no'}]}),
    /show_time must be true or false/
  );
  assert.throws(
    () => validateConfig({cards: [{type: 'custom:houseview-home-overview-card', title: 5}]}),
    /title must be text/
  );
});
