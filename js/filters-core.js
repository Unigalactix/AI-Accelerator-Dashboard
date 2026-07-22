/* AI Accelerator Dashboard · js/filters-core.js — shared filter engine (state, passFilters, viewAgents, toggleSeg)
   Loaded as a classic script (shared global scope); keep the load order in index.html. */
// Table
let state={q:'', sort:'complete', dir:1, col:{}, incomplete:false};

// Shared filter: returns AGENTS matching all active filters (chip, header selects, search).
// Pass exceptKey to ignore that column's own filter (used so each composition
// panel keeps showing all of its options even while it drives the filter).
function passFilters(a, exceptKey){
  if(state.incomplete && a.complete>=50) return false;
  for(const col in state.col){
    if(col===exceptKey) continue;
    const val=state.col[col]; if(!val) continue;
    if(col==='hasRepo'){ if((a.hasRepo?'yes':'no')!==val) return false; }
    else if(String(a[col]==null?'':a[col])!==val) return false;
  }
  if(state.q){ const q=state.q.toLowerCase();
    if(!((a.name||'')+(a.owner||'')+(a.domain||'')+(a.bu||'')+(a.id||'')).toLowerCase().includes(q)) return false; }
  return true;
}
function viewAgents(exceptKey){ return AGENTS.filter(a=>passFilters(a, exceptKey)); }

// Toggle a composition segment on/off, then refresh the whole dashboard in sync.
function toggleSeg(k, v){
  if(state.col[k]===v) delete state.col[k];
  else state.col[k]=v;
  masterRender();
}

