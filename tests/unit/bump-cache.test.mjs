import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bumpDocument, bumpResourceUrl, cacheToken, main} from '../../tools/bump-cache.mjs';

const version = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

test('cache token is the package version plus the first 8 hash characters', () => {
  assert.equal(cacheToken('1.5.0', 'abcdef1234567890'), '1.5.0-abcdef12');
});

test('only the local HouseView module URLs get a new ?v=', () => {
  assert.equal(
    bumpResourceUrl('/local/houseview/houseview.js?v=1.5.0', '1.5.0-abcdef12'),
    '/local/houseview/houseview.js?v=1.5.0-abcdef12'
  );
  assert.equal(
    bumpResourceUrl('/local/houseview/houseview-card.js', '1.5.0-abcdef12'),
    '/local/houseview/houseview-card.js?v=1.5.0-abcdef12'
  );
  assert.equal(
    bumpResourceUrl('/hacsfiles/HouseView/houseview.js?v=1.5.0', '1.5.0-abcdef12'),
    '/hacsfiles/HouseView/houseview.js?v=1.5.0'
  );
  assert.equal(
    bumpResourceUrl('/quizify/static/cards/quizify-host-card.js?v=1.22.0', 'x'),
    '/quizify/static/cards/quizify-host-card.js?v=1.22.0'
  );
});

test('a storage document keeps every other resource and is idempotent', () => {
  const doc = {
    data: {
      items: [
        {id: 'other', url: '/quizify/static/cards/quizify-host-card.js?v=1.22.0', type: 'module'},
        {id: 'hv', url: '/local/houseview/houseview.js?v=1.5.0', type: 'module'}
      ]
    }
  };
  assert.equal(bumpDocument(doc, '1.5.0-abcdef12'), 1);
  assert.equal(doc.data.items[0].url, '/quizify/static/cards/quizify-host-card.js?v=1.22.0');
  assert.equal(doc.data.items[1].url, '/local/houseview/houseview.js?v=1.5.0-abcdef12');
  assert.equal(bumpDocument(doc, '1.5.0-abcdef12'), 0);
});

test('the command writes the bumped storage file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-bump-'));
  const file = path.join(dir, 'houseview.js');
  const storage = path.join(dir, 'lovelace_resources');
  fs.writeFileSync(file, 'bundle');
  fs.writeFileSync(
    storage,
    `${JSON.stringify({
      data: {items: [{id: 'hv', url: '/local/houseview/houseview.js?v=1.0.0', type: 'module'}]}
    })}\n`
  );
  assert.equal(main(['--file', file, '--storage', storage]), 0);
  const saved = JSON.parse(fs.readFileSync(storage, 'utf8'));
  assert.match(
    saved.data.items[0].url,
    new RegExp(
      `^/local/houseview/houseview\\.js\\?v=${version.replaceAll('.', '\\.')}-[0-9a-f]{8}$`
    )
  );
  assert.equal(main(['--file', file, '--storage', storage]), 0);
});
