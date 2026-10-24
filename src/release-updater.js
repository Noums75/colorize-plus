'use strict';

const { createHash } = require('node:crypto');

const REPOSITORY = 'Noums75/colorize-plus';
const API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const MAX_VSIX_BYTES = 50 * 1024 * 1024;

function versionParts(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return null;
  return version.split('.').map(Number);
}

function isNewerVersion(candidate, current) {
  const next = versionParts(candidate);
  const installed = versionParts(current);
  if (!next || !installed) return false;
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}

async function download(url, limit, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'colorize-plus', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('Release download exceeds the size limit.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('Release download exceeds the size limit.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function findUpdate(currentVersion, fetchImpl = globalThis.fetch) {
  const release = JSON.parse((await download(API_URL, 1024 * 1024, fetchImpl)).toString('utf8'));
  if (release.draft || release.prerelease || typeof release.tag_name !== 'string') return null;
  const version = release.tag_name.replace(/^v/, '');
  if (!isNewerVersion(version, currentVersion)) return null;
  const filename = `vscode-colorize-${version}.vsix`;
  const names = release.assets?.map((asset) => asset.name) || [];
  if (names.filter((name) => name === filename).length !== 1 || names.filter((name) => name === 'SHA256SUMS').length !== 1) {
    throw new Error('The release must contain one VSIX and its SHA256SUMS file.');
  }
  // Construct trusted repository URLs rather than following URLs from metadata.
  const base = `https://github.com/${REPOSITORY}/releases/download/${release.tag_name}`;
  return { version, filename, downloadUrl: `${base}/${filename}`, checksumUrl: `${base}/SHA256SUMS` };
}

async function downloadUpdate(update, fetchImpl = globalThis.fetch) {
  const checksumText = (await download(update.checksumUrl, 64 * 1024, fetchImpl)).toString('utf8');
  const checksums = checksumText.split(/\r?\n/).map((line) => line.match(/^([a-f0-9]{64}) [ *](.+)$/i))
    .filter((match) => match && match[2] === update.filename);
  if (checksums.length !== 1) throw new Error('The release checksum is missing or ambiguous.');
  const vsix = await download(update.downloadUrl, MAX_VSIX_BYTES, fetchImpl);
  const actual = createHash('sha256').update(vsix).digest('hex');
  if (actual !== checksums[0][1].toLowerCase()) throw new Error('VSIX SHA-256 verification failed; installation cancelled.');
  return vsix;
}

module.exports = { REPOSITORY, isNewerVersion, findUpdate, downloadUpdate };

// This file is also attached to releases as install-colorize.cjs. It needs only
// Node.js and VS Code's `code` command, without cloning or installing npm packages.
async function installFromCommandLine() {
  const { mkdtemp, writeFile, rm } = require('node:fs/promises');
  const { tmpdir } = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  if (typeof globalThis.fetch !== 'function') throw new Error('Please install Node.js 22 or newer.');
  const update = await findUpdate('0.0.0');
  if (!update) throw new Error('No stable release is available.');
  console.log(`Downloading Colorize Plus ${update.version}...`);
  const bytes = await downloadUpdate(update);
  const directory = await mkdtemp(path.join(tmpdir(), 'colorize-plus-'));
  try {
    const filename = path.join(directory, update.filename);
    await writeFile(filename, bytes);
    const windows = process.platform === 'win32';
    // .cmd launchers need a shell on Windows. Reject expansion characters and
    // quote the generated path before passing it to cmd.exe.
    if (windows && /["%!\r\n]/.test(filename)) throw new Error('Please use a temporary directory without quotes, %, or ! in its path.');
    const result = spawnSync(windows ? 'code.cmd' : 'code',
      ['--install-extension', windows ? `"${filename}"` : filename, '--force'],
      { stdio: 'inherit', shell: windows });
    if (result.error || result.status !== 0) {
      throw new Error('VS Code installation failed. Make sure the code command is on PATH, then retry.');
    }
    console.log('Colorize Plus installed. Reload VS Code to activate it.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  installFromCommandLine().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
