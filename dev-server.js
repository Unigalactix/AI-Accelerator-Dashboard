// ============================================================
//  LOCAL DEV SERVER — live SharePoint workbook proxy
//  Serves this folder over http AND proxies the live workbook
//  from SharePoint via Microsoft Graph so the dashboard shows
//  real-time data during local testing.
//
//  Auth: uses your existing Azure CLI login (az login). It shells
//  out to `az account get-access-token` for a Graph token — no
//  secrets are stored in this file or the repo.
//
//  Run:  node dev-server.js
//  Then open:  http://localhost:5173
//
//  LOCAL TESTING ONLY. Do not deploy this server.
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

// ---- Graph token via Azure CLI (cached until near expiry) --
let tokenCache = { value: null, exp: 0 };
function getToken() {
  const now = Date.now();
  if (tokenCache.value && now < tokenCache.exp - 120000) return tokenCache.value;
  const out = execFileSync('az', ['account', 'get-access-token', '--resource',
    'https://graph.microsoft.com', '-o', 'json'], { encoding: 'utf8', shell: true });
  const j = JSON.parse(out);
  tokenCache = { value: j.accessToken, exp: new Date(j.expiresOn).getTime() };
  return tokenCache.value;
}

// ---- fetch the live workbook -------------------------------
async function fetchWorkbook() {
  const token = getToken();
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
  if (urlPath === LIVE_PATH) {
    try {
      const { buf, etag, modified } = await fetchWorkbook();
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
  console.log(`\n  Live-data dev server running:  http://localhost:${PORT}`);
  console.log(`  Live workbook proxied at:      ${LIVE_PATH}`);
  console.log(`  Signed in via Azure CLI (Graph token). Ctrl+C to stop.\n`);
});
