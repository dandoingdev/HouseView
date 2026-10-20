// Push the cache-busting ?v= of the HouseView Lovelace resources into a RUNNING Home Assistant.
//
// Usage: node tools/push-resource.mjs --file <houseview.js> [--url http://homeassistant.local] [--dry-run]
//
// Editing .storage/lovelace_resources is not enough: Home Assistant keeps the resources in memory and open dashboards
// keep loading the old URL until it restarts. This asks the running instance through its WebSocket API
// (`lovelace/resources` and `lovelace/resources/update`), so a deploy needs no clicks and no restart.
//
// Credentials: a long-lived access token (Home Assistant profile, Security tab), read from $HA_TOKEN or from the file
// $HA_TOKEN_FILE (default ~/.config/houseview/ha-token). The token is never printed and never written anywhere.
// $HA_URL (or --url) is the instance, default http://homeassistant.local.
// Without a token the script says so and exits 0: the deploy itself has already worked.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bumpResourceUrl, cacheToken, HOUSEVIEW_PATHS} from './bump-cache.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 15000;

/** `ws://host/api/websocket` for an http(s) base URL of Home Assistant. */
export function socketUrl(base) {
  const url = new URL(base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/websocket`;
  url.search = '';
  return url.href;
}

/**
 * Talk to Home Assistant: authenticate, list the resources and update every HouseView one whose URL differs.
 * @param {{url: string, token: string, newToken: string, dryRun?: boolean, WebSocketImpl?: typeof WebSocket}} options
 * @returns {Promise<{updated: string[], unchanged: string[]}>}
 */
export function pushResources({url, token, newToken, dryRun = false, WebSocketImpl = globalThis.WebSocket}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocketImpl(socketUrl(url));
    const updated = [];
    const unchanged = [];
    let nextId = 0;
    let pending = 0;
    let listed = false;
    const timer = setTimeout(
      () => fail(new Error('timed out talking to Home Assistant')),
      TIMEOUT_MS
    );
    const send = (message) => socket.send(JSON.stringify({id: ++nextId, ...message}));
    const finish = (value) => {
      clearTimeout(timer);
      socket.close();
      resolve(value);
    };
    const fail = (error) => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // already closed
      }
      reject(error);
    };

    socket.addEventListener('error', () => fail(new Error(`could not reach ${socketUrl(url)}`)));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'auth_required') {
        socket.send(JSON.stringify({type: 'auth', access_token: token}));
      } else if (message.type === 'auth_invalid') {
        fail(new Error('Home Assistant refused the token (auth_invalid)'));
      } else if (message.type === 'auth_ok') {
        send({type: 'lovelace/resources'});
      } else if (message.type === 'result') {
        if (!message.success) {
          fail(new Error(`Home Assistant error: ${message.error?.message || 'request failed'}`));
        } else if (!listed) {
          listed = true;
          for (const item of message.result || []) {
            const next = bumpResourceUrl(item.url, newToken);
            if (!HOUSEVIEW_PATHS.includes(String(item.url).split('?')[0])) continue;
            if (next === item.url) {
              unchanged.push(next);
              continue;
            }
            updated.push(next);
            if (dryRun) continue;
            pending++;
            send({
              type: 'lovelace/resources/update',
              resource_id: item.id,
              res_type: item.type || 'module',
              url: next
            });
          }
          if (!pending) finish({updated, unchanged});
        } else if (--pending === 0) {
          finish({updated, unchanged});
        }
      }
    });
  });
}

function option(args, name) {
  const hit = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (hit < 0) return undefined;
  return args[hit].includes('=') ? args[hit].slice(name.length + 3) : args[hit + 1];
}

/** The access token from the environment or the token file; undefined when there is none. */
export function readToken(env = process.env) {
  if (env.HA_TOKEN?.trim()) return env.HA_TOKEN.trim();
  const file = env.HA_TOKEN_FILE || path.join(os.homedir(), '.config', 'houseview', 'ha-token');
  try {
    return fs.readFileSync(file, 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const file = option(argv, 'file');
  if (!file || !fs.existsSync(file)) {
    console.error('push-resource: --file <houseview.js> is required and must exist');
    return 2;
  }
  const token = readToken(env);
  if (!token) {
    console.log(
      'push-resource: no token, so the running Home Assistant was not told. Create a long-lived access token ' +
        '(profile > Security) and save it to ~/.config/houseview/ha-token, or set HA_TOKEN.'
    );
    return 0;
  }
  const version = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
  const newToken = cacheToken(
    version,
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  );
  try {
    const {updated, unchanged} = await pushResources({
      url: option(argv, 'url') || env.HA_URL || 'http://homeassistant.local',
      token,
      newToken,
      dryRun: argv.includes('--dry-run')
    });
    for (const url of updated)
      console.log(`push-resource: ${argv.includes('--dry-run') ? 'would set' : 'set'} ${url}`);
    for (const url of unchanged) console.log(`push-resource: already ${url}`);
    if (!updated.length && !unchanged.length) {
      console.error('push-resource: Home Assistant has no /local/houseview resource');
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(`push-resource: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
