'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Exercise the standalone release asset in another process, without requiring a
// desktop installation or a published release. Network responses and code CLI
// are local fixtures; the actual downloader, checksum and cleanup paths run.
test('standalone installer verifies the download, invokes code and removes temporary files', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'colorize-installer-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const installer = path.join(directory, 'install-colorize.cjs');
  await fs.copyFile(path.join(__dirname, '../src/release-updater.js'), installer);
  const marker = path.join(directory, 'installed.json');
  const preload = path.join(directory, 'network.cjs');
  await fs.writeFile(preload, `
    const { createHash } = require('node:crypto');
    const bytes = Buffer.from('fixture VSIX');
    const name = 'vscode-colorize-2.1.0.vsix';
    globalThis.fetch = async (url) => {
      if (url.endsWith('/releases/latest')) return new Response(JSON.stringify({ tag_name: 'v2.1.0', assets: [{ name }, { name: 'SHA256SUMS' }] }));
      if (url.endsWith('/SHA256SUMS')) return new Response(createHash('sha256').update(bytes).digest('hex') + '  ' + name);
      return new Response(bytes);
    };
  `);
  const cli = path.join(directory, process.platform === 'win32' ? 'code.cmd' : 'code');
  const cliScript = path.join(directory, 'code-fixture.cjs');
  await fs.writeFile(cliScript, `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    fs.writeFileSync(process.env.COLORIZE_TEST_MARKER, JSON.stringify({ args, bytes: fs.readFileSync(args[1], 'utf8') }));
  `);
  if (process.platform === 'win32') {
    await fs.writeFile(cli, `@echo off\r\n"${process.execPath}" "${cliScript}" %*\r\n`);
  } else {
    await fs.writeFile(cli, `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${cliScript.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
  }
  const result = spawnSync(process.execPath, ['--require', preload, installer], {
    env: { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH}`, COLORIZE_TEST_MARKER: marker },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  const installed = JSON.parse(await fs.readFile(marker, 'utf8'));
  assert.equal(installed.args[0], '--install-extension');
  assert.equal(installed.args[2], '--force');
  assert.equal(installed.bytes, 'fixture VSIX');
  await assert.rejects(fs.access(installed.args[1]), { code: 'ENOENT' });
  assert.match(result.stdout, /Reload VS Code/);
});
