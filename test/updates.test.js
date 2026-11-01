'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const HOUR = 3_600_000;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };

function setup(t, options = {}) {
  const calls = [];
  const logs = [];
  const commands = new Map();
  const state = options.state || new Map();
  const files = new Map();
  const tasks = new Map();
  const notices = [];
  const configurationListeners = new Set();
  const sessionListeners = new Set();
  const prefs = { 'updates.checkOnStartup': true, 'updates.checkIntervalHours': 1, 'updates.autoUpdate': true, ...options.prefs };
  const server = { version: '2.1.0', signedIn: true, ...options.server };
  const bytes = Buffer.from('verified VSIX');
  const digest = createHash('sha256').update(bytes).digest('hex');
  let now = Date.UTC(2026, 10, 1, 12);
  let timerId = 0;
  let outputDisposed = false;
  const uri = (scheme, fsPath) => ({ scheme, fsPath });
  const context = { subscriptions: [], extension: { packageJSON: { version: options.currentVersion || '2.0.0' } },
    globalStorageUri: uri(options.userDataStorage ? 'vscode-userdata' : 'file', '/storage'),
    globalState: { get: (key, fallback) => state.get(key) ?? fallback,
      update: async (key, value) => { if (value === undefined) state.delete(key); else state.set(key, value); } } };

  t.mock.method(globalThis, 'fetch', async (url, request) => {
    calls.push(['fetch', url, !!request.headers.Authorization]);
    if (server.stall) return new Promise((resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
    });
    if (server.metadataGate && url.endsWith('/latest')) await server.metadataGate;
    if (server.offline) throw new Error('offline');
    if (server.status) return new Response('', { status: server.status, headers: server.headers });
    if (server.private && (!request.headers.Authorization || server.denied)) return new Response('', { status: 404 });
    if (server.private && request.headers.Authorization === 'Bearer expired-session') return new Response('', { status: 401 });
    if (url.endsWith('/latest')) return new Response(JSON.stringify({ tag_name: `v${server.version}`, assets: [
      { name: `vscode-colorize-${server.version}.vsix`, id: 101 }, { name: 'SHA256SUMS', id: 102 }
    ] }));
    if (url.endsWith('/102')) return new Response(`${digest}  vscode-colorize-${server.version}.vsix\n`);
    if (url.endsWith('/101')) {
      if (server.assetGate) await server.assetGate;
      return new Response(server.corrupt ? 'tampered' : bytes);
    }
    throw new Error('Unexpected API URL');
  });

  const subscribe = (listeners, callback) => { listeners.add(callback); return { dispose: () => listeners.delete(callback) }; };
  const notice = (type, message, actions) => {
    calls.push([type, message, actions]);
    return new Promise((resolve) => notices.push({ message, actions, resolve }));
  };
  const vscode = {
    ProgressLocation: { Notification: 15 },
    authentication: {
      getSession: async (provider, scopes, flags) => {
        calls.push(['auth', provider, Array.from(scopes), { ...flags }]);
        if (flags.createIfNone || flags.forceNewSession) { server.signedIn = true; server.expired = false; }
        return server.signedIn ? { accessToken: server.expired ? 'expired-session' : 'test-session' } : undefined;
      },
      onDidChangeSessions: (callback) => subscribe(sessionListeners, callback)
    },
    workspace: {
      getConfiguration: () => ({ get: (key, fallback) => prefs[key] ?? fallback }),
      onDidChangeConfiguration: (callback) => subscribe(configurationListeners, callback),
      fs: {
        createDirectory: async (directory) => { calls.push(['mkdir', directory]); },
        writeFile: async (file, data) => {
          calls.push(['write', file, data]);
          if (server.writeFails) throw new Error('disk full');
          files.set(file.fsPath, data);
        },
        delete: async (directory, flags) => {
          calls.push(['delete', directory, flags]);
          for (const name of files.keys()) if (name.startsWith(`${directory.fsPath}/`)) files.delete(name);
        }
      }
    },
    Uri: { joinPath: (base, ...parts) => uri(base.scheme, [base.fsPath, ...parts].join('/')),
      file: (fsPath) => uri('file', fsPath), parse: (value) => value },
    env: { openExternal: async (value) => { calls.push(['external', value]); } },
    window: {
      createOutputChannel: () => ({
        appendLine: (message) => { assert.equal(outputDisposed, false); logs.push(message); },
        show: () => { calls.push(['log']); }, dispose: () => { outputDisposed = true; }
      }),
      withProgress: async (flags, callback) => {
        calls.push(['progress-start', flags]);
        try { return await callback({ report: (value) => calls.push(['progress', value.message]) }); }
        finally { calls.push(['progress-end']); }
      },
      showInformationMessage: (message, ...actions) => notice('info', message, actions),
      showErrorMessage: (message, ...actions) => notice('error', message, actions)
    },
    commands: {
      registerCommand: (name, callback) => { commands.set(name, callback); return { dispose: () => commands.delete(name) }; },
      executeCommand: async (...args) => {
        calls.push(['command', ...args]);
        if (server.installGate) await server.installGate;
        if (server.installFails) throw server.installFails;
      }
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/updates'), 'utf8'), {
    module, require: (name) => name === 'vscode' ? vscode : name.startsWith('./') ? require('../src/release-updater') : require(name),
    AbortController, console, Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, delay) => { const id = ++timerId; tasks.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: (id) => tasks.delete(id)
  });
  module.exports.registerUpdates(context);
  const manual = commands.get('colorize.checkForUpdates');
  const dispose = () => context.subscriptions.forEach((item) => item.dispose());
  t.after(dispose);
  return { calls, logs, state, files, server, manual, dispose,
    requests: () => calls.filter(([name]) => name === 'fetch'),
    installs: () => calls.filter(([name, command]) => name === 'command' && command === 'workbench.extensions.installExtension'),
    nextDelay: () => Math.min(...Array.from(tasks.values(), (task) => task.at - now)),
    advance: async (duration) => {
      const target = now + duration;
      for (let count = 0; count < 100; count++) {
        const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) { now = target; return; }
        now = next[1].at; tasks.delete(next[0]); await next[1].callback(); await flush();
      }
      throw new Error('Unexpected timer loop');
    },
    configure: async (values) => {
      Object.assign(prefs, values);
      configurationListeners.forEach((callback) => callback({ affectsConfiguration: (key) => key === 'colorize.updates' }));
      await flush();
    },
    signIn: async () => {
      server.signedIn = true;
      sessionListeners.forEach((callback) => callback({ provider: { id: 'github' } }));
      await flush();
    },
    choose: async (action) => {
      const item = notices.find((entry) => entry.actions.includes(action));
      assert.ok(item, `Expected notification action ${action}`);
      item.resolve(action); await flush();
    },
    showLog: commands.get('colorize.showUpdateLog')
  };
}

test('every launch checks after three seconds even when another window checked today', async (t) => {
  const state = new Map([['updates.lastCheck', Date.now()]]);
  const first = setup(t, { state, currentVersion: '2.1.0' });
  await first.advance(2999);
  assert.equal(first.requests().length, 0);
  await first.advance(1);
  assert.equal(first.requests().length, 1);
  first.dispose();
  const nextWindow = setup(t, { state, currentVersion: '2.1.0' });
  await nextWindow.advance(3000);
  assert.equal(nextWindow.requests().length, 1);
});

test('hourly checks have no daily throttle and the interval can be changed live', async (t) => {
  const s = setup(t, { currentVersion: '2.1.0' });
  await s.advance(3000);
  await s.advance(HOUR);
  assert.equal(s.requests().length, 2);
  await s.configure({ 'updates.checkIntervalHours': 3 });
  await s.advance(1000);
  assert.equal(s.nextDelay(), 3 * HOUR);
});

test('startup and periodic checks can be disabled independently without disabling the manual command', async (t) => {
  const s = setup(t, { prefs: { 'updates.checkOnStartup': false, 'updates.checkIntervalHours': 0 } });
  await s.advance(24 * HOUR);
  assert.equal(s.requests().length, 0);
  await s.manual();
  assert.equal(s.installs().length, 1);
  assert.equal(s.nextDelay(), Infinity);
});

test('turning off automatic installation still checks and notifies once per version', async (t) => {
  const s = setup(t, { prefs: { 'updates.autoUpdate': false } });
  await s.advance(3000);
  await s.advance(HOUR);
  assert.equal(s.requests().length, 2);
  assert.equal(s.installs().length, 0);
  assert.equal(s.calls.filter(([type, message]) => type === 'info' && message.includes('is available')).length, 1);
  await s.choose('Install update');
  assert.equal(s.installs().length, 1);
});

test('manual installation reports progress, preserves verified bytes and cleans a unique directory', async (t) => {
  const s = setup(t);
  await s.manual();
  const write = s.calls.find(([name]) => name === 'write');
  assert.equal(write[2].toString(), 'verified VSIX');
  assert.match(s.installs()[0][2].fsPath, /^\/storage\/update-[\da-f-]+\/vscode-colorize-2\.1\.0\.vsix$/);
  assert.equal(s.installs()[0][2].scheme, 'file');
  assert.equal(s.files.size, 0);
  assert.deepEqual(s.calls.filter(([name]) => name === 'progress').map((call) => call[1]), [
    'Checking the latest GitHub release…', 'Downloading and verifying 2.1.0…', 'Installing 2.1.0…'
  ]);
  assert.ok(s.calls.some(([name]) => name === 'progress-end'));
  s.server.version = '2.1.1';
  await s.manual();
  assert.notEqual(s.installs()[0][2].fsPath, s.installs()[1][2].fsPath);
});

test('desktop user-data storage is converted to the file URI accepted by VS Code', async (t) => {
  const s = setup(t, { userDataStorage: true });
  await s.manual();
  assert.equal(s.installs()[0][2].scheme, 'file');
  assert.equal(s.calls.find(([name]) => name === 'delete')[1].scheme, 'vscode-userdata');
});

test('corrupted downloads are never installed or written to storage', async (t) => {
  const s = setup(t, { server: { corrupt: true } });
  await s.manual();
  assert.equal(s.installs().length, 0);
  assert.equal(s.calls.some(([name]) => name === 'write'), false);
  assert.match(s.calls.find(([name]) => name === 'error')[1], /SHA-256 verification failed/);
});

test('failed installations clean up, report string errors and do not record success', async (t) => {
  const s = setup(t, { server: { installFails: 'No Servers' } });
  await s.manual();
  assert.equal(s.files.size, 0);
  assert.equal(s.state.has('updates.lastCheck'), false);
  assert.match(s.calls.find(([name]) => name === 'error')[1], /No Servers/);
  assert.equal(s.calls.some(([name]) => name === 'info'), false);
});

test('storage failures also clean their directory before retrying', async (t) => {
  const s = setup(t, { server: { writeFails: true } });
  await s.manual();
  assert.equal(s.installs().length, 0);
  assert.ok(s.calls.some(([name]) => name === 'delete'));
  assert.equal(s.nextDelay(), 60_000);
});

test('offline checks retry after one, five and fifteen minutes and reset after success', async (t) => {
  const s = setup(t, { server: { offline: true }, currentVersion: '2.1.0' });
  await s.advance(3000);
  assert.equal(s.nextDelay(), 60_000);
  await s.advance(60_000);
  assert.equal(s.nextDelay(), 5 * 60_000);
  await s.advance(5 * 60_000);
  assert.equal(s.nextDelay(), 15 * 60_000);
  assert.equal(s.calls.some(([name]) => name === 'error'), false);
  s.server.offline = false;
  await s.advance(15 * 60_000);
  assert.equal(s.nextDelay(), HOUR);
  assert.ok(s.state.has('updates.lastCheck'));
});

test('manual checks bypass ordinary backoff and expose the error and log', async (t) => {
  const s = setup(t, { server: { offline: true } });
  await s.advance(3000);
  await s.manual();
  assert.equal(s.requests().length, 2);
  assert.match(s.calls.find(([name]) => name === 'error')[1], /offline/);
  await s.choose('Show log');
  assert.ok(s.calls.some(([name]) => name === 'log'));
  assert.ok(s.logs.some((line) => line.includes('offline')));
  assert.equal(s.logs.some((line) => line.includes('test-session')), false);
});

test('GitHub Retry-After is respected by scheduled, manual and restarted checks', async (t) => {
  const state = new Map();
  const s = setup(t, { state, server: { status: 429, headers: { 'retry-after': '120' } } });
  await s.advance(3000);
  assert.equal(s.nextDelay(), 120_000);
  await s.manual();
  assert.equal(s.requests().length, 1);
  s.dispose();
  const restarted = setup(t, { state });
  await restarted.advance(3000);
  assert.equal(restarted.requests().length, 0);
  await restarted.advance(120_000);
  assert.equal(restarted.installs().length, 1);
});

test('unanswered reload and up-to-date notifications never block the next check', async (t) => {
  const s = setup(t);
  await s.manual();
  await s.manual();
  assert.equal(s.installs().length, 1);
  assert.ok(s.calls.some(([type, message]) => type === 'info' && message.includes('Reload VS Code')));
  const count = s.requests().length;
  await s.advance(HOUR);
  assert.equal(s.requests().length, count + 1);
  assert.equal(s.calls.some(([type, command]) => type === 'command' && command === 'workbench.action.reloadWindow'), false);
});

test('a signed-in private repository check reuses GitHub without an anonymous request or prompt', async (t) => {
  const s = setup(t, { server: { private: true } });
  await s.advance(3000);
  assert.equal(s.installs().length, 1);
  assert.ok(s.requests().every((request) => request[2]));
  assert.ok(s.calls.filter(([name]) => name === 'auth').every((call) => call[3].silent));
});

test('missing GitHub access gets one actionable hint per day, without starting interactive sign-in', async (t) => {
  const s = setup(t, { server: { private: true, signedIn: false } });
  await s.advance(3000);
  await s.advance(HOUR);
  assert.equal(s.installs().length, 0);
  assert.ok(s.calls.filter(([name]) => name === 'auth').every((call) => call[3].silent));
  assert.equal(s.calls.filter(([name]) => name === 'info').length, 1);
  await s.choose('Sign in');
  assert.equal(s.installs().length, 1);
  assert.ok(s.calls.some(([name, provider, scopes, flags]) => name === 'auth' && flags.createIfNone));
});

test('a GitHub session change retries the check immediately', async (t) => {
  const s = setup(t, { server: { private: true, signedIn: false } });
  await s.advance(3000);
  await s.signIn();
  assert.equal(s.installs().length, 1);
});

test('manual checks can renew an expired GitHub session, but background checks never force sign-in', async (t) => {
  const s = setup(t, { server: { private: true, expired: true } });
  await s.advance(3000);
  assert.equal(s.installs().length, 0);
  assert.equal(s.calls.some(([name, provider, scopes, flags]) => name === 'auth' && flags.forceNewSession), false);
  await s.manual();
  assert.ok(s.calls.some(([name, provider, scopes, flags]) => name === 'auth' && flags.forceNewSession));
  assert.equal(s.installs().length, 1);
});

test('a manual request during a background check is queued and can explicitly install', async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const s = setup(t, { prefs: { 'updates.autoUpdate': false }, server: { metadataGate: gate } });
  const background = s.advance(3000);
  await flush();
  const manual = s.manual();
  release();
  await Promise.all([background, manual]);
  assert.equal(s.installs().length, 1);
});

test('repeated manual requests share one installation', async (t) => {
  let release;
  const s = setup(t, { server: { installGate: new Promise((resolve) => { release = resolve; }) } });
  const first = s.manual();
  await flush();
  const second = s.manual();
  assert.equal(first, second);
  assert.equal(s.installs().length, 1);
  release();
  await first;
});

test('disabling automatic installation while downloading prevents the installation', async (t) => {
  let release;
  const s = setup(t, { server: { assetGate: new Promise((resolve) => { release = resolve; }) } });
  const background = s.advance(3000);
  await flush();
  await s.configure({ 'updates.autoUpdate': false, 'updates.checkIntervalHours': 0 });
  release();
  await background;
  assert.equal(s.installs().length, 0);
  assert.equal(s.nextDelay(), Infinity);
});

test('deactivation cancels an in-flight request, removes timers and prevents file writes', async (t) => {
  const s = setup(t, { server: { stall: true } });
  const check = s.manual();
  await flush();
  s.dispose();
  await check;
  await s.advance(24 * HOUR);
  assert.equal(s.installs().length, 0);
  assert.equal(s.files.size, 0);
  assert.equal(s.nextDelay(), Infinity);
});

test('disposing before the scheduled startup prevents all requests', async (t) => {
  const s = setup(t);
  s.dispose();
  await s.advance(3000);
  await s.manual();
  assert.equal(s.requests().length, 0);
});

test('the update log command shows diagnostic output without making a network request', async (t) => {
  const s = setup(t);
  s.showLog();
  assert.ok(s.calls.some(([name]) => name === 'log'));
  assert.equal(s.requests().length, 0);
});
