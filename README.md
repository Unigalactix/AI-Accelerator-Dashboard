# AI Portfolio Dashboard

A single-file leadership dashboard for the AI Accelerator / Agent portfolio. It reads an Excel
workbook (the Asset Register) and renders live KPIs, composition charts, governance flags, and a
filterable/sortable asset table. No build step, no framework — just one HTML file.

The dashboard is designed to be **published to GitHub Pages**, where a scheduled GitHub Action pulls
the latest workbook from SharePoint and publishes it next to the site. It also runs fully offline
from an **embedded snapshot** baked into the page, so it always shows data even before the workbook
is wired up.

---

## What's in this folder

| File | Purpose |
|------|---------|
| `index.html` | The entire dashboard (HTML + CSS + JS in one file), including an embedded fallback snapshot. |
| `.env` | Runtime config the browser reads — the sheet name and the snapshot file name. |
| `.github/workflows/deploy.yml` | GitHub Action: pulls the SharePoint workbook via Microsoft Graph and deploys to GitHub Pages. |
| `AI_Accelerator_Agent_Inventory_Template.xlsx` | The source Excel workbook (local copy, git-ignored). |
| `.gitignore` | Keeps `.env`, `portfolio.xlsx`, and the source workbook out of the repo. |
| `README.md` | This file. |

> `portfolio.xlsx` is **generated at deploy time** by the Action and is not committed. Locally, the
> dashboard falls back to the embedded snapshot unless you provide a `portfolio.xlsx` yourself.

---

## How the data flows

```
Someone edits the Asset Register in SharePoint
      ↓  (GitHub Action: on push, every 6 hours, or manual)
Action authenticates to Microsoft Graph (app-only) and downloads the workbook
      ↓
Workbook is published next to the site as "portfolio.xlsx" (same-origin)
      ↓  (browser fetches portfolio.xlsx, re-checks every 5 min)
Dashboard renders live data — no sign-in, no CORS
      ↓  (if portfolio.xlsx is missing)
Dashboard uses the embedded snapshot baked into index.html
```

The page reports **Live · workbook snapshot** when it reads `portfolio.xlsx`, or **Embedded
snapshot** when it falls back. (The status bar is hidden in the current layout, but the underlying
behavior is unchanged.)

---

## Dashboard features

- **KPI band** — headline counts with drill-down cards.
- **Portfolio Composition** — three charts: *By Business Unit*, *By Domain*, and a **configurable
  third chart** whose grouping you pick from a dropdown (Asset Type, Lifecycle Status, Maturity,
  Hosting, Security Review, Repository, Repository Type, Documentation, Demo, Owner). A **Reset**
  button clears all composition selections and restores the full data view.
- **Asset Register** — a filterable, sortable table with a **Clear** button to drop all active
  filters and the search query.
- **Cross-filtering** — clicking a chart bar filters the rest of the dashboard; selections combine
  across charts and the search box.

---

## Prerequisites

- **Python 3** (used only to run a tiny local web server for local viewing). Check with:
  ```powershell
  python --version
  ```
- A modern browser (Chrome / Edge recommended).
- Internet access on first load (the dashboard pulls the SheetJS library from a CDN).

---

## Quick start (run locally)

Serve the folder over HTTP (not `file://`) so the browser can read `.env` and any `portfolio.xlsx`.

1. Open a terminal in this folder:
   ```powershell
   cd "C:\Users\v-rkodaganti\OneDrive - Microsoft\Dev\Quadrant Technologies\AI Accelerator Dashboard"
   ```
2. Start a local web server:
   ```powershell
   python -m http.server 8000
   ```
3. Open the dashboard:
   ```
   http://localhost:8000/index.html
   ```

Without a local `portfolio.xlsx`, the page renders the **embedded snapshot**. To preview live data
locally, drop a `portfolio.xlsx` into this folder (any export of the workbook saved with that name)
and refresh — the page reads it same-origin and re-checks every 5 minutes.

Leave the terminal running; press `Ctrl+C` to stop the server.

---

## Configure the data source (`.env`)

The browser reads only two values from `.env`. Save, then refresh.

```dotenv
# The sheet/tab inside the workbook to read.
SHEET_NAME=Accelerator Inventory

# The published workbook snapshot the dashboard fetches (same-origin).
SNAPSHOT_FILE=portfolio.xlsx
```

> The remaining SharePoint / Entra values (`SHAREPOINT_URL`, `AAD_TENANT_ID`, `AAD_CLIENT_ID`,
> `AAD_CLIENT_SECRET`) are **build-time only** — stored as GitHub repo secrets and used by the
> deploy workflow, never by the browser. `.env` is git-ignored.

---

## Deploy to GitHub Pages (live from SharePoint)

The workflow in `.github/workflows/deploy.yml` runs on push to `main`, every 6 hours, and on manual
dispatch. It authenticates to Microsoft Graph (app-only), downloads the SharePoint workbook, writes
it as `portfolio.xlsx`, and publishes the site to GitHub Pages.

### One-time setup

1. **Register an Entra (Azure AD) app** and grant it the **Application** Microsoft Graph permission
   `Sites.Read.All`, with **admin consent** granted. Create a **client secret**.
2. **Add repository secrets** (Settings → Secrets and variables → Actions):
   | Secret | Value |
   |--------|-------|
   | `SHAREPOINT_URL` | The sharing link to the workbook. |
   | `SHEET_NAME` | The sheet/tab to read, e.g. `Accelerator Inventory`. |
   | `AAD_TENANT_ID` | Directory (tenant) ID of the app registration. |
   | `AAD_CLIENT_ID` | Application (client) ID. |
   | `AAD_CLIENT_SECRET` | A client secret for that app. |
3. **Enable Pages from Actions**: Settings → Pages → Source → **GitHub Actions**.

Once configured, pushing to `main` (or waiting for the 6-hour schedule) refreshes the published
snapshot and redeploys the site automatically.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Shows the embedded snapshot instead of live data | Confirm `portfolio.xlsx` exists next to the page (locally or via the deploy Action) and matches `SNAPSHOT_FILE` in `.env`. |
| Charts empty / library error | You're offline — the SheetJS CDN couldn't load. Reconnect to the internet and refresh. |
| Wrong data / empty table | Check `SHEET_NAME` matches the workbook tab exactly. |
| Deploy Action fails on token/download | Verify the Entra secrets, that admin consent for `Sites.Read.All` is granted, and that `SHAREPOINT_URL` is a valid sharing link. |
| Local page won't read `.env` | Serve via `http://localhost:8000/...`, not by double-clicking the file. |
| Port 8000 already in use | Run on another port, e.g. `python -m http.server 8080`, and open that port in the URL. |
