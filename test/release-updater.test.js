'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { isNewerVersion, findUpdate, downloadUpdate } = require('../src/release-updater');

const bytes = Buffer.from('test VSIX archive bytes');
const digest = createHash('sha256').update(bytes).digest('hex');
const filename = 'vscode-colorize-2.1.0.vsix';
const release = { tag_name: 'v2.1.0', draft: false, prerelease: false, assets: [{ name: filename }, { name: 'SHA256SUMS' }] };

function releaseFetch(overrides = {}) {
  return async (url) => {
    if (url.endsWith('/releases/latest')) return new Response(JSON.stringify(overrides.release || release));
    if (url.endsWith('/SHA256SUMS')) return new Response(overrides.checksum ?? `${digest}  ${filename}\n`);
    if (url.endsWith(`/${filename}`)) return new Response(overrides.bytes ?? bytes);
    throw new Error(`Unexpected URL: ${url}`);
  };
}

test('compares stable versions numerically without accepting prereleases or downgrades', () => {
  assert.equal(isNewerVersion('2.10.0', '2.9.0'), true);
  assert.equal(isNewerVersion('2.1.1', '2.1.0'), true);
  for (const next of ['2.1.0', '2.0.0', '2.2.0-beta.1', '../3.0.0', '02.2.0']) {
    assert.equal(isNewerVersion(next, '2.1.0'), false, next);
  }
});

test('discovers a stable release and verifies the VSIX bytes before returning them', async () => {
  const fetchImpl = releaseFetch();
  const update = await findUpdate('2.0.0', fetchImpl);
  assert.equal(update.version, '2.1.0');
  assert.equal(update.downloadUrl, `https://github.com/Noums75/colorize-plus/releases/download/v2.1.0/${filename}`);
  assert.deepEqual(await downloadUpdate(update, fetchImpl), bytes);
  assert.equal(await findUpdate('2.1.0', fetchImpl), null);
});

test('ignores drafts, prereleases and invalid tags', async () => {
  for (const changed of [{ draft: true }, { prerelease: true }, { tag_name: 'v2.2.0-beta.1' }, { tag_name: 'unexpected' }]) {
    assert.equal(await findUpdate('2.0.0', releaseFetch({ release: { ...release, ...changed } })), null);
  }
});

test('refuses incomplete or ambiguous release assets', async () => {
  for (const assets of [[], [{ name: filename }], [...release.assets, { name: filename }]]) {
    await assert.rejects(findUpdate('2.0.0', releaseFetch({ release: { ...release, assets } })), /must contain/);
  }
});

test('refuses modified archives, missing checksums and duplicate checksum entries', async () => {
  const update = await findUpdate('2.0.0', releaseFetch());
  await assert.rejects(downloadUpdate(update, releaseFetch({ bytes: Buffer.from('modified') })), /SHA-256 verification failed/);
  await assert.rejects(downloadUpdate(update, releaseFetch({ checksum: `${digest}  other.vsix` })), /missing or ambiguous/);
  await assert.rejects(downloadUpdate(update, releaseFetch({ checksum: `${digest}  ${filename}\n${digest}  ${filename}` })), /missing or ambiguous/);
});

test('reports network, malformed metadata and size errors without treating them as success', async () => {
  await assert.rejects(findUpdate('2.0.0', async () => new Response('', { status: 403 })), /HTTP 403/);
  await assert.rejects(findUpdate('2.0.0', async () => { throw new Error('offline'); }), /offline/);
  await assert.rejects(findUpdate('2.0.0', async () => new Response('{')), SyntaxError);
  await assert.rejects(findUpdate('2.0.0', async () => new Response('x', { headers: { 'content-length': '1048577' } })), /size limit/);
  await assert.rejects(findUpdate('2.0.0', async () => new Response('x'.repeat(1048577))), /size limit/);
});

