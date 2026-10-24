'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

function setup(t, { enabled = true, corrupt = false, offline = false, installFails = false } = {}) {
  const calls = [];
  const timers = [];
  const commands = new Map();
  const state = new Map();
  const bytes = Buffer.from('verified VSIX');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const filename = 'vscode-colorize-2.1.0.vsix';
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(['fetch', url]);
    if (offline) throw new Error('offline');
    if (url.endsWith('/releases/latest')) return new Response(JSON.stringify({
      tag_name: 'v2.1.0', assets: [{ name: filename }, { name: 'SHA256SUMS' }]
    }));
    if (url.endsWith('/SHA256SUMS')) return new Response(`${digest}  ${filename}\n`);
    return new Response(corrupt ? 'tampered' : bytes);
  });
  const context = { subscriptions: [], extension: { packageJSON: { version: '2.0.0' } },
    globalStorageUri: '/storage', globalState: { get: (key, fallback) => state.get(key) ?? fallback,
      update: async (key, value) => { state.set(key, value); } } };
  const vscode = {
    workspace: { getConfiguration: () => ({ get: () => enabled }), fs: {
      createDirectory: async (uri) => { calls.push(['mkdir', uri]); },
      writeFile: async (uri, data) => { calls.push(['write', uri, data]); },
      delete: async (uri) => { calls.push(['delete', uri]); }
    } },
    Uri: { joinPath: (...parts) => parts.join('/') },
    window: { showInformationMessage: async (message) => { calls.push(['info', message]); },
      showErrorMessage: async (message) => { calls.push(['error', message]); } },
    commands: { registerCommand: (name, fn) => { commands.set(name, fn); return { dispose() {} }; },
      executeCommand: async (...args) => { calls.push(['command', ...args]); if (installFails) throw new Error('install failed'); } }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/updates'), 'utf8'), {
    module, require: (name) => name === 'vscode' ? vscode : require('../src/release-updater'),
    console: { warn() {} }, Date,
    setTimeout: (fn) => { timers.push(fn); return fn; }, setInterval: (fn) => { timers.push(fn); return fn; },
    clearTimeout() {}, clearInterval() {}
  });
  module.exports.registerUpdates(context);
  return { calls, timers, context, manual: commands.get('colorize.checkForUpdates') };
}

test('manual update installs verified bytes through VS Code and cleans the downloaded file', async (t) => {
  const { calls, manual } = setup(t);
  await manual();
  const write = calls.find(([name]) => name === 'write');
  assert.equal(write[2].toString(), 'verified VSIX');
  assert.deepEqual(calls.find(([name]) => name === 'command'),
    ['command', 'workbench.extensions.installExtension', '/storage/vscode-colorize-2.1.0.vsix']);
  assert.ok(calls.find(([name]) => name === 'delete'));
  assert.match(calls.find(([name]) => name === 'info')[1], /Reload VS Code/);
  const installs = calls.filter(([name]) => name === 'command').length;
  await manual();
  assert.equal(calls.filter(([name]) => name === 'command').length, installs);
});

test('automatic checks obey the daily throttle and user disable setting', async (t) => {
  const first = setup(t);
  await first.timers[0]();
  const count = first.calls.length;
  await first.timers[1]();
  assert.equal(first.calls.length, count);
  const disabled = setup(t, { enabled: false });
  await disabled.timers[0]();
  assert.equal(disabled.calls.length, 0);
  await disabled.manual();
  assert.ok(disabled.calls.some(([name]) => name === 'command'));
});

test('failed verification prevents all file writes and installation', async (t) => {
  const { calls, manual } = setup(t, { corrupt: true });
  await manual();
  assert.equal(calls.some(([name]) => name === 'write' || name === 'command'), false);
  assert.match(calls.find(([name]) => name === 'error')[1], /SHA-256 verification failed/);
});

test('offline automatic checks remain silent and manual checks explain the failure', async (t) => {
  const { calls, manual, timers } = setup(t, { offline: true });
  await timers[0]();
  assert.equal(calls.some(([name]) => name === 'error'), false);
  await manual();
  assert.match(calls.find(([name]) => name === 'error')[1], /offline/);
});

test('installation failures clean up and never claim success', async (t) => {
  const { calls, manual } = setup(t, { installFails: true });
  await manual();
  assert.ok(calls.some(([name]) => name === 'delete'));
  assert.equal(calls.some(([name]) => name === 'info'), false);
  assert.match(calls.find(([name]) => name === 'error')[1], /install failed/);
});

test('disposed update handlers do not start network checks', async (t) => {
  const { calls, context, manual, timers } = setup(t);
  context.subscriptions.forEach((item) => item.dispose());
  await timers[0]();
  await manual();
  assert.equal(calls.length, 0);
});
