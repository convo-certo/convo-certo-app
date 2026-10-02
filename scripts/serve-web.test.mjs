import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWebServer, parseOptions } from './serve-web.mjs';

let workspace, root, server, port;
const html = '<!doctype html><html lang="en"><title>ConvoCerto</title></html>';

function get(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'convocerto-web-'));
  root = join(workspace, 'client');
  for (const directory of ['assets', 'audio', 'scores', 'nested']) await mkdir(join(root, directory), { recursive: true });
  for (const [path, body] of Object.entries({
    'index.html': html, 'privacy.html': '<html>Privacy</html>',
    'assets/app-AbcD1234.js': 'console.log("ready")', 'assets/style-12345678.css': 'body{}',
    'assets/note-AbcD1234.html': '<html>Uncached</html>',
    'audio/note.mp3': 'mp3 bytes', 'audio/capture.js': 'worklet',
    'scores/score.musicxml': '<score-partwise/>', 'scores/score.mxl': 'mxl bytes',
    'scores/練習.musicxml': '<score-partwise/>', '.secret': 'private',
  })) await writeFile(join(root, path), body);
  await writeFile(join(workspace, 'outside.txt'), 'outside the build');
  await mkdir(join(workspace, 'outside'));
  await writeFile(join(workspace, 'outside', 'secret.txt'), 'outside directory');
  await symlink(join(workspace, 'outside.txt'), join(root, 'escape.txt'));
  await symlink(join(workspace, 'outside'), join(root, 'escape-directory'));
  await symlink(join(root, 'audio', 'note.mp3'), join(root, 'audio', 'linked.mp3'));
  server = await createWebServer({ root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = server.address().port;
});

after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (workspace) await rm(workspace, { recursive: true, force: true });
});

test('CLI defaults are loopback and overrides are explicit and validated', () => {
  assert.deepEqual(parseOptions([]), { host: '127.0.0.1', port: 4173, root: 'build/client', help: false });
  assert.deepEqual(parseOptions(['--host', '0.0.0.0', '--port=8080', '--root', '/tmp/client']), { host: '0.0.0.0', port: 8080, root: '/tmp/client', help: false });
  for (const args of [['--port', '0'], ['--port', '65536'], ['--port', 'abc'], ['--root', ''], ['--host', ''], ['--unknown'], ['unexpected']]) assert.throws(() => parseOptions(args));
  assert.equal(parseOptions(['-h']).help, true);
});

test('only registered application deep links fall back to uncached HTML', async () => {
  for (const path of ['/', '/index.html', '/guide', '/guide?lang=en', '/guide/', '/perform?view=score&lang=en', '/perform/', '/step1', '/step2', '/step3', '/step4']) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.body, html, path);
    assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(response.headers['cache-control'], 'no-cache');
  }
});

test('missing assets, unknown routes and directories return a real 404', async () => {
  for (const path of ['/audio/missing.mp3', '/scores/missing.musicxml', '/scores/missing.mxl', '/assets/missing.js', '/not-a-route', '/guide/missing', '/guide/missing.js', '/perform/missing', '/nested/', '/assets/', '/privacy']) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.body, 'Not found\n');
    assert.match(response.headers['content-type'], /^text\/plain/);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
});

test('asset MIME types and cache policies distinguish hashed bundles from public files', async () => {
  for (const [path, type, immutable] of [
    ['/assets/app-AbcD1234.js', 'text/javascript; charset=utf-8', true],
    ['/assets/style-12345678.css', 'text/css; charset=utf-8', true],
    ['/assets/note-AbcD1234.html', 'text/html; charset=utf-8', false],
    ['/audio/note.mp3', 'audio/mpeg', false], ['/audio/capture.js', 'text/javascript; charset=utf-8', false],
    ['/scores/score.musicxml', 'application/vnd.recordare.musicxml+xml', false],
    ['/scores/score.mxl', 'application/vnd.recordare.musicxml', false],
  ]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers['content-type'], type);
    assert.equal(response.headers['cache-control'], immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  }
  assert.equal((await get('/privacy.html')).body, '<html>Privacy</html>');
  assert.equal((await get(`/scores/${encodeURIComponent('練習')}.musicxml`)).status, 200);
});

test('HEAD keeps GET headers and omits response bodies for files, deep links and errors', async () => {
  for (const path of ['/guide', '/perform', '/assets/app-AbcD1234.js', '/scores/missing.mxl']) {
    const head = await get(path, 'HEAD');
    const full = await get(path);
    assert.equal(head.status, full.status);
    for (const name of ['content-type', 'content-length', 'cache-control']) assert.equal(head.headers[name], full.headers[name]);
    assert.equal(head.body, '');
    assert.equal(Number(head.headers['content-length']), Buffer.byteLength(full.body));
  }
});

test('raw and encoded traversal, hidden files and symlinks outside the build are refused', async () => {
  for (const path of ['/../outside.txt', '/%2e%2e/outside.txt', '/scores/%2e%2e/%2e%2e/outside.txt', '/scores%2f..%2f..%2foutside.txt', '/.secret', '/escape.txt', '/escape-directory/secret.txt']) {
    const response = await get(path);
    assert.equal(response.status, 403, path);
    assert.equal(response.body, 'Forbidden\n');
  }
  for (const path of ['/%zz', '/%00', '/%5c..%5coutside.txt', '//elsewhere/path']) assert.equal((await get(path)).status, 400, path);
  assert.equal((await get('/audio/linked.mp3')).body, 'mp3 bytes');
  assert.equal((await get('/%252e%252e/outside.txt')).status, 404);
});

test('security headers apply to assets and errors without blocking same-origin microphone use', async () => {
  for (const path of ['/', '/audio/note.mp3', '/absent']) {
    const { headers } = await get(path);
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.match(headers['permissions-policy'], /microphone=\(self\)/);
    assert.equal(headers['access-control-allow-origin'], undefined);
  }
});

test('unsupported HTTP methods return 405 and allowed methods', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await get('/perform', method);
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'GET, HEAD');
  }
});

test('startup rejects a missing build or an index that resolves outside it', async () => {
  await assert.rejects(createWebServer({ root: join(workspace, 'missing') }));
  await assert.rejects(createWebServer({ root: join(root, 'nested') }), /index.html/);
  const unsafe = join(workspace, 'unsafe');
  await mkdir(unsafe);
  await symlink(join(root, 'index.html'), join(unsafe, 'index.html'));
  await assert.rejects(createWebServer({ root: unsafe }), /Forbidden/);
});
