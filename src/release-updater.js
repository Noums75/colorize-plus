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

async function download(url, limit, fetchImpl, token, binary = false) {
  const headers = { 'User-Agent': 'colorize-plus', Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json' };
  if (token && new URL(url).origin === 'https://api.github.com') headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) {
    const error = new Error(`GitHub returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
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

async function findUpdate(currentVersion, fetchImpl = globalThis.fetch, token) {
  const release = JSON.parse((await download(API_URL, 1024 * 1024, fetchImpl, token)).toString('utf8'));
  if (release.draft || release.prerelease || typeof release.tag_name !== 'string') return null;
  const version = release.tag_name.replace(/^v/, '');
  if (!isNewerVersion(version, currentVersion)) return null;
  const filename = `vscode-colorize-${version}.vsix`;
  const names = release.assets?.map((asset) => asset.name) || [];
  if (names.filter((name) => name === filename).length !== 1 || names.filter((name) => name === 'SHA256SUMS').length !== 1) {
    throw new Error('The release must contain one VSIX and its SHA256SUMS file.');
  }
  // API assets support private repositories; browser download URLs do not accept
  // API tokens. Build trusted URLs and let fetch strip auth on cross-origin redirects.
  const assetUrl = (name) => {
    const id = release.assets.find((asset) => asset.name === name).id;
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid GitHub release asset ID.');
    return `https://api.github.com/repos/${REPOSITORY}/releases/assets/${id}`;
  };
  return { version, filename, downloadUrl: assetUrl(filename), checksumUrl: assetUrl('SHA256SUMS') };
}

async function downloadUpdate(update, fetchImpl = globalThis.fetch, token) {
  const checksumText = (await download(update.checksumUrl, 64 * 1024, fetchImpl, token, true)).toString('utf8');
  const checksums = checksumText.split(/\r?\n/).map((line) => line.match(/^([a-f0-9]{64}) [ *](.+)$/i))
    .filter((match) => match && match[2] === update.filename);
  if (checksums.length !== 1) throw new Error('The release checksum is missing or ambiguous.');
  const vsix = await download(update.downloadUrl, MAX_VSIX_BYTES, fetchImpl, token, true);
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
  let fetchImpl = globalThis.fetch;
  let update;
  try {
    update = await findUpdate('0.0.0', fetchImpl);
  } catch (error) {
    if (![401, 404].includes(error.status)) throw error;
    // GitHub CLI supplies its own authentication. Never extract its token.
    fetchImpl = async (url, options) => {
      const target = new URL(url);
      if (target.origin !== 'https://api.github.com' || !target.pathname.startsWith(`/repos/${REPOSITORY}/releases/`)) {
        throw new Error('Unexpected GitHub API destination.');
      }
      const result = spawnSync('gh', ['api', target.pathname, '-H', `Accept: ${options.headers.Accept}`],
        { maxBuffer: MAX_VSIX_BYTES + 1, timeout: 60_000 });
      if (result.error || result.status !== 0) {
        throw new Error('This private repository requires GitHub access. Install GitHub CLI, run gh auth login with an account that can read the repository, then retry.');
      }
      return new Response(result.stdout);
    };
    update = await findUpdate('0.0.0', fetchImpl);
  }
  if (!update) throw new Error('No stable release is available.');
  console.log(`Downloading Colorize Plus ${update.version}...`);
  const bytes = await downloadUpdate(update, fetchImpl);
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
