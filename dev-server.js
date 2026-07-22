// ============================================================
//  WORKBOOK PROXY SERVER — live SharePoint workbook via Graph
//  Serves this folder over http AND proxies the live workbook
//  from SharePoint via Microsoft Graph so the dashboard shows
//  real-time data.
//
//  Auth (auto-detected):
//   - On Azure App Service (Easy Auth): reads the workbook as the SIGNED-IN
//     USER via the 'X-MS-TOKEN-AAD-ACCESS-TOKEN' header, honouring that user's
//     own @quadranttechnologies.com view access.
//   - Locally: shells out to `az account get-access-token`.
//  No secrets are stored in this file or the repo.
//
//  Config: SHAREPOINT_URL / SHEET_NAME / REFRESH_SECONDS come from
//  .env locally, or App Service application settings in the cloud.
//
//  Run:  node dev-server.js   (listens on PORT, default 5173)
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;
const LIVE_PATH = '/workbook.xlsx';           // path the dashboard fetches
const GRAPH = 'https://graph.microsoft.com/v1.0';

// ---- read SHAREPOINT_URL from .env -------------------------
function readEnv() {
  const env = {};
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    txt.split(/\r?\n/).forEach(line => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const eq = t.indexOf('=');
      if (eq < 1) return;
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    });
  } catch (_) { /* no .env */ }
  // App Service / prod: environment variables override .env
  ['SHAREPOINT_URL', 'SHEET_NAME', 'REFRESH_SECONDS'].forEach(k => { if (process.env[k]) env[k] = process.env[k]; });
  return env;
}
const ENV = readEnv();
const SHARE_URL = ENV.SHAREPOINT_URL;
if (!SHARE_URL) {
  console.error('ERROR: SHAREPOINT_URL not found in .env');
  process.exit(1);
}
// Graph "encode a sharing URL" scheme.
const shareId = 'u!' + Buffer.from(SHARE_URL, 'utf8').toString('base64')
  .replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');

// ---- Graph token -------------------------------------------------
// On Azure App Service (Easy Auth): use the SIGNED-IN USER's Graph token,
//   injected per-request as the 'X-MS-TOKEN-AAD-ACCESS-TOKEN' header, so the
//   workbook is read with that user's own @quadranttechnologies.com access.
// Locally: fall back to your Azure CLI login (cached until near expiry).
let cliTokenCache = { value: null, exp: 0 };
// Read the signed-in user's tokens from the Easy Auth token store. Returns the
// AAD access token plus its expiry, or null if unavailable.
async function readAuthMe(base, cookie) {
  try {
    const r = await fetch(`${base}/.auth/me`, { headers: { Cookie: cookie }, redirect: 'manual' });
    if (!r.ok) return null;
    const data = await r.json();
    const rec = Array.isArray(data)
      ? (data.find(x => (x.provider_name || '').toLowerCase() === 'aad') || data[0])
      : data;
    if (!rec || !rec.access_token) return null;
    return { at: rec.access_token, exp: rec.expires_on ? new Date(rec.expires_on).getTime() : 0 };
  } catch (_) { return null; }
}
async function getToken(req) {
  const h = (req && req.headers) || {};
  // ---- On Azure App Service (Easy Auth): use the SIGNED-IN USER's token ----
  if (process.env.WEBSITE_SITE_NAME) {
    const injected = h['x-ms-token-aad-access-token'];
    const expOn = h['x-ms-token-aad-expires-on'];
    const skew = 120000; // refresh 2 min before expiry
    // Fast path: the injected header token is present and still valid.
    if (injected && expOn && Date.now() < new Date(expOn).getTime() - skew) return injected;
    // Otherwise refresh via the token store (needs the caller's auth cookie).
    const base = 'https://' + (h['x-forwarded-host'] || h.host);
    const cookie = h.cookie || '';
    let me = await readAuthMe(base, cookie);
    if (!me || (me.exp && Date.now() > me.exp - skew)) {
      try { await fetch(`${base}/.auth/refresh`, { headers: { Cookie: cookie }, redirect: 'manual' }); } catch (_) {}
      me = await readAuthMe(base, cookie);
    }
    if (me && me.at) return me.at;
    if (injected) return injected; // last resort (may be expired)
    const e = new Error('no user token available'); e.status = 401; throw e;
  }
  // ---- Local dev: fall back to the Azure CLI login ----
  const now = Date.now();
  if (cliTokenCache.value && now < cliTokenCache.exp - 120000) return cliTokenCache.value;
  const out = execFileSync('az', ['account', 'get-access-token', '--resource',
    'https://graph.microsoft.com', '-o', 'json'], { encoding: 'utf8', shell: true });
  const j = JSON.parse(out);
  cliTokenCache = { value: j.accessToken, exp: new Date(j.expiresOn).getTime() };
  return cliTokenCache.value;
}

// ---- fetch the live workbook (in-memory cached) ------------
// The last workbook bytes + change signature are cached so repeat requests and
// client polls don't re-download from Graph.
//   - Local (single CLI user): within a short TTL we serve straight from cache
//     and skip Graph entirely.
//   - App Service (multi-user Easy Auth): we still make the cheap metadata call
//     on every request so each user's own view access is honoured, but the big
//     content download is skipped whenever the file is unchanged.
const MULTIUSER = !!process.env.WEBSITE_SITE_NAME;
const WB_TTL_MS = 20000; // local fast-path freshness window
let wbCache = { buf: null, etag: null, modified: null, fetchedAt: 0 };

async function getWorkbook(req) {
  const now = Date.now();
  // Local single-user fast path: fresh enough — serve cache, don't touch Graph.
  if (wbCache.buf && !MULTIUSER && now - wbCache.fetchedAt < WB_TTL_MS) return wbCache;
  const token = await getToken(req);
  const headers = { Authorization: 'Bearer ' + token };
  // Cheap metadata call: detects change and (on App Service) authorises the user.
  const metaRes = await fetch(`${GRAPH}/shares/${shareId}/driveItem?$select=lastModifiedDateTime,size`, { headers });
  if (!metaRes.ok) { const err = new Error('meta ' + metaRes.status + ' ' + (await metaRes.text())); err.status = metaRes.status; throw err; }
  const meta = await metaRes.json();
  const etag = `"${meta.lastModifiedDateTime}:${meta.size}"`;
  // Unchanged since last download: reuse cached bytes, just refresh the timestamp.
  if (wbCache.buf && wbCache.etag === etag) { wbCache.fetchedAt = now; return wbCache; }
  // Changed or first load: download the content once, then cache it.
  const contentRes = await fetch(`${GRAPH}/shares/${shareId}/driveItem/content`, { headers });
  if (!contentRes.ok) { const err = new Error('content ' + contentRes.status); err.status = contentRes.status; throw err; }
  const buf = Buffer.from(await contentRes.arrayBuffer());
  wbCache = { buf, etag, modified: meta.lastModifiedDateTime, fetchedAt: now };
  return wbCache;
}

// ---- static file serving -----------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.env': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon'
};
function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(ROOT, path.normalize(rel));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

// ---- server ------------------------------------------------
http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  // Client runtime config. Generated from server env so the browser knows to
  // read the live proxy (/workbook.xlsx) and which sheet to parse. This keeps
  // SHAREPOINT_URL server-side only (never shipped to the browser).
  if (urlPath === '/.env') {
    const body = [
      `SHEET_NAME=${ENV.SHEET_NAME || ''}`,
      `WORKBOOK_URL=${LIVE_PATH}`,
      `REFRESH_SECONDS=${ENV.REFRESH_SECONDS || 45}`
    ].join('\n');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }
  if (urlPath === LIVE_PATH) {
    try {
      const { buf, etag, modified } = await getWorkbook(req);
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { 'ETag': etag, 'Cache-Control': 'no-store' }).end(); return; }
      res.writeHead(200, {
        'Content-Type': MIME['.xlsx'],
        'ETag': etag,
        'Cache-Control': 'no-store'
      });
      res.end(buf);
      console.log(`[live] served workbook (modified ${modified}, ${buf.length} bytes)`);
    } catch (e) {
      console.error('[live] error:', e.message);
      // 401/403 from Graph means the signed-in user cannot see the file/sheet.
      // Return a distinct 403 with a link so the client can prompt to request access.
      if (e.status === 401 || e.status === 403) {
        res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'forbidden', requestAccessUrl: SHARE_URL }));
      } else {
        res.writeHead(502, { 'Content-Type': 'text/plain' }).end('Graph fetch failed: ' + e.message);
      }
    }
    return;
  }
  serveStatic(req, res);
}).listen(PORT, () => {
  const mode = (process.env.WEBSITE_SITE_NAME ? "Easy Auth user token" : "Azure CLI");
  console.log(`\n  Workbook proxy server running on port ${PORT}`);
  console.log(`  Live workbook proxied at:      ${LIVE_PATH}`);
  console.log(`  Graph auth: ${mode}. Ctrl+C to stop.\n`);
  // Warm the cache at boot so the first browser request is instant. Only local
  // (CLI token) — App Service needs a per-user token that isn't available yet.
  if (!MULTIUSER) {
    getWorkbook({ headers: {} })
      .then(w => console.log(`[warm] cached workbook (${w.buf.length} bytes)`))
      .catch(e => console.log('[warm] skipped: ' + e.message));
  }
});
