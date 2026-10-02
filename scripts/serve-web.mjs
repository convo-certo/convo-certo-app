import { createServer } from 'node:http';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const appRoutes = new Set(['/', '/guide', '/perform', '/step1', '/step2', '/step3', '/step4']);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.musicxml': 'application/vnd.recordare.musicxml+xml',
  '.mxl': 'application/vnd.recordare.musicxml', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mid': 'audio/midi', '.midi': 'audio/midi',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.webmanifest': 'application/manifest+json',
};
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=()',
};

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function inside(root, target) {
  const path = relative(root, target);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\'));
}

function requestPath(url) {
  if (!url?.startsWith('/') || url.startsWith('//')) throw new RequestError(400, 'Bad request');
  let path;
  try { path = decodeURIComponent(url.split('?')[0]); }
  catch { throw new RequestError(400, 'Bad request'); }
  if (/[\\\u0000-\u001f\u007f]/.test(path)) throw new RequestError(400, 'Bad request');
  if (path.split('/').some(segment => segment.startsWith('.'))) throw new RequestError(403, 'Forbidden');
  return path;
}

async function openFile(root, path) {
  const candidate = resolve(root, `.${path}`);
  if (!inside(root, candidate)) throw new RequestError(403, 'Forbidden');
  let canonical;
  try { canonical = await realpath(candidate); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
  if (!inside(root, canonical)) throw new RequestError(403, 'Forbidden');
  const file = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile()) { await file.close(); return null; }
    return { file, info };
  } catch (error) { await file.close(); throw error; }
}

function textResponse(request, response, status, message, headers = {}) {
  const body = `${message}\n`;
  response.writeHead(status, {
    ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...headers,
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

export async function createWebServer({ root = 'build/client' } = {}) {
  const directory = await realpath(resolve(root));
  const index = await openFile(directory, '/index.html');
  if (!index) throw new Error('Build root must contain index.html. Run npm run build first.');
  await index.file.close();

  const serve = async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      textResponse(request, response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
      return;
    }
    let path = requestPath(request.url);
    let opened = await openFile(directory, path);
    if (!opened && appRoutes.has(path.length > 1 ? path.replace(/\/$/, '') : path)) {
      path = '/index.html';
      opened = await openFile(directory, path);
    }
    if (!opened) { textResponse(request, response, 404, 'Not found'); return; }
    const { file, info } = opened;
    const hashed = path.startsWith('/assets/') && /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(path);
    response.writeHead(200, {
      ...securityHeaders,
      'Content-Type': mimeTypes[extname(path).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': extname(path).toLowerCase() !== '.html' && hashed
        ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (request.method === 'HEAD') { await file.close(); response.end(); return; }
    await pipeline(file.createReadStream(), response);
  };

  return createServer({ requestTimeout: 15000, headersTimeout: 15000 }, (request, response) => {
    void serve(request, response).catch(error => {
      if (response.headersSent || response.destroyed) { response.destroy(); return; }
      if (error instanceof RequestError) textResponse(request, response, error.status, error.message);
      else if (error.code === 'ENOENT' || error.code === 'ENOTDIR') textResponse(request, response, 404, 'Not found');
      else if (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'ELOOP') textResponse(request, response, 403, 'Forbidden');
      else textResponse(request, response, 500, 'Unable to serve this file');
    });
  });
}

export function parseOptions(args) {
  const { values } = parseArgs({ args, options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '4173' },
    root: { type: 'string', default: 'build/client' },
    help: { type: 'boolean', short: 'h', default: false },
  } });
  if (!/^\d+$/.test(values.port) || Number(values.port) < 1 || Number(values.port) > 65535) throw new Error('--port must be between 1 and 65535.');
  if (!values.host.trim() || !values.root.trim()) throw new Error('--host and --root must not be empty.');
  return { ...values, port: Number(values.port) };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/serve-web.mjs [--host 127.0.0.1] [--port 4173] [--root build/client]\n\nServes the built web app. Defaults to local access only; HTTPS requires a reverse proxy or hosting service.');
    return;
  }
  const server = await createWebServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });
  const host = options.host.includes(':') ? `[${options.host}]` : options.host;
  console.log(`ConvoCerto web preview: http://${host}:${options.port}\nBuild root: ${resolve(options.root)}\nThis HTTP preview does not publish the app or provide HTTPS.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close();
    setTimeout(() => server.closeAllConnections(), 1000).unref();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Web preview failed: ${error.message}`); process.exitCode = 1; });
}
