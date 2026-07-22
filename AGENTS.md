# AGENTS.md — Mandatory instructions for AI agents

**READ THIS FILE COMPLETELY before editing, building, or redeploying this project.**
These rules are mandatory. Do not skip, reorder, or "optimize" them away.

---

## 1. What this project is

AI Accelerator Portfolio — a **single-page leadership dashboard** that visualizes an
accelerator/agent inventory sourced from a live SharePoint workbook.

- **`index.html`** — the ENTIRE dashboard (vanilla JS + SheetJS/XLSX + MSAL, no build step).
  It has an embedded fallback snapshot and reads runtime config from `/.env` at startup.
- **`dev-server.js`** — Node HTTP server that (a) serves static files and (b) proxies the
  live workbook from Microsoft Graph at `/workbook.xlsx`, emitting client config at `/.env`.
- **`package.json`** — `npm start` → `node dev-server.js`. Node `>=20`. No other build.
- **`app.zip`** — the App Service deployment artifact (see §5).
- **`AI_Accelerator_Dashboard_Files.zip`** — full project snapshot distributed via Azure Blob.

There is **no bundler, transpiler, or framework**. Edit source files directly.

---

## 2. Two `dev-server.js` variants — DO NOT SWAP THEM

There are two DIFFERENT versions of `dev-server.js`:

- **Local dev version** (the file in the workspace root): authenticates to Graph via the
  **Azure CLI token** (`az account get-access-token`).
- **Production version** (bundled inside `app.zip`, ~9,165 bytes): authenticates via
  **App Service Easy Auth** (`X-MS-TOKEN-AAD-ACCESS-TOKEN` header / `.auth/me`).

They are NOT interchangeable. When updating `app.zip`, **only replace `index.html`** inside it
unless you have explicitly been asked to change server logic. Never overwrite the production
`dev-server.js` with the local-dev one.

---

## 3. Secrets & config — never hardcode, never commit

- `SHAREPOINT_URL`, `SHEET_NAME`, `REFRESH_SECONDS` come from `.env` locally, or from
  **App Service application settings** in the cloud. `SHAREPOINT_URL` stays **server-side only**;
  the browser only ever receives `SHEET_NAME`, `WORKBOOK_URL`, `REFRESH_SECONDS` via `/.env`.
- `.env` is **gitignored and untracked**. Never commit it, never print its contents, never
  paste secrets into code, logs, or chat.
- `AI_Accelerator_Dashboard_Files.zip` currently bundles `.env`. Treat that zip as sensitive;
  the blob container has public access disabled. Do not make it public.
- When (re)building `AI_Accelerator_Dashboard_Files.zip`, **exclude `AGENTS.md`** from it — along
  with everything else already excluded (e.g. `.git/`, and any other files already left out of the
  zip). `AGENTS.md` is internal agent guidance and must not ship in the distributed snapshot.
- Do NOT introduce new secrets into `index.html` (it ships to the browser).

---

## 4. Git rules (GitHub Pages variant)

- GitHub repo: **`Unigalactix/AI-Accelerator-Dashboard`**.
- **ONLY commit, push, or deploy when the user EXPLICITLY asks.** For verification, build/run
  locally instead (`npm start`, open the browser) — do not push/deploy just to verify.
- When a commit/push IS requested, ALWAYS author as Unigalactix:
  ```
  git -c user.name="Unigalactix" -c user.email="Unigalactix@users.noreply.github.com" commit ...
  ```
  Then push as the same identity.
- GitHub Pages hosting is via GitHub Actions; repo secrets (`SHAREPOINT_URL`, `SHEET_NAME`,
  `AAD_CLIENT_ID`, `AAD_TENANT_ID`) are injected by `.github/workflows/deploy.yml` at build time.

---

## 5. Azure App Service deploy rules

- **Subscription:** `Project-AI` (`36710d9e-2ce6-4c69-a8ce-52501abd6c10`)
- **Tenant:** `0eadb77e-42dc-47f8-bbe3-ec2395e0712c`
- **Resource group:** **`AI_Governance_RG`** (region `westus`). This is the CURRENT RG — all
  resources were moved here from the old `MSSA_DataAgent_POC`. Do not target the old RG.
- **Resources in `AI_Governance_RG`:**
  - App Service `ai-accelerator-dashboard`
  - App Service plan `SKU`
  - Storage account `aiacceldash`
  - Application Insights `ai-accelerator-dashboard`
- **Hostnames:**
  - App: `ai-accelerator-dashboard-cyhgc2f3axg3bgau.westus-01.azurewebsites.net`
  - Kudu/SCM (use the REGIONAL host): `ai-accelerator-dashboard-cyhgc2f3axg3bgau.scm.westus-01.azurewebsites.net`
  - NOTE: `ai-accelerator-dashboard.scm.azurewebsites.net` does NOT resolve — never use it.

### Deploy procedure (only when explicitly asked)
1. Update `index.html` inside `app.zip` (leave production `dev-server.js` + `package.json` untouched).
2. Deploy: `az webapp deploy --resource-group AI_Governance_RG --name ai-accelerator-dashboard --src-path app.zip --type zip`
3. Verify via the Kudu regional SCM host `/api/deployments/latest` (`complete=True`, `active=True`).
4. The site is behind **Easy Auth** (Quadrant tenant sign-in). It CANNOT be verified anonymously —
   an anonymous fetch returns the login page, not the dashboard HTML.

---

## 6. Working Instructions document format (`.docx`) — MANDATORY layout

The Word deliverable `AI_Accelerator_Dashboard_Working_Instructions.docx` (source:
`Working_instructions.md`) MUST always follow this three-part page layout:

- **Page 1 — Title page** with basic details: title `AI Accelerator Dashboard`, subtitle
  `Working Instructions — Operator Guide`, author `Quadrant Technologies`, and the date.
- **Page 2 — Contents / index** (an auto-generated, updatable Word Table of Contents).
- **Page 3 onward — the guide content** (starts with the document's H1 and body).

Rules:
- Edit **`Working_instructions.md`** for content — never hand-edit the `.docx` body. Regenerate
  the `.docx` from the markdown so the two stay in sync.
- The title-page details come from a pandoc YAML metadata block prepended at build time (title,
  subtitle, author, date) — NOT from the markdown body. Keep the body's own H1 as the first
  content heading on page 3.
- Always keep the title page (p1), the TOC (p2), and content (p3+) on separate pages via the
  forced page breaks below.

### Build procedure (regenerate the `.docx`)
Requires `pandoc` and Word (COM) — both are present on this machine.
```powershell
# 1) temp markdown = title-page metadata + full body (body keeps its own H1)
$body = Get-Content "Working_instructions.md" -Raw
$meta = @"
---
title: "AI Accelerator Dashboard"
subtitle: "Working Instructions — Operator Guide"
author: "Quadrant Technologies"
date: "<Month D, YYYY>"
---
"@
$tmp = Join-Path $env:TEMP "wi_build.md"
Set-Content $tmp ($meta + "`n`n" + $body) -Encoding UTF8

# 2) pandoc -> title block + TOC + body
pandoc $tmp -f gfm -o "AI_Accelerator_Dashboard_Working_Instructions.docx" --toc

# 3) Word COM: force title(p1) / TOC(p2) / content(p3+) via page breaks, then update TOC
$out = (Resolve-Path "AI_Accelerator_Dashboard_Working_Instructions.docx").Path
$word = New-Object -ComObject Word.Application; $word.Visible = $false
$doc = $word.Documents.Open($out)
$toc = $doc.TablesOfContents.Item(1); $r = $toc.Range.Duplicate; $r.Collapse(1); $r.InsertBreak(7)  # break before TOC
$h1 = ($doc.Paragraphs | Where-Object { $_.Style.NameLocal -eq 'Heading 1' } | Select-Object -First 1)
$r2 = $h1.Range.Duplicate; $r2.Collapse(1); $r2.InsertBreak(7)                                        # break before first H1
$doc.Fields.Update() | Out-Null; foreach ($t in $doc.TablesOfContents) { $t.Update() }
$doc.Save(); $doc.Close(); $word.Quit()
```
Verify with Word COM that the `Title` paragraph is on page 1, `TablesOfContents(1)` on page 2, and
the first `Heading 1` on page 3 (`Range.Information(3)` = `wdActiveEndPageNumber`).

To publish the updated `.docx` to Azure Blob (only when explicitly asked), upload it to
`aiacceldash/ai-accelerator-dashboard/AI_Accelerator_Dashboard_Working_Instructions.docx` using
**account-key auth** (see §7) with content-type
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`.

---

## 7. Azure login & permissions

- Sign in against tenant `0eadb77e-42dc-47f8-bbe3-ec2395e0712c`.
- Current working account: **`rajesh.kodaganti@quadranttechnologies.com`** — has **Contributor**
  on `AI_Governance_RG`.
- The account has NO `Storage Blob Data *` data-plane role. For blob operations (uploading
  `AI_Accelerator_Dashboard_Files.zip`), **use account-key auth**, not `--auth-mode login`.
- Reading role assignments at storage/sub scope may legitimately fail for a Contributor — that
  is expected, not a real access problem. If a data-plane call fails with `AuthorizationFailed`,
  first suspect a **stale token** (re-run `az login`) before assuming missing permissions.

---

## 8. Editing discipline

- Make only the change requested. No unrequested refactors, features, comments, or docs.
- `index.html` is large and single-file; use targeted edits with sufficient surrounding context.
- After editing, validate (no errors) and, when practical, verify locally in the browser at
  `http://localhost:5173/` via `npm start`.
- Do NOT create markdown docs to describe your changes unless explicitly asked.
- Preserve the existing data-normalization logic (the `norm*` functions and header-based
  column mapping) — the workbook columns are matched by header name, not fixed index.
- After EVERY update to `index.html`, refresh the copy of `index.html` inside `app.zip` so the
  artifact stays in sync — but **do NOT redeploy to App Service**. Only update the zip; deploy
  only when the user explicitly asks (see §5). Leave the production `dev-server.js` +
  `package.json` inside `app.zip` untouched.

---

## 9. Footer & version numbering — MANDATORY

The dashboard footer (`<footer>` in `index.html`) MUST always contain, in order:

1. `AI Accelerator Portfolio Dashboard`
2. `Version <b id="appVersion">X.Y.Z</b>`
3. `Last updated <b id="lastUpdated">…</b>` — rendered as **date + time** (the JS uses
   `toLocaleString` with `hour`/`minute`, not just the date). Do not drop the timestamp.
4. Right-aligned company branding (`.foot-brand`, pushed over with `margin-left:auto`):
   `© Quadrant Technologies LLC` as a hyperlink to `https://www.quadranttechnologies.com/`
   (`target="_blank" rel="noopener noreferrer"`). Keep this on the opposite side of the footer.

### Bump `appVersion` on every functional change (semver `X.Y.Z`)
Update the `#appVersion` number whenever you change the dashboard, matching the scale of the change:

- **Patch (`x.x.Z` → 1.0.1, 1.0.2, …):** small changes / minor additions — **NOT bug fixes**
  (fixes alone do not bump the version).
- **Minor (`x.Y.x` → 1.1.0, 1.2.0, …):** slightly bigger changes / new functionality.
- **Major (`X.x.x` → 2.0.0, …):** big change from a **UX perspective** (redesign, layout overhaul,
  major workflow change).

Always bump the version in the SAME edit as the change it describes.

---

## 10. Known behavior / gotchas

- Data loads in two stages: the embedded snapshot renders instantly, then the live workbook is
  fetched from `/workbook.xlsx` (Graph proxy) and replaces it. Live data is gated on Graph
  latency + token acquisition + client-side XLSX parse.
- The local pwsh terminal here can buffer/delay output onto the NEXT command. When output is
  critical, write results to a temp file and read that file back.
- If a user lacks SharePoint access, the proxy returns `403` with a `requestAccessUrl`; the
  dashboard shows a "Request access" modal. This is expected, not a bug.
