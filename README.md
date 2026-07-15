# AI Portfolio Dashboard

A single-file leadership dashboard for the AI Accelerator / Agent portfolio. It reads an Excel
workbook (the Asset Register) and renders live KPIs, composition charts, governance flags, and a
filterable/sortable asset table. No build step, no framework — just one HTML file plus a small
`.env` config.

---

## What's in this folder

| File | Purpose |
|------|---------|
| `AI_Portfolio_Dashboard.html` | The entire dashboard (HTML + CSS + JS in one file). |
| `.env` | Config you edit — which workbook file and sheet to read. |
| `AI_Accelerator_Agent_Inventory_Template.xlsx` | The Excel data source (local / OneDrive-synced copy). |
| `README.md` | This file. |

---

## Prerequisites

- **Python 3** (used only to run a tiny local web server). Check with:
  ```powershell
  python --version
  ```
- A modern browser (Chrome / Edge recommended — enables true real-time file watching).
- Internet access on first load (the dashboard pulls the SheetJS library from a CDN).

---

## Quick start (run locally)

The dashboard must be **served over HTTP** (not opened as a `file://` path), so it can read the
workbook and the `.env` file.

1. Open a terminal in this folder:
   ```powershell
   cd "C:\Users\v-rkodaganti\OneDrive - Microsoft\Dev\Quadrant Technologies\AI Accelerator Dashboard"
   ```
2. Start a local web server:
   ```powershell
   python -m http.server 8000
   ```
3. Open the dashboard in your browser:
   ```
   http://localhost:8000/AI_Portfolio_Dashboard.html
   ```

The status pill near the top shows **Live** once it has connected to the workbook. It re-checks the
file every 5 seconds and refreshes automatically when the data changes. Leave the terminal running;
press `Ctrl+C` to stop the server.

---

## Configure the data source (`.env`)

Open `.env` and set the workbook file name and sheet. Save, then refresh the browser.

```dotenv
# The workbook the dashboard reads (must live in THIS folder — see note below).
EXCEL_FILE=AI_Accelerator_Agent_Inventory_Template.xlsx

# The sheet/tab inside the workbook to read.
SHEET_NAME=Accelerator Inventory
```

> **Note:** A browser cannot fetch a SharePoint web link directly — sign-in and CORS block it.
> `EXCEL_FILE` must point at a file that sits **in the same folder the dashboard is served from**.
> The section below explains how to keep that file in sync with SharePoint automatically.

---

## Use the SharePoint workbook as the live source

The Asset Register lives in SharePoint / OneDrive:

```
https://netorgft1145305-my.sharepoint.com/.../AI_Accelerator_Agent_Inventory_Template (1).xlsx
```

To feed that data into the dashboard without manually downloading it each time, let the **OneDrive
sync client** keep a local copy on disk. Edits made in the cloud sync down, and the dashboard picks
them up on its next poll.

### One-time setup

1. **Sync the Quadrant OneDrive that owns the file.**
   - Click the OneDrive cloud icon in the system tray → gear ⚙ → **Settings** → **Account** →
     **Add an account**.
   - Sign in as `venkata_kaushik@quadranttechnologies.com`.
   - Let it finish syncing. You'll get a folder like
     `C:\Users\v-rkodaganti\OneDrive - Quadrant Technologies\...` containing
     `AI_Accelerator_Agent_Inventory_Template (1).xlsx`.

2. **Keep the dashboard next to the workbook.** Serve the dashboard from the folder that contains
   the synced `.xlsx`. Either:
   - copy `AI_Portfolio_Dashboard.html` and `.env` into that synced folder, **or**
   - keep them here and copy the synced `.xlsx` into this folder.

3. **Point `.env` at the synced file.** Either rename the synced file to
   `AI_Accelerator_Agent_Inventory_Template.xlsx` (so it matches the default), or set the exact
   name in `.env`:
   ```dotenv
   EXCEL_FILE=AI_Accelerator_Agent_Inventory_Template (1).xlsx
   ```

4. **Run the server** from that folder (`python -m http.server 8000`) and open the dashboard.

### How updates flow

```
Someone edits the sheet in SharePoint
      ↓  (OneDrive sync client)
Local .xlsx on disk updates
      ↓  (dashboard polls every 5s)
Dashboard refreshes automatically — no manual re-selecting
```

---

## Manual / offline fallback

If you don't serve over HTTP, or `.env` can't be reached, the dashboard falls back to an embedded
snapshot and lets you connect a file by hand:

- Click **Connect** and pick the `.xlsx` (Chrome/Edge keep it live via the File System Access API), or
- **Drag and drop** the `.xlsx` onto the page (re-drop to refresh).

---

## Hosting it for others (optional)

For a single machine, the local server above is enough. To share it on your network:

- Run the server bound to your machine so teammates on the same network can reach it:
  ```powershell
  python -m http.server 8000 --bind 0.0.0.0
  ```
  Then share `http://<your-machine-ip>:8000/AI_Portfolio_Dashboard.html`.
- Because the data still comes from a local/synced file, the machine running the server must have the
  OneDrive-synced workbook.

> For a true multi-user, always-on deployment that reads straight from SharePoint (each viewer signs
> in), the dashboard would need a Microsoft Graph + MSAL integration and an app registration — a
> larger change than the local setup documented here.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Status stays on "Embedded snapshot" | Make sure you opened it via `http://localhost:8000/...`, not by double-clicking the file. |
| "Could not read file" / wrong data | Check `EXCEL_FILE` and `SHEET_NAME` in `.env` match the actual file name and tab exactly. |
| Charts empty / library error | You're offline — the SheetJS CDN couldn't load. Reconnect to the internet and refresh. |
| Data not updating | Confirm OneDrive shows the file as synced (green check), and the server is still running. |
| Port 8000 already in use | Run on another port, e.g. `python -m http.server 8080`, and open that port in the URL. |
