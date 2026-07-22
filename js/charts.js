/* AI Accelerator Dashboard · js/charts.js — KPI band, composition bars and governance flags (groupBars, buildStats)
   Loaded as a classic script (shared global scope); keep the load order in index.html. */
// grouped bar helper — bars are clickable to filter the whole dashboard
function groupBars(el, key, colorFn, limit){
  const source = viewAgents(key);
  const m={}; source.forEach(a=>{m[a[key]]=(m[a[key]]||0)+1;});
  let entries=Object.entries(m).sort((a,b)=>b[1]-a[1]);
  if(limit) entries=entries.slice(0,limit);
  const max=Math.max(1,...entries.map(e=>e[1]));
  const activeVal = state.col[key]||'';
  const container = document.getElementById(el);
  container.innerHTML = entries.map(([k,v])=>`
    <div class="bar-row clickable${activeVal===k?' active':''}" role="button" tabindex="0" data-k="${esc(key)}" data-v="${esc(k)}" aria-pressed="${activeVal===k?'true':'false'}">
      <div class="lab"><span>${esc(k)}</span><b>${v}</b></div>
      <div class="track"><div class="fill" style="width:${pct(v,max)}%;background:${colorFn(k)}"></div></div>
    </div>`).join('');
  const wrap = container.closest('.bars-wrap');
  if(wrap) wrap.classList.toggle('has-more', container.scrollHeight > container.clientHeight + 1);
}

// KPIs + composition + governance flags
function buildStats(){
  const view = viewAgents();
  // No live data connected yet — show placeholders ("--"), never demo data.
  if(!dataReady){
    document.getElementById('totalCount').innerHTML = '&mdash;&mdash;';
    const blanks = [
      {l:'Total Assets', sub:'agents + accelerators + products', cls:'accent-ink'},
      {l:'In Production', sub:'awaiting data', cls:'accent-teal'},
      {l:'In Development', sub:'awaiting data', cls:'accent-teal'},
      {l:'Security Approved', sub:'awaiting data', cls:'accent-rose'},
      {l:'Avg Data Completeness', sub:'awaiting data', cls:'accent-amber'},
    ];
    document.getElementById('kpis').innerHTML = blanks.map(k=>
      `<div class="kpi ${k.cls}"><div class="n">&mdash;&mdash;</div><div class="l">${k.l}</div><div class="sub">${k.sub}</div></div>`
    ).join('');
    ['buBars','domBars','typeBars','matBars'].forEach(id=>{const el=document.getElementById(id); if(el) el.innerHTML='';});
    document.getElementById('flags').innerHTML = '<div class="flag"><div class="txt">Waiting for live data&hellip;</div></div>';
    return;
  }
  document.getElementById('totalCount').textContent = view.length;
  const active = view.filter(a=>a.status==='Production').length;
  const launchReady = view.filter(a=>a.status==='In Development').length;
  const secReviewed = view.filter(a=>a.security==='Approved'||a.security==='Approved with Conditions').length;
  const withRepo = view.filter(a=>a.hasRepo).length;
  const avgComplete = view.length? Math.round(view.reduce((s,a)=>s+a.complete,0)/view.length):0;

  const kpis = [
    {n:view.length, l:'Total Assets', sub:'agents + accelerators + products', cls:'accent-ink', drill:'all'},
    {n:active, l:'In Production', sub:pct(active,view.length)+'% of portfolio', cls:'accent-teal', drill:'active'},
    {n:launchReady, l:'In Development', sub:'actively being built', cls:'accent-teal', drill:'launch'},
    {n:secReviewed, l:'Security Approved', sub:secReviewed===0?'none recorded yet':pct(secReviewed,view.length)+'% approved', cls:'accent-rose', drill:'security'},
    {n:avgComplete, suffix:'%', l:'Avg Data Completeness', sub:'across governance fields', cls:'accent-amber', drill:'complete'},
  ];
  document.getElementById('kpis').innerHTML = kpis.map(k=>
    `<div class="kpi ${k.cls} drill${k.n===0?' is-zero':''}" data-drill="${k.drill}" role="button" tabindex="0" aria-label="${k.l} — view details"><div class="n">${k.n}${k.suffix?'<small>'+k.suffix+'</small>':''}</div><div class="l">${k.l}</div><div class="sub">${k.sub}</div><span class="drill-hint">View &rarr;</span></div>`
  ).join('');

  groupBars('buBars','bu', k=> k==='AI CoE'?teal : k==='Vamshi BU'?violet : mist);
  groupBars('domBars','domain', k=> k==='Uncategorized'?mist:teal);
  groupBars('typeBars', dynGroupKey, dynColor);
  groupBars('matBars','maturity', k=> (k==='Unspecified'||k==='Other')?mist : (k==='Beta'||k==='Stable'||k==='Mature / Battle-tested')?teal : amber);

  const noOwner = view.filter(a=>!a.owner).length;
  const noStatus = view.filter(a=>a.status==='Status not set').length;
  const noMaturity = view.filter(a=>a.maturity==='Unspecified').length;
  const noSec = view.filter(a=>a.security==='Not set').length;
  const noRepo = view.length - withRepo;
  const notApproved = view.filter(a=>['Not set','Not Reviewed','In Progress','Needs Update'].includes(a.security)).length;
  const flags = [
    {n:noMaturity, cls:'rose', t:'assets have <b>no maturity level</b> recorded &mdash; leadership can\'t tell demos from launch-ready work'},
    {n:notApproved, cls:'rose', t:'assets are <b>not security-approved</b> (not reviewed, in progress or unrecorded) &mdash; a compliance gap before any client exposure'},
    {n:noRepo, cls:'amber', t:'assets have <b>no storage/repo link</b> &mdash; the artifact can\'t be found or reused'},
    {n:noOwner, cls:'amber', t:'assets have <b>no named owner</b> &mdash; accountability gap for follow-up'},
    {n:noStatus, cls:'amber', t:'assets have <b>no lifecycle status</b> set'},
  ];
  document.getElementById('flags').innerHTML = flags.map(f=>
    `<div class="flag"><div class="big ${f.cls}">${f.n}</div><div class="txt">${f.t}</div></div>`
  ).join('');
}

