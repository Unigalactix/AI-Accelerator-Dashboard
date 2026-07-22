/* AI Accelerator Dashboard · js/data-source.js — env, normalizers, workbook parsing, live poll + bootstrap
   Loaded as a classic script (shared global scope); keep the load order in index.html. */
/* =====================================================================
   LIVE EXCEL CONNECTION
   Reads the "Accelerator Inventory" sheet and maps it to the dashboard
   model, refreshing automatically when the workbook changes.
   ===================================================================== */
// Defaults — overridden at startup by values in the ".env" file (if reachable).
let SHEET_NAME = 'Accelerator Inventory';
let SNAPSHOT_FILE = 'portfolio.xlsx';
// Optional live source (local dev proxy). When set, the dashboard fetches this
// instead of the static snapshot, giving near real-time data. See dev-server.js.
let WORKBOOK_URL = '';
let REFRESH_SECONDS = 300;
let lastSig=null, pollTimer=null;
// The path the dashboard actually fetches: live proxy if configured, else snapshot.
function workbookSrc(){ return WORKBOOK_URL || SNAPSHOT_FILE; }

// Reads a KEY=VALUE ".env" file served next to this page and applies
// SHEET_NAME / SNAPSHOT_FILE / WORKBOOK_URL / REFRESH_SECONDS. Silently keeps
// defaults if it can't be read (e.g. opened via file:// instead of an http server).
async function loadEnv(){
  try{
    const res = await fetch('.env', {cache:'no-store'});
    if(!res.ok) return;
    const text = await res.text();
    text.split(/\r?\n/).forEach(line=>{
      const t = line.trim();
      if(!t || t.startsWith('#')) return;
      const eq = t.indexOf('=');
      if(eq < 1) return;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if(key === 'SHEET_NAME' && val) SHEET_NAME = val;
      else if(key === 'SNAPSHOT_FILE' && val) SNAPSHOT_FILE = val;
      else if(key === 'WORKBOOK_URL' && val) WORKBOOK_URL = val;
      else if(key === 'REFRESH_SECONDS' && val && !isNaN(+val)) REFRESH_SECONDS = Math.max(5, +val);
    });
  }catch(e){ /* file:// or offline — keep defaults */ }
}

const S = v => (v==null?'':String(v)).trim();
// half-to-even rounding, matching how the embedded snapshot was generated
function roundHalfEven(x){
  const f=Math.floor(x), d=x-f;
  if(Math.abs(d-0.5)<1e-9) return (f%2===0)?f:f+1;
  return Math.round(x);
}
// Values normalized to the workbook's "Reference Lists" dropdown categories.
// Free-text / synonym entries are matched on keyword and mapped to the canonical value.
function normType(v){ const s=S(v).toLowerCase().replace(/\s+/g,' ');
  if(!s) return 'Unspecified';
  if(s.includes('q-suite')||s.includes('qsuite')) return 'Q-Suite';
  if(s.includes('both')||(s.includes('accelerator')&&s.includes('agent'))) return 'Both (Accelerator + Agent)';
  if(s.includes('framework')||s.includes('toolkit')) return 'Framework / Toolkit';
  if(s.includes('agent')) return 'AI Agent';
  if(s.includes('accelerator')||s.includes('idp')||s.includes('automation')) return 'Accelerator';
  return 'Other'; }
function normBu(v){ const s=S(v); if(!s) return 'Unassigned';
  const l=s.toLowerCase();
  if(l.includes('coe')||l.includes('center of excellence')) return 'AI CoE';
  if(l.includes('vamshi')) return 'Vamshi BU';
  return s; }
function normStatus(v){ const s=S(v); if(!s) return 'Status not set';
  const l=s.toLowerCase();
  if(l.includes('deprecat')) return 'Deprecated';
  if(l.includes('hold')) return 'On Hold';
  if(l.includes('production')||l.includes('active')||l.includes('launch')||l.includes('available')||l.includes('live')) return 'Production';
  if(l.includes('pilot')) return 'Pilot';
  if(l.includes('poc')||l.includes('proof of concept')) return 'POC';
  if(l.includes('develop')||l.includes('progress')||l.includes('wip')) return 'In Development';
  if(l.includes('idea')||l.includes('concept')||l.includes('planned')) return 'Idea';
  return s; }
function normHost(v){ const s=S(v).toLowerCase();
  if(!s) return 'Not set';
  if(s.includes('azure')) return 'Microsoft Azure';
  if(s.includes('aws')||s.includes('amazon')) return 'AWS';
  if(s.includes('gcp')||s.includes('google')) return 'GCP';
  if(s.includes('on-prem')||s.includes('on prem')||s.includes('premis')) return 'On-Premises';
  if(s.includes('hybrid')) return 'Hybrid';
  if(s.includes('local')||s.includes('desktop')) return 'Local / Desktop';
  if(s.includes('saas')) return 'SaaS';
  if(s.includes('not yet')||s.includes('not deploy')||s.includes('undeployed')) return 'Not Yet Deployed';
  return S(v); }
function normMat(v){ const s=S(v).toLowerCase();
  if(!s) return 'Unspecified';
  if(s.includes('mature')||s.includes('battle')) return 'Mature / Battle-tested';
  if(s.includes('beta')) return 'Beta';
  if(s.includes('stable')||s.includes('production')) return 'Stable';
  if(s.includes('experimental')||s.includes('prototype')||s.includes('demo')||s.includes('poc')||s.includes('mvp')||s.includes('pilot')||s.includes('idea')) return 'Experimental';
  return 'Other'; }
function normRepoType(v){ const s=S(v).toLowerCase();
  if(!s) return 'Not set';
  if(s.includes('github')) return 'GitHub';
  if(s.includes('azure devops')||s.includes('ado')||s.includes('vsts')) return 'Azure DevOps';
  if(s.includes('gitlab')) return 'GitLab';
  if(s.includes('bitbucket')) return 'Bitbucket';
  return S(v); }
function normSec(v){ const s=S(v).toLowerCase();
  if(!s) return 'Not set';
  if(s.includes('not applicable')||s.includes('n/a')||s==='na') return 'Not Applicable';
  if(s.includes('with condition')) return 'Approved with Conditions';
  if(s.includes('approved')||s.includes('pass')||s.includes('complete')||s.includes('cleared')) return 'Approved';
  if(s.includes('needs update')||s.includes('re-review')||s.includes('outdated')) return 'Needs Update';
  if(s.includes('progress')||s.includes('reviewing')||s.includes('in review')||s.includes('under review')) return 'In Progress';
  return 'Not Reviewed'; }
function normDomain(v){ const raw=S(v); if(!raw) return 'Uncategorized';
  const s=raw.toLowerCase();
  if(/health|clinic|oncolog|dermat|medtech|ophthal|patient|ehr|soap|pharma|life scienc|medical|hospital/.test(s)) return 'Healthcare & Life Sciences';
  if(/bfsi|bank|credit|underwrit|insur|lending|payer|mortgage|wealth|capital market/.test(s)) return 'BFSI';
  if(/telecom|telco|\bmedia\b|broadcast|entertainment/.test(s)) return 'Telecom & Media';
  if(/retail|cpg|grocery|wine|\bfood\b|exhibition|catalog|ecommerce|consumer goods/.test(s)) return 'Retail & CPG';
  if(/energy|utilit|electric|\boil\b|\bgas\b|\bpower\b|solar/.test(s)) return 'Energy & Utilities';
  if(/manufactur|refinery|\bplant\b|ppe|construction|factory|industrial|supply chain|logistic/.test(s)) return 'Manufacturing';
  if(/government|voter|election|public sector|citizen|narcotic|law enforce|municipal|federal|govt/.test(s)) return 'Public Sector';
  if(/education|lesson|teach|student|school|learning|university|academ/.test(s)) return 'Education';
  if(/financ|payable|payment|accounting|invoic|expense|treasury/.test(s)) return 'Finance';
  if(/internal|enterprise it|data privacy|ticket|\bpii\b|security|infosec|helpdesk/.test(s)) return 'Internal / Enterprise IT';
  if(/cross-industry|cross industry|multi-industry|multiple industr|agnostic|any industr/.test(s)) return 'Cross-Industry';
  if(/legal|contract|document|knowledge|research|proposal|productivity|professional service|generative|modernization|estimation|automation/.test(s)) return 'Cross-Industry';
  return 'Other'; }

// Column mapping is resolved by HEADER NAME (not fixed index), so the dashboard
// keeps working even if columns are added/reordered in the workbook.
function normHeader(s){ return S(s).toLowerCase().replace(/\s+/g,' ').trim(); }
function buildColMap(headerRow){
  const map={};
  (headerRow||[]).forEach((h,i)=>{ const k=normHeader(h); if(k && !(k in map)) map[k]=i; });
  return map;
}
// Find a column index by trying exact header names first, then a loose
// "contains" match (ignoring the workbook's "(REFERENCE)" helper columns).
function colIdx(map, candidates){
  for(const c of candidates){ const k=normHeader(c); if(k in map) return map[k]; }
  for(const c of candidates){ const k=normHeader(c);
    for(const key in map){ if(key.includes('reference')) continue; if(key.includes(k)) return map[key]; } }
  return -1;
}
function resolveColumns(headerRow){
  const m = buildColMap(headerRow);
  return {
    id:       colIdx(m,['id']),
    name:     colIdx(m,['accelerator / agent name','name']),
    type:     colIdx(m,['type']),
    desc:     colIdx(m,['short description','description']),
    bu:       colIdx(m,['team / department / bu','team / department','bu']),
    owner:    colIdx(m,['owner name','owner']),
    status:   colIdx(m,['current status']),
    storage:  colIdx(m,['storage location (url / path)','storage location','storage']),
    repoType: colIdx(m,['repository type']),
    docLink:  colIdx(m,['documentation link','documentation']),
    demoLink: colIdx(m,['demo link / video','demo link']),
    domain:   colIdx(m,['business domain']),
    hosting:  colIdx(m,['deployment / hosting','hosting']),
    savings:  colIdx(m,['estimated time / cost savings','time / cost savings']),
    maturity: colIdx(m,['maturity level']),
    security: colIdx(m,['security review status','security review']),
  };
}
function rowToAsset(row, C){
  const g = i => (i>=0 ? row[i] : null);
  const id = S(g(C.id)); if(!id) return null;
  const owner = S(g(C.owner));
  const rawStatus = S(g(C.status));
  const storage = S(g(C.storage));
  const repoType = S(g(C.repoType));
  const docLink = S(g(C.docLink));
  const demoLink = S(g(C.demoLink));
  const rawDomain = S(g(C.domain));
  const savings = S(g(C.savings));
  const rawMat = S(g(C.maturity));
  const rawSec = S(g(C.security));
  const hasRepo = !!(repoType || storage);
  // completeness across 8 leadership-critical fields (raw presence)
  const present = [ owner, rawStatus, rawMat, (storage||repoType), rawDomain, rawSec, savings, docLink ]
    .filter(Boolean).length;
  const complete = roundHalfEven(present/8*100);
  const name = S(g(C.name)) || id;
  return {
    id, name, type: normType(g(C.type)), bu: normBu(g(C.bu)), owner,
    status: normStatus(rawStatus), domain: normDomain(rawDomain), maturity: normMat(rawMat),
    hosting: normHost(g(C.hosting)), hasRepo, repoType: normRepoType(g(C.repoType)), hasDoc: !!docLink, hasDemo: !!demoLink,
    security: normSec(rawSec), desc: S(g(C.desc)), savings, complete
  };
}
function parseWorkbook(buf){
  if(typeof XLSX==='undefined') throw new Error('Spreadsheet library not loaded (no internet?).');
  const wb = XLSX.read(buf, {type:'array'});
  const ws = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, blankrows:false});
  // Locate the header row (the one containing an "ID" cell) so data start and
  // column positions are detected instead of assumed.
  let hdr = -1;
  for(let r=0; r<Math.min(8, aoa.length); r++){
    if((aoa[r]||[]).some(c=>normHeader(c)==='id')){ hdr=r; break; }
  }
  if(hdr < 0) hdr = 1;
  const C = resolveColumns(aoa[hdr]);
  const out=[];
  for(let r=hdr+1; r<aoa.length; r++){ const a=rowToAsset(aoa[r]||[], C); if(a) out.push(a); }
  return out;
}

function setStatus(text, cls){
  document.getElementById('dsText').textContent = text;
  document.getElementById('dsDot').className = 'ds-dot' + (cls?(' '+cls):'');
}
function markSync(){
  document.getElementById('dsTime').textContent = 'Last sync ' + new Date().toLocaleTimeString();
}
function applyData(buf){
  const data = parseWorkbook(buf);
  if(data.length){ AGENTS = enrich(data); dataReady = true; masterRender(); markSync(); return true; }
  return false;
}

// Load the workbook snapshot published next to this page by the GitHub Action.
// The Action authenticates to SharePoint server-side and writes SNAPSHOT_FILE,
// so the browser just reads a same-origin file — no sign-in, no CORS.
function isXlsx(buf){ const s=new Uint8Array(buf.slice(0,2)); return s[0]===0x50 && s[1]===0x4B; }
// Shows a blocking popup when the signed-in user lacks access to the SharePoint
// file / sheet. Offers a "Request access" button that opens the file in
// SharePoint, where the built-in request-access flow takes over.
let accessModalShown = false;
function showAccessModal(requestUrl){
  if(accessModalShown) return;
  accessModalShown = true;
  const ov = document.getElementById('accessOverlay');
  const link = document.getElementById('accessRequestBtn');
  if(requestUrl){ link.href = requestUrl; link.style.display=''; }
  else { link.style.display='none'; }
  if(ov) ov.classList.add('show');
}
function hideAccessModal(){
  const ov = document.getElementById('accessOverlay');
  if(ov) ov.classList.remove('show');
  accessModalShown = false;
}
(function bindAccessModal(){
  const dismiss = document.getElementById('accessDismissBtn');
  if(dismiss) dismiss.addEventListener('click', hideAccessModal);
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){ const ov=document.getElementById('accessOverlay'); if(ov && ov.classList.contains('show')) hideAccessModal(); }
  });
})();
async function loadSnapshot(){
  try{
    const res = await fetch(workbookSrc(), {cache:'no-store'});
    if(!res.ok){
      if(res.status===403 && WORKBOOK_URL){
        let info={}; try{ info = await res.json(); }catch(_){}
        showAccessModal(info.requestAccessUrl);
        setStatus('No access', 'err');
      }
      return false;
    }
    const buf = await res.arrayBuffer();
    // A missing file may return an HTML 404 page — require a real xlsx (ZIP "PK").
    if(!isXlsx(buf)) return false;
    if(applyData(buf)){
      lastSig = res.headers.get('etag') || res.headers.get('last-modified') || String(buf.byteLength);
      setStatus(WORKBOOK_URL ? 'Live \u00b7 SharePoint' : 'Live \u00b7 workbook snapshot', 'ok');
      markSync();
      startSnapshotPoll();
      return true;
    }
  }catch(e){ /* offline or file:// — keep embedded snapshot */ }
  return false;
}
// Re-check the workbook periodically; picks up SharePoint edits (live) or redeploys.
function startSnapshotPoll(){
  clearInterval(pollTimer);
  pollTimer = setInterval(async ()=>{
    try{
      const res = await fetch(workbookSrc(), {cache:'no-store'});
      if(!res.ok){
        if(res.status===403 && WORKBOOK_URL){
          let info={}; try{ info = await res.json(); }catch(_){}
          showAccessModal(info.requestAccessUrl);
          setStatus('No access', 'err');
        }
        return;
      }
      const buf = await res.arrayBuffer();
      if(!isXlsx(buf)) return;
      const sig = res.headers.get('etag') || res.headers.get('last-modified') || String(buf.byteLength);
      if(sig!==lastSig && applyData(buf)){ lastSig=sig; markSync(); }
    }catch(e){}
  }, REFRESH_SECONDS*1000);
}

function initDataSource(){
  const btn = document.getElementById('dsSignin');
  if(btn) btn.style.display='none';
  setStatus('Connecting to live data\u2026', 'idle');
  loadSnapshot().then(ok=>{
    if(!ok && !accessModalShown) setStatus('No data connected', 'idle');
  });
}

masterRender();
loadEnv().then(initDataSource);
