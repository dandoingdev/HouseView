import assert from 'node:assert/strict';
import {test} from 'node:test';
import {publishRelease} from '../../tools/publish-release.mjs';
import {RELEASE_FILES} from '../../tools/release.mjs';

function fixture(status, release = {}) {
  const calls = [];
  return {
    calls,
    options: {
      repository: 'example/houseview',
      tag: 'v1.9.0',
      token: 'test-token',
      request: async () => ({ok: status === 200, status, json: async () => release}),
      run: (...args) => calls.push(args)
    }
  };
}

test('a duplicate run leaves a complete published release untouched', async () => {
  const {options, calls} = fixture(200, {
    draft: false,
    assets: RELEASE_FILES.map((name) => ({name, state: 'uploaded'}))
  });
  await publishRelease(options);
  assert.deepEqual(calls, []);
});

test('only a missing release creates the release with the staged assets and notes', async () => {
  const {options, calls} = fixture(404);
  await publishRelease(options);
  assert.deepEqual(calls, [
    [
      'gh',
      [
        'release',
        'create',
        'v1.9.0',
        'dist/release/houseview.js',
        'dist/release/houseview.js.map',
        'dist/release/houseview.js.sha256',
        '--repo',
        'example/houseview',
        '--verify-tag',
        '--title',
        'HouseView 1.9.0',
        '--notes-file',
        'dist/release/NOTES.md'
      ],
      {stdio: 'inherit'}
    ]
  ]);
});

test('prerelease tags keep the prerelease flag', async () => {
  const {options, calls} = fixture(404);
  await publishRelease({...options, tag: 'v2.0.0-beta.1'});
  assert.equal(calls[0][1].at(-1), '--prerelease');
});

test('API errors and network failures cannot be mistaken for a missing release', async () => {
  for (const status of [401, 403, 429, 500]) {
    const {options, calls} = fixture(status);
    await assert.rejects(publishRelease(options), new RegExp(`HTTP ${status}`));
    assert.deepEqual(calls, []);
  }
  const {options, calls} = fixture(404);
  await assert.rejects(
    publishRelease({
      ...options,
      request: async () => {
        throw new Error('network unavailable');
      }
    }),
    /network unavailable/
  );
  assert.deepEqual(calls, []);
});

test('drafts and incomplete uploads require inspection and are never overwritten', async () => {
  for (const release of [
    {draft: true, assets: RELEASE_FILES.map((name) => ({name, state: 'uploaded'}))},
    {draft: false, assets: []},
    {draft: false, assets: RELEASE_FILES.map((name) => ({name, state: 'starter'}))}
  ]) {
    const {options, calls} = fixture(200, release);
    await assert.rejects(publishRelease(options), /draft or has missing assets/);
    assert.deepEqual(calls, []);
  }
});

test('publication failures still fail the run', async () => {
  const {options} = fixture(404);
  await assert.rejects(
    publishRelease({
      ...options,
      run: () => {
        throw new Error('gh exited 1');
      }
    }),
    /gh exited 1/
  );
});
