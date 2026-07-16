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
async function getToken(req) {
  const userTok = req && req.headers && req.headers['x-ms-token-aad-access-token'];
  if (userTok) return userTok;
  const now = Date.now();
  if (cliTokenCache.value && now < cliTokenCache.exp - 120000) return cliTokenCache.value;
  const out = execFileSync('az', ['account', 'get-access-token', '--resource',
    'https://graph.microsoft.com', '-o', 'json'], { encoding: 'utf8', shell: true });
  const j = JSON.parse(out);
  cliTokenCache = { value: j.accessToken, exp: new Date(j.expiresOn).getTime() };
  return cliTokenCache.value;
}

// ---- fetch the live workbook -------------------------------
async function fetchWorkbook(req) {
  const token = await getToken(req);
  const headers = { Authorization: 'Bearer ' + token };
  // metadata (for the change signature) + content
  const metaRes = await fetch(`${GRAPH}/shares/${shareId}/driveItem?$select=lastModifiedDateTime,size`, { headers });
  if (!metaRes.ok) throw new Error('meta ' + metaRes.status + ' ' + (await metaRes.text()));
  const meta = await metaRes.json();
  const contentRes = await fetch(`${GRAPH}/shares/${shareId}/driveItem/content`, { headers });
  if (!contentRes.ok) throw new Error('content ' + contentRes.status);
  const buf = Buffer.from(await contentRes.arrayBuffer());
  const etag = `"${meta.lastModifiedDateTime}:${meta.size}"`;
  return { buf, etag, modified: meta.lastModifiedDateTime };
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
      const { buf, etag, modified } = await fetchWorkbook(req);
      if (req.headers['if-none-match'] === etag) { res.writeHead(304).end(); return; }
      res.writeHead(200, {
        'Content-Type': MIME['.xlsx'],
        'ETag': etag,
        'Cache-Control': 'no-store'
      });
      res.end(buf);
      console.log(`[live] served workbook (modified ${modified}, ${buf.length} bytes)`);
    } catch (e) {
      console.error('[live] error:', e.message);
      res.writeHead(502, { 'Content-Type': 'text/plain' }).end('Graph fetch failed: ' + e.message);
    }
    return;
  }
  serveStatic(req, res);
}).listen(PORT, () => {
  const mode = (process.env.WEBSITE_SITE_NAME ? "Easy Auth user token" : "Azure CLI");
  console.log(`\n  Workbook proxy server running on port ${PORT}`);
  console.log(`  Live workbook proxied at:      ${LIVE_PATH}`);
  console.log(`  Graph auth: ${mode}. Ctrl+C to stop.\n`);
});
