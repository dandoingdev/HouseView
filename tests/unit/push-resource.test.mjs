import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocketServer} from 'ws';
import {pushResources, socketUrl} from '../../tools/push-resource.mjs';

/** A Home Assistant double: auth, `lovelace/resources`, `lovelace/resources/update`. */
async function homeAssistant({token = 'secret', resources}) {
  const updates = [];
  const server = new WebSocketServer({port: 0});
  await new Promise((resolve) => server.once('listening', resolve));
  server.on('connection', (socket) => {
    socket.send(JSON.stringify({type: 'auth_required'}));
    socket.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (message.type === 'auth') {
        socket.send(
          JSON.stringify({type: message.access_token === token ? 'auth_ok' : 'auth_invalid'})
        );
      } else if (message.type === 'lovelace/resources') {
        socket.send(
          JSON.stringify({id: message.id, type: 'result', success: true, result: resources})
        );
      } else if (message.type === 'lovelace/resources/update') {
        updates.push(message);
        socket.send(JSON.stringify({id: message.id, type: 'result', success: true, result: {}}));
      }
    });
  });
  return {url: `http://127.0.0.1:${server.address().port}`, updates, close: () => server.close()};
}

const resources = [
  {id: 'a', type: 'module', url: '/local/houseview/houseview.js?v=old'},
  {id: 'b', type: 'module', url: '/local/other/thing.js?v=1'},
  {id: 'c', type: 'module', url: '/hacsfiles/card/card.js'}
];

test('socketUrl maps http(s) to ws(s) /api/websocket', () => {
  assert.equal(socketUrl('http://homeassistant.local'), 'ws://homeassistant.local/api/websocket');
  assert.equal(
    socketUrl('https://ha.example.com:8123/'),
    'wss://ha.example.com:8123/api/websocket'
  );
});

test('updates only the HouseView resource and leaves the others alone', async () => {
  const ha = await homeAssistant({resources});
  try {
    const result = await pushResources({url: ha.url, token: 'secret', newToken: '1.6.0-abcd1234'});
    assert.deepEqual(result.updated, ['/local/houseview/houseview.js?v=1.6.0-abcd1234']);
    assert.equal(ha.updates.length, 1);
    assert.equal(ha.updates[0].resource_id, 'a');
    assert.equal(ha.updates[0].res_type, 'module');
  } finally {
    ha.close();
  }
});

test('an up-to-date resource is not updated again, and a dry run updates nothing', async () => {
  const current = [
    {id: 'a', type: 'module', url: '/local/houseview/houseview.js?v=1.6.0-abcd1234'}
  ];
  let ha = await homeAssistant({resources: current});
  try {
    const result = await pushResources({url: ha.url, token: 'secret', newToken: '1.6.0-abcd1234'});
    assert.deepEqual(result, {updated: [], unchanged: [current[0].url]});
    assert.equal(ha.updates.length, 0);
  } finally {
    ha.close();
  }
  ha = await homeAssistant({resources});
  try {
    const result = await pushResources({url: ha.url, token: 'secret', newToken: 'x', dryRun: true});
    assert.equal(result.updated.length, 1);
    assert.equal(ha.updates.length, 0);
  } finally {
    ha.close();
  }
});

test('a refused token is a clear error and nothing is updated', async () => {
  const ha = await homeAssistant({resources});
  try {
    await assert.rejects(
      pushResources({url: ha.url, token: 'wrong', newToken: 'x'}),
      /refused the token/
    );
    assert.equal(ha.updates.length, 0);
  } finally {
    ha.close();
  }
});
