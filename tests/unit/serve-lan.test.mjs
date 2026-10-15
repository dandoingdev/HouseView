// `node tools/serve.mjs --lan` listens on the network, so it must serve only what the performance bench page needs:
// the repository root holds much more than that (sources, tests, package files).
import test from 'node:test';
import assert from 'node:assert/strict';
import {LAN_ALLOWED, startServer} from '../../tools/serve.mjs';

test('the allow list serves the bench page and the bundle and nothing else', async (t) => {
  const srv = await startServer({port: 0, allow: LAN_ALLOWED});
  t.after(() => srv.close());
  const status = async (pathname) => (await fetch(`${srv.url}${pathname}`)).status;
  assert.equal(await status('/tools/perf-bench.html'), 200);
  assert.equal(await status('/camera_proxy/preview.svg'), 200);
  assert.equal(await status('/api/media_player_proxy/media_player.x'), 200);
  for (const hidden of [
    '/package.json',
    '/src/index.js',
    '/tests/browser.html',
    '/tools/perf-bench.mjs',
    '/dist/../package.json',
    '/%2e%2e/package.json'
  ]) {
    assert.equal(await status(hidden), 404, hidden);
  }
});

test('without an allow list (the tests and the local tools) everything under the root is served', async (t) => {
  const srv = await startServer({port: 0});
  t.after(() => srv.close());
  assert.equal((await fetch(`${srv.url}/package.json`)).status, 200);
});

test('it listens on the loopback interface unless asked otherwise', async (t) => {
  const srv = await startServer({port: 0});
  t.after(() => srv.close());
  assert.equal(srv.server.address().address, '127.0.0.1');
});
