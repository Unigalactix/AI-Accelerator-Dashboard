/* AI Accelerator Dashboard · js/drilldown.js — KPI drill-down drawer
   Loaded as a classic script (shared global scope); keep the load order in index.html. */
/* =====================================================================
   KPI DRILL-DOWN
   Clicking a KPI card opens a detail drawer listing the matching assets.
   ===================================================================== */
const DRILLS = {
  all:      {eyebrow:'Portfolio', title:'All Assets',        sub:'Every agent, accelerator and product under management',
             filter:()=>true, sort:(a,b)=>a.id.localeCompare(b.id)},
  active:   {eyebrow:'Lifecycle', title:'In Production',       sub:'Assets flagged Production in the register',
             filter:a=>a.status==='Production', sort:(a,b)=>b.complete-a.complete},
  launch:   {eyebrow:'Lifecycle',  title:'In Development',      sub:'Assets flagged In Development in the register',
             filter:a=>a.status==='In Development', sort:(a,b)=>b.complete-a.complete},
  security: {eyebrow:'Governance',title:'Security Review',  sub:'All assets by security review status — use the filters to focus',
             sec:true, sort:(a,b)=>b.complete-a.complete},
  complete: {eyebrow:'Data Quality', title:'Data Completeness', sub:'Ranked lowest-first — the laggards needing data most',
             filter:()=>true, sort:(a,b)=>a.complete-b.complete}
};
function drillRowsHTML(rows){
  if(!rows.length) return '';
  return `<table>
    <thead><tr>
      <th>Asset</th><th>Type</th><th class="hide-sm">BU</th><th class="hide-sm">Owner</th>
      <th class="hide-sm">Domain</th><th>Maturity</th><th>Status</th><th>Data</th>
    </tr></thead>
    <tbody>${rows.map(a=>`
      <tr>
        <td><div class="aname" data-desc="${esc(a.desc||'')}" data-name="${esc(a.name)}">${esc(a.name)}</div><div class="aid">${esc(a.id)}</div></td>
        <td>${typeTag(a.type)}</td>
        <td class="hide-sm">${esc(a.bu)}</td>
        <td class="hide-sm">${a.owner?esc(a.owner):'<span class="miss">&mdash;</span>'}</td>
        <td class="hide-sm">${a.domain==='Uncategorized'?'<span style="color:var(--mist)">Uncategorized</span>':esc(a.domain)}</td>
        <td style="white-space:nowrap">${a.maturity==='Unspecified'?'<span style="color:var(--mist)">Unspecified</span>':esc(a.maturity)}</td>
        <td style="white-space:nowrap">${statusDot(a.status)}</td>
        <td><div class="meter"><div class="track2"><div class="f2" style="width:${a.complete}%;background:${a.complete<40?rose:a.complete<70?amber:teal}"></div></div><span>${a.complete}%</span></div></td>
      </tr>`).join('')}</tbody>
  </table>`;
}
// Security drill-down: shows every asset with a predefined status filter.
const SEC_STATUSES = ['Not Reviewed','In Progress','Approved','Approved with Conditions','Needs Update','Not Applicable'];
let drillSecFilter = null;
function drillSecRowsHTML(rows){
  if(!rows.length) return '';
  return `<table>
    <thead><tr>
      <th>Asset</th><th>Type</th><th class="hide-sm">BU</th><th class="hide-sm">Owner</th>
      <th>Security</th><th>Status</th><th>Data</th>
    </tr></thead>
    <tbody>${rows.map(a=>`
      <tr>
        <td><div class="aname" data-desc="${esc(a.desc||'')}" data-name="${esc(a.name)}">${esc(a.name)}</div><div class="aid">${esc(a.id)}</div></td>
        <td>${typeTag(a.type)}</td>
        <td class="hide-sm">${esc(a.bu)}</td>
        <td class="hide-sm">${a.owner?esc(a.owner):'<span class="miss">&mdash;</span>'}</td>
        <td>${secBadge(a.security)}</td>
        <td style="white-space:nowrap">${statusDot(a.status)}</td>
        <td><div class="meter"><div class="track2"><div class="f2" style="width:${a.complete}%;background:${a.complete<40?rose:a.complete<70?amber:teal}"></div></div><span>${a.complete}%</span></div></td>
      </tr>`).join('')}</tbody>
  </table>`;
}
function renderSecDrill(){
  const base = viewAgents().slice().sort(DRILLS.security.sort);
  const counts = {};
  base.forEach(a=>{ counts[a.security] = (counts[a.security]||0) + 1; });
  const extra = Object.keys(counts).filter(s=>!SEC_STATUSES.includes(s)).sort();
  const chipStatuses = [...SEC_STATUSES, ...extra];
  const rows = drillSecFilter ? base.filter(a=>a.security===drillSecFilter) : base;
  document.getElementById('drawerCount').textContent = rows.length;
  const chips = `<div class="drill-chips">`
    + `<button class="chip${drillSecFilter===null?' on':''}" data-sec="__all">All <b>${base.length}</b></button>`
    + chipStatuses.map(s=>`<button class="chip${drillSecFilter===s?' on':''}" data-sec="${esc(s)}">${esc(s)} <b>${counts[s]||0}</b></button>`).join('')
    + `</div>`;
  document.getElementById('drawerBody').innerHTML = chips +
    (rows.length ? drillSecRowsHTML(rows)
                 : `<div class="drawer-empty">No assets with a &ldquo;${esc(drillSecFilter)}&rdquo; security status.</div>`);
}
function openDrill(key){
  const d = DRILLS[key]; if(!d) return;
  document.getElementById('drawerEyebrow').textContent = d.eyebrow;
  document.getElementById('drawerTitle').textContent = d.title;
  document.getElementById('drawerSub').textContent = d.sub;
  if(d.sec){
    drillSecFilter = null;
    renderSecDrill();
  } else {
    const rows = viewAgents().filter(d.filter).slice().sort(d.sort);
    document.getElementById('drawerCount').textContent = rows.length;
    document.getElementById('drawerBody').innerHTML =
      rows.length ? drillRowsHTML(rows) : `<div class="drawer-empty">${d.empty||'No matching assets.'}</div>`;
  }
  const back = document.getElementById('drawerBack');
  back.classList.add('open');
  document.getElementById('drawerClose').focus();
}
function closeDrill(){ document.getElementById('drawerBack').classList.remove('open'); }

document.getElementById('kpis').addEventListener('click', e=>{
  const card = e.target.closest('.kpi[data-drill]'); if(card) openDrill(card.dataset.drill);
});
document.getElementById('kpis').addEventListener('keydown', e=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  const card = e.target.closest('.kpi[data-drill]'); if(card){ e.preventDefault(); openDrill(card.dataset.drill); }
});
document.getElementById('drawerClose').addEventListener('click', closeDrill);
document.getElementById('drawerBack').addEventListener('click', e=>{ if(e.target.id==='drawerBack') closeDrill(); });
document.getElementById('drawerBody').addEventListener('click', e=>{
  const chip = e.target.closest('[data-sec]'); if(!chip) return;
  drillSecFilter = chip.dataset.sec==='__all' ? null : chip.dataset.sec;
  renderSecDrill();
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrill(); });
