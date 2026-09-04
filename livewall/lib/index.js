// dsh-livewall — Host half.
// Registers the `livewall` user-settings namespace and serves the wallpaper
// asset directory over /bg-assets (GET/HEAD/Range, PUT upload, whitelist,
// traversal guard). No harness source files are modified.
'use strict';
import { readdirSync, statSync, createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { homedir } from 'node:os';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';

export const NAMESPACE = 'livewall';
export const NS = settingsNamespace(NAMESPACE);
export const ROUTE_PREFIX = '/bg-assets';

// Default asset dir is resolved from the environment at runtime so the
// package carries no machine-specific paths:
//    > \bg-assets > <home>\.dsh\bg-assets
export const DEFAULT_ASSET_DIR = (process.env.DSH_LIVEWALL_ASSET_DIR
  || (process.env.DSH_HOME ? join(process.env.DSH_HOME, 'bg-assets') : '')
  || join(homedir(), '.dsh', 'bg-assets'));
const ASSET_EXT = new Set(['.mp4', '.webm', '.mov', '.gif', '.apng', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.bmp']);
const MIME = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/mp4',
  '.gif': 'image/gif', '.apng': 'image/apng', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.svg': 'image/svg+xml', '.bmp': 'image/bmp'
};

// Livewall settings schema (settings.yaml namespace).
export const schema = z.object({
  enabled: z.boolean().default(false),
  presetId: z.string().default('off'),
  assetDir: z.string().default(DEFAULT_ASSET_DIR),
  params: z.dict(z.any()).default({}),
  source: z.string().default(''),
  sourceKind: z.string().default('')
});

// Normalize a user-supplied path: strip surrounding quotes and trailing
// (back)slashes so pasted values like '"D:\bg\"' behave as D:\bg.
function cleanDir(p) {
  if (typeof p !== 'string') return '';
  let out = p.trim();
  out = out.replace(/^"+|"+$/g, '');
  out = out.replace(/[\\/]+$/g, '');
  return out;
}

// Resolve the effective asset dir: user override > entry base config > default.
function resolveAssetDir(settingsSection, entryConfig) {
  const userDir = settingsSection && typeof settingsSection.assetDir === 'string'
    ? cleanDir(settingsSection.assetDir)
    : '';
  const baseDir = entryConfig && typeof entryConfig.assetDir === 'string'
    ? cleanDir(entryConfig.assetDir)
    : '';
  return userDir || baseDir || DEFAULT_ASSET_DIR;
}

function fail(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(message);
  return undefined;
}

// Serve one asset file from dir, supporting Range for smooth video looping.
function serveFile(req, res, filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  let stat;
  try { stat = statSync(filePath); } catch { return fail(res, 404, 'not found'); }
  const total = stat.size;
  const send = (status, headers, stream) => {
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    stream(res);
  };
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (!Number.isFinite(start)) start = 0;
      if (!Number.isFinite(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        res.end();
        return;
      }
      send(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store'
      }, (r) => createReadStream(filePath, { start, end }).pipe(r));
      return;
    }
  }
  send(200, {
    'Content-Type': type,
    'Content-Length': total,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  }, (r) => createReadStream(filePath).pipe(r));
}

const MAX_UPLOAD = 1024 * 1024 * 512; // 512 MB cap for wallpaper media

// Accept a PUT /bg-assets/upload?name=<file> body and write it into dir.
function serveUpload(req, res, dir) {
  const url = new URL(req.url, 'http://localhost');
  const name = (url.searchParams.get('name') || '').split(/[\\/]/).pop() || '';
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (!name || name.startsWith('.') || !ASSET_EXT.has(ext)) {
    fail(res, 400, 'bad file name or extension');
    return;
  }
  const dest = join(dir, name);
  if (normalize(dest) !== dest) { fail(res, 400, 'bad path'); return; }
  try { mkdirSync(dir, { recursive: true }); } catch (e) { fail(res, 500, 'cannot create asset dir: ' + String(e && e.message || e)); return; }
  const out = createWriteStream(dest, { flags: 'w' });
  let ended = false;
  const done = (status, text) => {
    if (ended) return;
    ended = true;
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(text);
  };
  req.on('data', (chunk) => {
    if (!ended && out.bytesWritten + chunk.length > MAX_UPLOAD) {
      out.destroy();
      done(413, 'file too large (max 512MB)');
    }
  });
  out.on('error', (e) => done(500, 'write failed: ' + String(e && e.message || e)));
  out.on('finish', () => done(200, 'ok ' + name));
  req.pipe(out);
}

// List asset files for the settings page asset manager.
function serveList(req, res, dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    fail(res, 500, 'asset dir missing: ' + dir);
    return;
  }
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => {
      const name = e.name;
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      if (!ASSET_EXT.has(ext)) return null;
      try {
        const st = statSync(join(dir, name));
        const kind = ext === '.mp4' || ext === '.webm' || ext === '.mov' ? 'video' : 'image';
        return { name, size: st.size, kind };
      } catch { return null; }
    })
    .filter(Boolean);
  const body = JSON.stringify({ ok: true, dir, files });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

/**
 * Cordis plugin body (host). Receives the entry config (the `config` object
 * from the cordis.patch.yml row) as the second argument — the same calling
 * convention shipped host plugins use.
 * @param ctx Host context.
 * @param config Row-level entry config, e.g. { assetDir }.
 */
export function apply(ctx, config) {
  const entryConfig = (config && typeof config === 'object') ? config : {};
  // Register the durable settings section when the settings service composes.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NS, schema);
  });

  // Register the /bg-assets route when the webserver composes.
  ctx.inject(['webServer'], (serverCtx) => {
    serverCtx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const p = decodeURIComponent(url.pathname);
        if (!(req.method === 'GET' || req.method === 'HEAD' || req.method === 'PUT')) {
          res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('method not allowed');
          return;
        }
        const rest = p.slice(ROUTE_PREFIX.length);
        const dir = resolveAssetDir(readSettings(serverCtx), entryConfig);
        if (rest === '/list') {
          serveList(req, res, dir);
          return;
        }
        if (rest === '/upload') {
          if (req.method !== 'PUT') { fail(res, 405, 'use PUT'); return; }
          serveUpload(req, res, dir);
          return;
        }
        if (rest === '/' || rest === '') {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('dsh-livewall /bg-assets (ok)\n');
          return;
        }
        // Filename must be a plain basename: no slashes, no traversal.
        const name = rest.replace(/^\/+/, '');
        if (!name || name.includes('/') || name.includes('\\') || name === '..' || name.startsWith('.')) {
          fail(res, 400, 'bad asset name');
          return;
        }
        try { mkdirSync(dir, { recursive: true }); } catch { /* host may not be able to; fall through */ }
        if (!existsSync(dir)) {
          fail(res, 404, 'asset dir missing: ' + dir);
          return;
        }
        const filePath = normalize(join(dir, name));
        if (filePath !== join(dir, name)) { fail(res, 400, 'bad path'); return; }
        const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
        if (!ASSET_EXT.has(ext)) { fail(res, 403, 'extension not allowed'); return; }
        serveFile(req, res, filePath);
      }
    });
  });
}

// Read the livewall user-settings section if the settings service exists.
function readSettings(ctx) {
  try {
    const settings = ctx.get('settings');
    if (!settings) return undefined;
    return settings.get(NS);
  } catch { return undefined; }
}

export default { apply, schema, NAMESPACE, NS, ROUTE_PREFIX, DEFAULT_ASSET_DIR };
