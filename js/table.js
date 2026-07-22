/* AI Accelerator Dashboard · js/table.js — asset register table, row renderers, name tooltip, table tools
   Loaded as a classic script (shared global scope); keep the load order in index.html. */
function typeTag(t){
  if(t==='AI Agent')return '<span class="tag t-agent">Agent</span>';
  if(t==='Q-Suite')return '<span class="tag t-q">Q-Suite</span>';
  if(t==='Both (Accelerator + Agent)')return '<span class="tag t-acc">Both</span>';
  if(t==='Framework / Toolkit')return '<span class="tag t-acc">Toolkit</span>';
  if(t==='Accelerator')return '<span class="tag t-acc">Accel</span>';
  return '<span class="tag t-acc">'+esc(t)+'</span>';
}
function statusDot(s){
  const c = s==='Production'?'d-active':(s==='In Development'||s==='Pilot'||s==='POC'||s==='Idea')?'d-dev':'d-none';
  return `<span class="dot ${c}"></span>${esc(s)}`;
}
function dim(v, placeholder){
  return (!v || v===placeholder) ? `<span style="color:var(--mist)">${esc(placeholder||'&mdash;')}</span>` : esc(v);
}
function secBadge(s){
  if(s==='Approved') return '<span class="sec sec-ok">Approved</span>';
  if(s==='Approved with Conditions') return '<span class="sec sec-ok">Approved*</span>';
  if(s==='Not Applicable') return '<span class="sec sec-none">N/A</span>';
  if(s==='Not set') return '<span class="sec sec-none">Not set</span>';
  return '<span class="sec sec-warn">'+esc(s)+'</span>';
}
function render(){
  if(!dataReady){
    document.getElementById('tbody').innerHTML =
      '<tr><td colspan="11" style="text-align:center;color:var(--mist);padding:28px">No live data connected &mdash; metrics will populate once the workbook is reachable.</td></tr>';
    syncHeadOffset();
    return;
  }
  let rows = viewAgents();
  rows.sort((a,b)=>{
    let x=a[state.sort],y=b[state.sort];
    if(typeof x==='boolean'){x=x?1:0;y=y?1:0;}
    if(typeof x==='string')return state.dir*x.localeCompare(y);
    return state.dir*(x-y);
  });
  document.getElementById('tbody').innerHTML = rows.map(a=>`
    <tr>
      <td class="c-name"><div class="aname" data-desc="${esc(a.desc||'')}" data-name="${esc(a.name)}">${esc(a.name)}</div><div class="aid">${esc(a.id)}</div></td>
      <td class="c-domain">${a.domain==='Uncategorized'?'<span style="color:var(--mist)">Uncategorized</span>':esc(a.domain)}</td>
      <td class="c-type">${typeTag(a.type)}</td>
      <td class="hide-sm c-bu">${esc(a.bu)}</td>
      <td class="hide-sm c-owner">${a.owner?esc(a.owner):'<span class="miss">&mdash;</span>'}</td>
      <td class="c-maturity" style="white-space:nowrap">${dim(a.maturity,'Unspecified')}</td>
      <td class="c-status" style="white-space:nowrap">${statusDot(a.status)}</td>
      <td class="hide-sm c-security">${secBadge(a.security)}</td>
      <td class="hide-sm c-hosting">${dim(a.hosting,'Not set')}</td>
      <td class="hide-sm c-repo">${a.hasRepo?'<span class="ok">&check;</span>':'<span class="miss">&times;</span>'}</td>
      <td class="c-complete"><div class="meter"><div class="track2"><div class="f2" style="width:${a.complete}%;background:${a.complete<40?rose:a.complete<70?amber:teal}"></div></div><span>${a.complete}%</span></div></td>
    </tr>`).join('');
  syncHeadOffset();
}
document.getElementById('search').addEventListener('input', e=>{state.q=e.target.value; render();});

/* =====================================================================
   ASSET HOVER TOOLTIP — shows the asset's short description anywhere a
   name (.aname[data-desc]) is rendered (table, drill-downs, etc.)
   ===================================================================== */
(function initNameTip(){
  const tip = document.createElement('div');
  tip.id = 'nameTip';
  document.body.appendChild(tip);
  let cur = null;
  const place = e=>{
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if(x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if(y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  };
  document.addEventListener('mouseover', e=>{
    const el = e.target.closest('.aname[data-desc]');
    if(!el || !el.getAttribute('data-desc')){ return; }
    cur = el;
    tip.innerHTML = '<div class="tip-t">'+ (el.getAttribute('data-name')||'') +'</div>' + el.getAttribute('data-desc');
    place(e);
    tip.classList.add('show');
  });
  document.addEventListener('mousemove', e=>{ if(cur) place(e); });
  document.addEventListener('mouseout', e=>{
    if(cur && (!e.relatedTarget || !cur.contains(e.relatedTarget))){ cur = null; tip.classList.remove('show'); }
  });
  window.addEventListener('scroll', ()=>{ if(cur){ cur = null; tip.classList.remove('show'); } }, true);
})();

/* =====================================================================
   TABLE TOOLS — sticky-header offset, column visibility, density toggle
   ===================================================================== */
// Keep the second (filter) header row docked directly under the first row
// while the table scrolls vertically inside .table-wrap.
function syncHeadOffset(){
  const tbl = document.getElementById('tbl');
  const firstRow = tbl && tbl.querySelector('thead tr');
  if(firstRow) tbl.style.setProperty('--head-h', firstRow.offsetHeight + 'px');
}
window.addEventListener('resize', syncHeadOffset);

// Columns that can be shown/hidden (Asset stays pinned & always visible).
const TABLE_COLUMNS = [
  {key:'domain', label:'Domain'}, {key:'type', label:'Type'}, {key:'bu', label:'BU'}, {key:'owner', label:'Owner'},
  {key:'maturity', label:'Maturity'}, {key:'status', label:'Status'},
  {key:'security', label:'Security'}, {key:'hosting', label:'Hosting'}, {key:'repo', label:'Repo'},
  {key:'complete', label:'Data'},
];
const hiddenCols = new Set();
const colVisStyle = document.createElement('style');
document.head.appendChild(colVisStyle);
function applyColVis(){
  colVisStyle.textContent = [...hiddenCols].map(k=>`#tbl .c-${k}{display:none}`).join('');
  syncHeadOffset();
}
function buildColMenu(){
  const menu = document.getElementById('colMenu');
  menu.innerHTML =
    TABLE_COLUMNS.map(c=>`<label><input type="checkbox" data-col="${c.key}" ${hiddenCols.has(c.key)?'':'checked'}> ${c.label}</label>`).join('')
    + `<div class="col-menu-foot"><button type="button" data-all="show">Show all</button><button type="button" data-all="hide">Hide all</button></div>`;
}
(function initTableTools(){
  const densityBtn = document.getElementById('densityBtn');
  const colBtn = document.getElementById('colBtn');
  const colMenu = document.getElementById('colMenu');
  const tbl = document.getElementById('tbl');

  const ICON_COMFY = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor"/><rect x="2" y="7" width="12" height="2" rx="1" fill="currentColor"/><rect x="2" y="11" width="12" height="2" rx="1" fill="currentColor"/></svg>';
  const ICON_COMPACT = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="1.6" rx=".8" fill="currentColor"/><rect x="2" y="5" width="12" height="1.6" rx=".8" fill="currentColor"/><rect x="2" y="8" width="12" height="1.6" rx=".8" fill="currentColor"/><rect x="2" y="11" width="12" height="1.6" rx=".8" fill="currentColor"/></svg>';

  densityBtn.addEventListener('click', ()=>{
    const compact = tbl.classList.toggle('compact');
    densityBtn.classList.toggle('active', compact);
    densityBtn.setAttribute('aria-pressed', compact);
    densityBtn.title = compact ? 'Comfortable rows' : 'Compact rows';
    densityBtn.setAttribute('aria-label', compact ? 'Switch to comfortable rows' : 'Switch to compact rows');
    densityBtn.innerHTML = compact ? ICON_COMPACT : ICON_COMFY;
    syncHeadOffset();
  });

  buildColMenu();
  colBtn.addEventListener('click', e=>{
    e.stopPropagation();
    const open = colMenu.hidden;
    colMenu.hidden = !open;
    colBtn.setAttribute('aria-expanded', open);
  });
  colMenu.addEventListener('click', e=>e.stopPropagation());
  colMenu.addEventListener('change', e=>{
    const cb = e.target.closest('input[data-col]'); if(!cb) return;
    if(cb.checked) hiddenCols.delete(cb.dataset.col); else hiddenCols.add(cb.dataset.col);
    applyColVis();
  });
  colMenu.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-all]'); if(!btn) return;
    if(btn.dataset.all==='hide') TABLE_COLUMNS.forEach(c=>hiddenCols.add(c.key));
    else hiddenCols.clear();
    buildColMenu(); applyColVis();
  });
  document.addEventListener('click', ()=>{ if(!colMenu.hidden){ colMenu.hidden=true; colBtn.setAttribute('aria-expanded', false); } });
})();

