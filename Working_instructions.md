# AI Accelerator Dashboard — Working Instructions

This document is the end-to-end operator guide for the **AI Accelerator Dashboard**. It explains
what the app is, how it is built, how it authenticates, how live data flows from SharePoint, and
exactly how it is deployed and updated on **Azure App Service**. It is written so that someone who
has never touched this project can run, modify, and redeploy it confidently.

> **Audience:** whoever inherits this project. Read the whole file once before making changes.

---

## 1. What this app is

A single-page **leadership dashboard** for the AI Accelerator / Agent portfolio. It reads an Excel
workbook (the *Asset Register*) stored in **SharePoint Online** and renders live KPIs, composition
charts, governance flags, and a filterable / sortable asset table.

Design principles:

- **No build step, no framework.** The dashboard is vanilla HTML + CSS + JavaScript in
  `index.html`, with authentication UI split into `login.html` and `js/auth.js`. **SheetJS**
  (loaded from a CDN) parses the workbook.
- **A tiny zero-dependency Node.js proxy** (`dev-server.js`) serves the page and fetches the live
  workbook from SharePoint through **Microsoft Graph**, so the browser never sees secrets and never
  hits CORS.
- **Themed in Quadrant Technologies brand colors** (purple / magenta gradient masthead, Power BI
  style KPI tiles, animated background).

### Files in this repo

| File | Purpose |
|------|---------|
| `index.html` | The entire dashboard — HTML + CSS + JS in one file, plus an embedded fallback data snapshot. |
| `login.html` | Standalone branded login page. Shows the active Azure CLI account locally and uses App Service Easy Auth endpoints in Azure. |
| `js/auth.js` | Dashboard session check, Entra profile display, manual logout, and automatic logout after one hour of inactivity. |
| `quadrant-logo.png` | Quadrant Technologies logo displayed on the login page. |
| `dev-server.js` | Zero-dependency **Node.js** proxy server. Serves the folder and proxies the live workbook via **Microsoft Graph** at `/workbook.xlsx`. Also generates a safe client config at `/.env`. |
| `package.json` | Node metadata + `start` script (`node dev-server.js`). Engines: Node >= 20. |
| `.env` | **Local-only** runtime config (git-ignored, untracked). Holds `SHAREPOINT_URL`, `SHEET_NAME`, `REFRESH_SECONDS`. |
| `README.md` | Older notes describing a GitHub Pages variant (see §11 — the live app uses Azure App Service, not Pages). |
| `Working_instructions.md` | This document. |
| `app.zip` | Deploy artifact (git-ignored). Contains `index.html`, `login.html`, `js/auth.js`, `quadrant-logo.png`, the **production** `dev-server.js`, and `package.json`. Kept in sync after web-asset changes (see §8.4); only deployed when explicitly asked. |
| `AI_Accelerator_Dashboard_Files.zip` | Full project snapshot distributed via Azure Blob (`aiacceldash`). Sensitive (bundles `.env`); container public access disabled. |

> **Important:** `.env` and `app.zip` are git-ignored. Never commit secrets. In the cloud, config
> comes from **App Service application settings**, not from `.env`.

---

## 2. Architecture at a glance

```
Someone edits the Asset Register workbook in SharePoint Online
      │
      ▼
User opens the dashboard URL (Azure App Service)
  │  Easy Auth requires Microsoft Entra ID sign-in
  │  before protected application files are returned
      ▼
Browser loads index.html + js/auth.js, then fetches:
   • GET /.auth/me      → user name/email claims for the profile control
   • GET /.env          → server returns SHEET_NAME, WORKBOOK_URL=/workbook.xlsx, REFRESH_SECONDS
   • GET /workbook.xlsx → dev-server.js proxies the live file via Microsoft Graph
      │
      ▼
dev-server.js reads the workbook using the SIGNED-IN USER's Graph token
   (injected by Easy Auth as the X-MS-TOKEN-AAD-ACCESS-TOKEN request header)
      │
      ▼
SheetJS parses the sheet named SHEET_NAME → dashboard renders live KPIs & charts
      │  (re-checks every REFRESH_SECONDS)
      ▼
If the workbook can't be read → dashboard shows the embedded snapshot baked into index.html
```

`login.html` is the editable branded login experience. It is used directly for local development.
In the current production configuration, ARM-managed Easy Auth protects every static path, so an
anonymous request is challenged by Microsoft Entra ID before `login.html` can render. The file is
deployed for authenticated/sign-out flows and future file-based Easy Auth configuration.

**Key idea:** each signed-in user reads the workbook with **their own**
Microsoft Graph token. So *signing in is not the same as seeing data* — a user only sees rows if the
SharePoint file is shared with them. An org-wide sharing link = every domain user can see it; a
"specific people" share = only those users.

---

## 3. Azure resources

| Thing | Value |
|-------|-------|
| **Azure App Service** (Web App) name | `ai-accelerator-dashboard` |
| Public URL | `https://ai-accelerator-dashboard-cyhgc2f3axg3bgau.westus-01.azurewebsites.net` |
| Kudu / SCM site | `https://ai-accelerator-dashboard-cyhgc2f3axg3bgau.scm.westus-01.azurewebsites.net` |
| OS / Runtime | Linux, **Node 22 LTS** |
| **Azure App Service Plan** | `SKU` — `B1` (Basic), West US |
| **Azure Resource Group** | `AI_Governance_RG` (West US). All resources were moved here from the old `MSSA_DataAgent_POC`. |
| **Azure Storage account** | `aiacceldash` (hosts the distributed `AI_Accelerator_Dashboard_Files.zip`) |
| **Azure Application Insights** | `ai-accelerator-dashboard` |
| Startup command | `node dev-server.js` |
| **Microsoft Entra ID** tenant | Quadrant Technologies — `0eadb77e-42dc-47f8-bbe3-ec2395e0712c` |
| **Azure subscription** | `Project-AI` — `36710d9e-2ce6-4c69-a8ce-52501abd6c10` |
| Deploy account | `rajesh.kodaganti@quadranttechnologies.com` (**Contributor** on `AI_Governance_RG`) |
| Easy Auth app registration (client ID) | `2e037e64-e05c-4b7b-88e6-52975be7a763` |

> ⚠️ **Subscription gotcha:** the deploy account also has access to another subscription
> ("Microsoft Partner Network"), which is the **default** after `az login`. You **must** switch to
> `Project-AI` before deploying:
> ```powershell
> az account set --subscription 36710d9e-2ce6-4c69-a8ce-52501abd6c10
> ```

---

## 4. Authentication & authorization

### 4.1 Azure App Service Authentication ("Easy Auth")
- Configured with **Microsoft Entra ID** as the identity provider (app registration client ID
  `2e037e64-e05c-4b7b-88e6-52975be7a763`).
- Requires every visitor to sign in with a `@quadranttechnologies.com` account before protected
  application files load.
- On each request, Easy Auth injects the user's Microsoft Graph access token as the
  `X-MS-TOKEN-AAD-ACCESS-TOKEN` HTTP header. `dev-server.js` reads that header to call Graph **as the
  user**.
- Admin consent for the required **delegated** Microsoft Graph scopes was granted tenant-wide.
- `js/auth.js` reads `/.auth/me` to show the signed-in user's initials, display name, and email in
  the dashboard masthead. **Sign out** calls `/.auth/logout`.
- Keyboard, pointer, touch, wheel, and scroll activity reset a one-hour inactivity deadline. When
  the deadline expires, the app signs out through Easy Auth.

> **Branded pre-login limitation:** ARM-managed Easy Auth currently reports
> `requireAuthentication=true`, `RedirectToLoginPage`, and no persisted `excludedPaths`. Attempts
> to add exclusions for `login.html` are normalized away by the service. Do not switch the whole
> app to anonymous access because `index.html` embeds portfolio data. A production branded
> pre-login page requires a separately reviewed **file-based Easy Auth configuration**.

### 4.2 Local development auth
- There is no Easy Auth locally, so `dev-server.js` falls back to the **Azure CLI** token:
  it shells out to `az account get-access-token --resource https://graph.microsoft.com`.
- The local server exposes a safe Easy Auth-compatible `/.auth/me` response containing only the
  active user's display name and email; the Azure CLI token is never sent to the browser.
- Opening `/` without a local preview session redirects to `login.html`. Select **Continue to
  dashboard** to create the tab-scoped preview session and display that profile in the masthead.
- Manual logout and the one-hour inactivity timeout clear the local session and return to
  `login.html`.

### 4.3 Data visibility
- Reading the workbook uses **delegated** Graph permissions (the signed-in user's own access).
- If a user is signed in but sees no data, check that the **SharePoint file is shared** with them.

---

## 5. Configuration

### 5.1 Local config — `.env` (git-ignored)
```dotenv
# Sharing link to the SharePoint workbook (server-side only — never sent to the browser)
SHAREPOINT_URL=https://netorgft1145305.sharepoint.com/:x:/s/AzureCloudPractice/IQBHSNsPmGiMT5pCk6HOtpVoAZoxrfbNWOo3OLjQlpyaMYg

# The sheet/tab inside the workbook to read
SHEET_NAME=Accelerator Inventory

# How often the dashboard re-checks for new data (seconds)
REFRESH_SECONDS=45
```

### 5.2 Cloud config — App Service application settings
These are set on the **Azure App Service** (Configuration → Application settings). They override /
replace `.env` in the cloud:

| Setting | Purpose |
|---------|---------|
| `SHAREPOINT_URL` | Sharing link to the workbook (server-side only). |
| `SHEET_NAME` | `Accelerator Inventory` — the tab to parse. |
| `REFRESH_SECONDS` | `45`. |
| `MICROSOFT_PROVIDER_AUTHENTICATION_SECRET` | Easy Auth client secret (managed by Auth config). |
| `WEBSITE_AUTH_AAD_ALLOWED_TENANTS` | Restricts sign-in to the Quadrant tenant. |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` — we ship ready-to-run files, no server build. |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~22`. |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | **Azure Application Insights** telemetry (if enabled). |

> **Why `SHAREPOINT_URL` is never in `/.env` output:** the server only exposes `SHEET_NAME`,
> `WORKBOOK_URL=/workbook.xlsx`, and `REFRESH_SECONDS` to the browser. The SharePoint link stays
> server-side so it is never leaked to clients.

---

## 6. The server (`dev-server.js`) — how it works

- **`readEnv()`** — parses `.env`, then overrides `SHAREPOINT_URL` / `SHEET_NAME` / `REFRESH_SECONDS`
  from process environment variables (so App Service settings win in the cloud).
- **`shareId`** — encodes `SHAREPOINT_URL` into Microsoft Graph's `u!`-prefixed base64 sharing token.
- **`getToken(req)`** — returns the Easy Auth user token from `X-MS-TOKEN-AAD-ACCESS-TOKEN` if present;
  otherwise falls back to a cached Azure CLI token (local dev).
- **`getLocalProfile(req)`** — local-only Microsoft Graph `/me` lookup used to return basic account
  claims without exposing the Azure CLI token.
- **`fetchWorkbook(req)`** — calls Microsoft Graph:
  - `GET /shares/{shareId}/driveItem?$select=lastModifiedDateTime,size` (metadata → ETag)
  - `GET /shares/{shareId}/driveItem/content` (the actual `.xlsx` bytes)
- **Routes:**
  - `GET /.auth/me` → locally returns the active Azure CLI user's basic profile claims. On Azure,
    this route is owned by Easy Auth.
  - `GET /.env` → returns safe client config (`SHEET_NAME`, `WORKBOOK_URL=/workbook.xlsx`, `REFRESH_SECONDS`).
  - `GET /workbook.xlsx` → the live proxied workbook (supports `ETag` / `304 Not Modified`).
  - everything else → static file serving from the folder (with a path-traversal guard).
- **Port:** `process.env.PORT || 5173`. App Service supplies `PORT`; locally it defaults to 5173.

---

## 7. Run locally

Prerequisites: **Node.js >= 20** and the **Azure CLI** (`az`), signed in to the Quadrant tenant.

```powershell
# 1. Go to the project folder
cd "C:\Users\v-rkodaganti\OneDrive - Microsoft\Dev\Quadrant Technologies\AI Accelerator Dashboard"

# 2. Sign in so the server can get a Graph token for live data
az login --tenant 0eadb77e-42dc-47f8-bbe3-ec2395e0712c

# 3. Make sure .env exists (see §5.1) with SHAREPOINT_URL / SHEET_NAME / REFRESH_SECONDS

# 4. Start the server
node dev-server.js       # or: npm start
```

Open `http://localhost:5173/`. A new tab/session first opens `login.html`, showing the active Azure
CLI account. Select **Continue to dashboard**. The profile appears in the dashboard masthead, and
the server logs `[live] served workbook ...` each time it proxies the file. If the workbook can't
be read, the page falls back to the embedded snapshot.

> Do not double-click `index.html` (the `file://` scheme blocks fetching `/.env` and `/workbook.xlsx`).
> Always go through the server.

---

## 8. Deploy to Azure App Service

Deployment is a **zip deploy** of six entries: `index.html`, `login.html`, `js/auth.js`,
`quadrant-logo.png`, the production `dev-server.js`, and `package.json`.

### 8.1 One-time prerequisites
- **Azure CLI** installed and logged in.
- Access to subscription `Project-AI` with rights to deploy the Web App.

### 8.2 Full deploy procedure (copy/paste)

```powershell
# 0. Be in the project folder
cd "C:\Users\v-rkodaganti\OneDrive - Microsoft\Dev\Quadrant Technologies\AI Accelerator Dashboard"

# 1. Log in (device code avoids interactive-window issues). Do NOT pipe this command.
az login --tenant 0eadb77e-42dc-47f8-bbe3-ec2395e0712c --use-device-code

# 2. Select the CORRECT subscription (login often defaults to the wrong one)
az account set --subscription 36710d9e-2ce6-4c69-a8ce-52501abd6c10

# 3. Confirm identity + subscription
az account show --query "{user:user.name, sub:name, id:id}" -o json

# 4. Sanity-check source scripts
node --check dev-server.js
node --check js/auth.js

# 5. Refresh web assets in the EXISTING zip. This preserves the production server.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open("app.zip", [IO.Compression.ZipArchiveMode]::Update)
try {
  foreach ($relative in @("index.html", "login.html", "js/auth.js", "quadrant-logo.png")) {
    $existing = $zip.GetEntry($relative)
    if ($existing) { $existing.Delete() }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, (Resolve-Path $relative).Path, $relative,
      [IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally { $zip.Dispose() }

# 6. Deploy
az webapp deploy `
  --resource-group AI_Governance_RG `
  --name ai-accelerator-dashboard `
  --src-path app.zip `
  --type zip
```

> **Never rebuild `app.zip` with the workspace `dev-server.js`.** The workspace copy is the local
> Azure CLI variant; the existing ZIP contains the 9,165-byte production Easy Auth variant.

A successful deploy prints progression like:

```
Status: Build successful.
Status: Starting the site...
Status: Site started successfully.
Deployment has completed successfully
```

### 8.3 After deploying
- Hard-refresh the live URL (**Ctrl+F5**) to bust the browser cache and see changes.
- The zip deploy ships whatever is in your local working folder.
- The Kudu regional SCM host confirms status at `/api/deployments/latest` (`complete=True`,
  `active=True`). The simple `ai-accelerator-dashboard.scm.azurewebsites.net` does NOT resolve —
  use the regional host in §3.

### 8.4 Keeping `app.zip` in sync (no redeploy)
After **every** change to `index.html`, `login.html`, `js/auth.js`, or `quadrant-logo.png`, refresh
the corresponding entry inside `app.zip` so the artifact stays current — but **do NOT redeploy**
to App Service unless explicitly asked (§8.2). Leave the **production** `dev-server.js` +
`package.json` inside `app.zip` untouched — the bundled server uses Easy Auth and differs from the
local-dev one.

---

## 9. Project snapshot storage (Azure Blob)

The full project snapshot is distributed as `AI_Accelerator_Dashboard_Files.zip` from Azure Blob
Storage:

| Thing | Value |
|-------|-------|
| **Storage account** | `aiacceldash` (Resource Group `AI_Governance_RG`) |
| **Blob container** | `ai-accelerator-dashboard` (public access **disabled**) |
| **Blob (file)** | `AI_Accelerator_Dashboard_Files.zip` |
| **Blob path** | `aiacceldash/ai-accelerator-dashboard/AI_Accelerator_Dashboard_Files.zip` |

> ⚠️ **Sensitive:** the snapshot bundles `.env`. Keep the container private — never enable public
> access. The deploy account has **no** `Storage Blob Data *` data-plane role, so use **account-key
> auth** (not `--auth-mode login`) for blob upload/download.

---

## 10. Common tasks & troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `az webapp deploy` fails with `AuthorizationFailed` | Token expired or wrong subscription. Re-run `az login --use-device-code`, then `az account set --subscription 36710d9e-2ce6-4c69-a8ce-52501abd6c10`. Confirm you are on `AI_Governance_RG`. |
| Blob upload fails with `AuthorizationFailed` | Data-plane role missing / stale token. Use **account-key auth** for `aiacceldash`, and re-run `az login` if the token is stale. |
| Deploy hits the wrong subscription | Login defaulted to "Microsoft Partner Network". Always run the `az account set` step. |
| Device-code login "hangs" | Don't pipe `az login` through `Select-Object`/`Where-Object` — it can swallow the prompt. Run it plain. |
| Dashboard loads but shows embedded snapshot, not live data | The browser never got `/workbook.xlsx`. Confirm the server is generating `/.env` with `WORKBOOK_URL=/workbook.xlsx`, and that Graph can read the file (check server logs for `[live] error`). |
| User signed in but sees no data | The SharePoint workbook isn't shared with that user. Adjust the file's sharing (org-wide link vs specific people). |
| Charts empty / SheetJS error | Offline — the CDN couldn't load SheetJS. Reconnect and refresh. |
| Wrong / empty table | `SHEET_NAME` doesn't match the workbook tab exactly (currently `Accelerator Inventory`). |
| Changes not visible after deploy | Hard-refresh (Ctrl+F5); the browser cached the old page. |
| Local page can't read `.env` | You opened it via `file://`. Serve through `node dev-server.js` at `http://localhost:5173/`. |
| Branded login page does not appear before Entra sign-in in Azure | Expected with the current ARM-managed Easy Auth configuration: all static paths are protected and `excludedPaths` does not persist. Do not enable global anonymous access; use reviewed file-based Easy Auth configuration. |
| User is unexpectedly signed out | The dashboard automatically signs out after one hour without keyboard, pointer, touch, wheel, or scroll activity. |

Useful diagnostics:

```powershell
# Stream live App Service logs
az webapp log tail --resource-group AI_Governance_RG --name ai-accelerator-dashboard

# Confirm current identity/subscription
az account show --query "{user:user.name, sub:name, id:id}" -o json
```

---

## 11. Note on the two hosting stories

`README.md` documents an earlier design that published to **GitHub Pages** via a scheduled GitHub
Action that baked a `portfolio.xlsx` snapshot next to the site. **The live production app does NOT
use that path.** Production runs on **Azure App Service** with the `dev-server.js` proxy and
**Azure App Service Authentication (Easy Auth)** described in this document. Treat this file
(`Working_instructions.md`) as the source of truth for the deployed app; keep `README.md` only for
historical context.

---

## 12. Quick reference

```text
Web App:            ai-accelerator-dashboard
Resource Group:     AI_Governance_RG   (moved from MSSA_DataAgent_POC)
Storage account:    aiacceldash
Subscription:       Project-AI  (36710d9e-2ce6-4c69-a8ce-52501abd6c10)
Tenant:             0eadb77e-42dc-47f8-bbe3-ec2395e0712c  (Quadrant Technologies)
Deploy account:     rajesh.kodaganti@quadranttechnologies.com  (Contributor)
URL:                https://ai-accelerator-dashboard-cyhgc2f3axg3bgau.westus-01.azurewebsites.net
Runtime:            Linux, Node 22, Plan SKU (B1)
Startup:            node dev-server.js
Sheet:              Accelerator Inventory
Dashboard version:  1.1.4
Deploy artifact:    app.zip  (index.html + login.html + js/auth.js + quadrant-logo.png
                    + production dev-server.js + package.json)
Deploy command:     az webapp deploy -g AI_Governance_RG -n ai-accelerator-dashboard --src-path app.zip --type zip
```
