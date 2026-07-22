/* AI Accelerator Dashboard · js/toolbar.js — toolbar filters, signal bar, dyn group, sorting, header menu, masterRender
   Loaded as a classic script (shared global scope); keep the load order in index.html. */
/* =====================================================================
   TOOLBAR QUICK FILTERS — multi-purpose type-cycle button, "needs data"
   toggle, and up-to-3 domain shortcut chips (most common domains).
   All feed the same state.col / state.incomplete used by the header
   carets and composition panels, so every column stays in sync.
   ===================================================================== */
const TYPE_LABELS = { 'AI Agent':'Agents', 'Q-Suite':'Q-Suite' };
function typeCycleList(){
  const all = [...new Set(AGENTS.map(a=>a.type).filter(Boolean))];
  const head = ['AI Agent','Q-Suite'].filter(t=>all.includes(t));
  const rest = all.filter(t=>!head.includes(t)).sort((a,b)=>a.localeCompare(b));
  return [null, ...head, ...rest];        // null = All Types
}
function cycleType(){
  const list = typeCycleList();
  let idx = list.indexOf(state.col.type || null);
  if(idx === -1) idx = 0;
  const next = list[(idx+1) % list.length];
  if(next) state.col.type = next; else delete state.col.type;
  masterRender();
}
function updateTypeCycleBtn(){
  const btn = document.getElementById('typeCycle');
  if(!btn) return;
  const t = state.col.type || null;
  btn.textContent = t ? (TYPE_LABELS[t] || t) : 'All Types';
  btn.classList.toggle('on', !!t);
}
function buildDomainChips(){
  const wrap = document.getElementById('domainChips');
  if(!wrap) return;
  const counts = {};
  AGENTS.forEach(a=>{
    const d = a.domain;
    if(!d || d==='Uncategorized') return;
    counts[d] = (counts[d]||0) + 1;
  });
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0]);
  wrap.innerHTML = top.map(d=>
    `<span class="chip domain-chip${state.col.domain===d?' on':''}" data-domain="${esc(d)}" role="button" tabindex="0" title="Filter by domain: ${esc(d)}">${esc(d)}</span>`
  ).join('');
}
function updateToolbarState(){
  updateTypeCycleBtn();
  const inc = document.getElementById('incompleteChip');
  if(inc) inc.classList.toggle('on', !!state.incomplete);
  buildDomainChips();
}
(function initQuickFilters(){
  const typeBtn = document.getElementById('typeCycle');
  typeBtn.addEventListener('click', cycleType);
  typeBtn.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); cycleType(); } });

  const inc = document.getElementById('incompleteChip');
  const toggleInc = ()=>{ state.incomplete = !state.incomplete; masterRender(); };
  inc.addEventListener('click', toggleInc);
  inc.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleInc(); } });

  const wrap = document.getElementById('domainChips');
  const pickDomain = el=>{ if(el && el.dataset.domain) toggleSeg('domain', el.dataset.domain); };
  wrap.addEventListener('click', e=>pickDomain(e.target.closest('[data-domain]')));
  wrap.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ const el=e.target.closest('[data-domain]'); if(el){ e.preventDefault(); pickDomain(el); } } });
})();
function clearAllFilters(){
  state.q=''; state.col={}; state.incomplete=false;
  const box=document.getElementById('search'); if(box) box.value='';
  masterRender();
}
document.getElementById('clearFilters').addEventListener('click', clearAllFilters);
document.getElementById('clearFilters').addEventListener('keydown', e=>{
  if(e.key==='Enter'||e.key===' '){ e.preventDefault(); clearAllFilters(); }
});
document.getElementById('resetComp').addEventListener('click', clearAllFilters);
document.getElementById('resetComp').addEventListener('keydown', e=>{
  if(e.key==='Enter'||e.key===' '){ e.preventDefault(); clearAllFilters(); }
});

// Collapsible "Readiness & Governance Signals" summary bar
(function initSignalBar(){
  const btn = document.getElementById('signalToggle');
  const body = document.getElementById('signalBody');
  if(!btn || !body) return;
  btn.addEventListener('click', ()=>{
    const open = btn.getAttribute('aria-expanded')==='true';
    btn.setAttribute('aria-expanded', String(!open));
    body.hidden = open;
    btn.title = open ? 'Click to expand readiness & governance signals' : 'Click to collapse';
  });
})();

// Third composition card — user-selectable grouping column
const DYN_GROUPS = [
  {key:'type', label:'Asset Type'},
  {key:'status', label:'Lifecycle Status'},
  {key:'maturity', label:'Maturity'},
  {key:'hosting', label:'Hosting'},
  {key:'security', label:'Security Review'},
  {key:'repo', label:'Repository'},
  {key:'repoType', label:'Repository Type'},
  {key:'documentation', label:'Documentation'},
  {key:'demo', label:'Demo'},
  {key:'owner', label:'Owner'},
];
const DYN_MISSING = new Set(['Unspecified','Not set','Unassigned','Uncategorized','Status not set','Other','No Repository','Not Documented','No Demo']);
const dynColor = k => DYN_MISSING.has(k) ? mist : teal;
let dynGroupKey = 'type';
(function initDynGroup(){
  const sel=document.getElementById('dynGroup');
  if(!sel) return;
  sel.innerHTML = DYN_GROUPS.map(g=>`<option value="${g.key}">${g.label}</option>`).join('');
  sel.value=dynGroupKey;
  sel.addEventListener('change', ()=>{ dynGroupKey=sel.value; buildStats(); });
})();
document.querySelectorAll('thead th').forEach(th=>th.addEventListener('click',()=>{
  const s=th.dataset.s; if(!s)return;
  if(state.sort===s)state.dir*=-1; else{state.sort=s; state.dir=1;}
  render();
}));

const FILTER_LABELS = {
  type:'All types', bu:'All BUs', owner:'All owners', domain:'All domains',
  maturity:'All maturity', status:'All status', security:'All security',
  hosting:'All hosting', hasRepo:'Repo: any'
};
// Distinct filter values for a column.
function colOptions(col){
  if(col==='hasRepo') return [{v:'yes',t:'Has repo'},{v:'no',t:'No repo'}];
  return [...new Set(AGENTS.map(a=>String(a[col]==null?'':a[col])).filter(v=>v!==''))]
    .sort((a,b)=>a.localeCompare(b)).map(v=>({v,t:v}));
}
// Reflect the active-filter state on the header carets.
function buildFilters(){
  document.querySelectorAll('.th-flt').forEach(btn=>{
    btn.classList.toggle('active', !!state.col[btn.dataset.col]);
  });
}
// Inline header filter dropdown.
(function initColMenu(){
  const menu = document.createElement('div');
  menu.className = 'flt-menu';
  menu.hidden = true;
  document.body.appendChild(menu);
  let openCol = null;

  function close(){ menu.hidden = true; openCol = null; }
  function open(btn){
    const col = btn.dataset.col, cur = state.col[col]||'';
    const opts = colOptions(col);
    menu.innerHTML =
      `<button class="cm-all${cur===''?' sel':''}" data-v=""><span class="cm-check">${cur===''?'\u2713':''}</span>${esc(FILTER_LABELS[col]||'All')}</button>` +
      opts.map(o=>`<button class="${cur===o.v?'sel':''}" data-v="${esc(o.v)}"><span class="cm-check">${cur===o.v?'\u2713':''}</span>${esc(o.t)}</button>`).join('');
    menu.hidden = false;
    openCol = col;
    const r = btn.getBoundingClientRect();
    let left = r.left; const mw = menu.offsetWidth;
    if(left + mw > window.innerWidth - 8) left = window.innerWidth - 8 - mw;
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = (r.bottom + 5) + 'px';
  }

  document.querySelectorAll('.th-flt').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      if(!menu.hidden && openCol===btn.dataset.col){ close(); return; }
      open(btn);
    });
  });
  menu.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || !openCol) return;
    state.col[openCol] = b.dataset.v;
    close();
    buildFilters();
    render();
  });
  document.addEventListener('click', e=>{
    if(menu.hidden) return;
    if(e.target.closest('.flt-menu') || e.target.closest('.th-flt')) return;
    close();
  });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') close(); });
  window.addEventListener('scroll', e=>{ if(!menu.hidden && !(e.target instanceof Node && menu.contains(e.target))) close(); }, true);
})();

function masterRender(){ buildStats(); buildFilters(); updateToolbarState(); render(); }

// Clicking (or keyboard-activating) a composition bar filters the whole dashboard.
document.addEventListener('click', e=>{
  const row=e.target.closest('.bar-row.clickable'); if(!row) return;
  toggleSeg(row.dataset.k, row.dataset.v);
});
document.addEventListener('keydown', e=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  const row=e.target.closest('.bar-row.clickable'); if(!row) return;
  e.preventDefault(); toggleSeg(row.dataset.k, row.dataset.v);
});

