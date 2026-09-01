(function(){
  // Served statically from /apps/dev-tracker/ (no bundler, so this is a hardcoded constant
  // rather than a build-time env var) — the shared Postgres-reachable backend that also serves
  // Manage Access/profile, exposed publicly as https://audit-capa-api.emamiapps.in/api. Dev
  // Tracker's routes are mounted there under /dev-tracker (see backend/devTracker.js).
  const API_BASE = 'https://audit-capa-api.emamiapps.in/api/dev-tracker';
  // Root of the same backend, used below to show who's signed in (src/lib/authApi.ts's
  // getMyProfile) — same base home.js already uses for its own greeting/account-bar.
  const ACCESS_API_BASE = 'https://audit-capa-api.emamiapps.in/api';
  // Same localStorage key the hub writes on login (AuthContext.tsx's AUTH_EMAIL_STORAGE_KEY).
  const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email';

  // These start empty and get populated in-place (via .push, not reassignment) by
  // loadMasterData() at startup — FIELDS below holds direct references to these same array
  // objects, so mutating them in place means FIELDS's dropdown options update automatically
  // once the real data arrives, without FIELDS needing to be rebuilt.
  let STATUS_OPTS = [];
  let AREA_OPTS = [];

  // Populated from master data too (the 'area' category's color/softColor columns) — each
  // module gets its own accent color, edited from the "Manage master data" tile instead of
  // being hardcoded here.
  let MODULE_THEME = {};
  const DEFAULT_THEME = {accent:"#3e7cb1", soft:"#e7f0f7"};
  function themeFor(area){ return MODULE_THEME[area] || DEFAULT_THEME; }
  function hexToRgba(hex, alpha){
    const h = hex.replace('#','');
    const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Small stroke icons for the stat cards — same visual language (2px stroke,
  // round caps, currentColor) as the module-view button icons already in dashboard.html.
  const ICONS = {
    total: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"></rect><rect x="3" y="10" width="18" height="4" rx="1"></rect><rect x="3" y="16" width="18" height="4" rx="1"></rect></svg>',
    active: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 12 8 12 10 6 14 18 16 12 21 12"></polyline></svg>',
    completed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="8 12 11 15 16 9"></polyline></svg>',
    overdue: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path></svg>'
  };
  let IMPACT_OPTS = [];
  let COMPLEXITY_OPTS = [];
  let PRIORITY_OPTS = [];
  let FACTORY_OPTS = [];
  let REASON_OPTS = [""]; // leading "" kept for parity with fieldInput()'s own filter — harmless either way

  const STAGE_PIPELINE = [
    {key:"reqDiscussion", status:"Requirement Discussion"},
    {key:"fsPrep", status:"FS Preparation"},
    {key:"development", status:"In Progress"},
    {key:"itTesting", status:"IT Testing"},
    {key:"userTesting", status:"User Testing"}
  ];
  const MANUAL_ONLY_STATUSES = ["Hypercare","Completed","On Hold","Cancelled"];

  // Full left-to-right order for the status progress bar — includes Hypercare and Completed,
  // which STAGE_PIPELINE deliberately excludes (they're not tied to a single date field the way
  // the five pipeline stages are). "Not Started" anchors the 0% end.
  const STATUS_PROGRESS_ORDER = [
    "Not Started", "Requirement Discussion", "FS Preparation", "In Progress",
    "IT Testing", "User Testing", "Hypercare", "Completed"
  ];
  function statusProgress(status){
    // On Hold and Cancelled render as an empty bar, not a partial one — however much progress
    // happened before the pause, showing it filled would read as "still advancing," which is
    // exactly wrong for something that's stopped.
    if(status === "On Hold" || status === "Cancelled") return 0;
    const idx = STATUS_PROGRESS_ORDER.indexOf(status);
    if(idx === -1) return 0;
    return Math.round((idx / (STATUS_PROGRESS_ORDER.length - 1)) * 100);
  }

  const FIELDS = [
    {key:"devList", label:"Development List", type:"text", required:true},
    {key:"status", label:"Status", type:"select", options:STATUS_OPTS},
    {key:"area", label:"Area", type:"select", options:AREA_OPTS},
    {key:"func", label:"Function", type:"text"},
    {key:"impact", label:"Business Impact", type:"select", options:IMPACT_OPTS},
    {key:"complexity", label:"Technical Complexity", type:"select", options:COMPLEXITY_OPTS},
    {key:"priority", label:"Priority", type:"select", options:PRIORITY_OPTS},
    {key:"spocFunction", label:"SPOC Function", type:"text"},
    {key:"spocIT", label:"SPOC IT", type:"text"},
    {key:"devFactory", label:"Dev Factory", type:"select", options:FACTORY_OPTS},
    {key:"startDate", label:"Start Date", type:"date"},
    {key:"reqDiscussion", label:"Requirement Discussion", type:"date"},
    {key:"fsPrep", label:"FS Preparation", type:"date"},
    {key:"development", label:"Development", type:"date"},
    {key:"itTesting", label:"IT Testing", type:"date"},
    {key:"userTesting", label:"User Testing", type:"date"},
    {key:"hypercare", label:"Hypercare (days)", type:"number"},
    {key:"targetDate", label:"Target Date", type:"date"},
    {key:"devTime", label:"Development Time (man-day)", type:"number"},
    {key:"rework", label:"Rework (days)", type:"number"},
    {key:"reasonCategory", label:"Reason for Delay (category)", type:"select", options:REASON_OPTS},
    {key:"reasonDelay", label:"Delay Details", type:"textarea"},
    {key:"remarks", label:"Remarks", type:"textarea"},
    {key:"developer", label:"Developer", type:"text"}
  ];

  const COLUMNS = [
    {key:"sno", label:"S.No"}, {key:"devList", label:"Development List"}, {key:"status", label:"Status"},
    {key:"daysInStage", label:"Days in Stage"}, {key:"area", label:"Area"}, {key:"priority", label:"Priority"},
    {key:"spocFunction", label:"SPOC Function"}, {key:"devFactory", label:"Dev Factory"},
    {key:"startDate", label:"Start Date"}, {key:"targetDate", label:"Target Date"}, {key:"revisedTarget", label:"Revised Target"},
    {key:"devTime", label:"Man-days"}, {key:"rework", label:"Rework (d)"}, {key:"developer", label:"Developer"}, {key:"actions", label:""}
  ];

  let rows = [];
  let editingId = null;
  let sortKey = "startDate";
  let sortDir = 1;
  const $ = (sel) => document.querySelector(sel);

  function todayStr(){ return new Date().toISOString().slice(0,10); }
  function daysBetween(a,b){
    const d1 = new Date(a+"T00:00:00"), d2 = new Date(b+"T00:00:00");
    return Math.round((d2-d1)/86400000);
  }
  function addDays(dateStr, days){
    if(!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + (Number(days)||0));
    return d.toISOString().slice(0,10);
  }
  function revisedTarget(row){
    const rework = Number(row.rework)||0;
    if(!row.targetDate) return "";
    return rework > 0 ? addDays(row.targetDate, rework) : row.targetDate;
  }
  function fmtDate(d){
    if(!d) return "";
    const dt = new Date(d + "T00:00:00");
    if(isNaN(dt)) return d;
    return dt.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function suggestedStatus(row){
    let current = null;
    for(const stage of STAGE_PIPELINE){
      if(row[stage.key]) current = stage.status;
    }
    return current || "Not Started";
  }

  function currentStageInfo(row){
    if(MANUAL_ONLY_STATUSES.includes(row.status)) return null;
    let stage = null;
    for(const s of STAGE_PIPELINE){
      if(row.status === s.status) stage = s;
    }
    if(!stage || !row[stage.key]) return null;
    return {days: daysBetween(row[stage.key], todayStr()), stageKey: stage.key};
  }

  // --- API layer ---
  async function apiList(){
    const res = await fetch(API_BASE + '/items');
    if(!res.ok) throw new Error('Failed to load items');
    return res.json();
  }
  async function apiCreate(data){
    const res = await fetch(API_BASE + '/items', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    });
    if(!res.ok) throw new Error((await res.json()).error || 'Failed to create item');
    return res.json();
  }
  async function apiUpdate(id, data){
    const res = await fetch(API_BASE + '/items/' + id, {
      method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    });
    if(!res.ok) throw new Error((await res.json()).error || 'Failed to update item');
    return res.json();
  }
  async function apiDelete(id){
    const res = await fetch(API_BASE + '/items/' + id, { method: 'DELETE' });
    if(!res.ok && res.status !== 204) throw new Error('Failed to delete item');
  }
  async function apiHistory(id){
    const res = await fetch(API_BASE + '/items/' + id + '/history');
    if(!res.ok) return [];
    return res.json();
  }

  // Populates the option arrays above from dev_tracker.master_data (see backend/devTracker.js)
  // instead of the values being hardcoded — editable from the "Manage master data" tile.
  async function loadMasterData(){
    const res = await fetch(API_BASE + '/master-data');
    if(!res.ok) return; // leave whatever's already loaded (empty on first failure) rather than throw
    const rows = (await res.json()).filter(r=>r.active);
    const byCategory = {};
    rows.forEach(r=>{ (byCategory[r.category] = byCategory[r.category] || []).push(r); });

    STATUS_OPTS.length = 0;
    (byCategory.status || []).forEach(r=> STATUS_OPTS.push(r.value));

    AREA_OPTS.length = 0;
    Object.keys(MODULE_THEME).forEach(k=> delete MODULE_THEME[k]);
    (byCategory.area || []).forEach(r=>{
      AREA_OPTS.push(r.value);
      if(r.color) MODULE_THEME[r.value] = {accent: r.color, soft: r.softColor || DEFAULT_THEME.soft};
    });

    PRIORITY_OPTS.length = 0;
    (byCategory.priority || []).forEach(r=> PRIORITY_OPTS.push(r.value));

    IMPACT_OPTS.length = 0;
    (byCategory.impact || []).forEach(r=> IMPACT_OPTS.push(r.value));

    COMPLEXITY_OPTS.length = 0;
    (byCategory.complexity || []).forEach(r=> COMPLEXITY_OPTS.push(r.value));

    FACTORY_OPTS.length = 0;
    (byCategory.devFactory || []).forEach(r=> FACTORY_OPTS.push(r.value));

    REASON_OPTS.length = 0;
    REASON_OPTS.push("");
    (byCategory.reasonCategory || []).forEach(r=> REASON_OPTS.push(r.value));
  }

  async function loadRows(){
    try{
      rows = await apiList();
    }catch(e){
      rows = [];
      console.error(e);
    }
  }

  function populateFilterOptions(){
    const fs = $('#filterStatus'), fp = $('#filterPriority'), fa = $('#filterArea');
    fs.innerHTML = '<option value="">All statuses</option>' + STATUS_OPTS.map(o=>`<option value="${o}">${o}</option>`).join('');
    fp.innerHTML = '<option value="">All priorities</option>' + PRIORITY_OPTS.map(o=>`<option value="${o}">${o}</option>`).join('');
    fa.innerHTML = '<option value="">All areas</option>' + AREA_OPTS.map(o=>`<option value="${o}">${o}</option>`).join('');
  }

  function renderHead(){
    const tr = $('#headRow'); tr.innerHTML = '';
    COLUMNS.forEach(c=>{
      const th = document.createElement('th');
      th.textContent = c.label + (sortKey===c.key ? (sortDir===1 ? ' ↑' : ' ↓') : '');
      th.addEventListener('click', ()=>{
        if(c.key==='actions') return;
        if(sortKey===c.key){ sortDir *= -1; } else { sortKey = c.key; sortDir = 1; }
        renderTable();
      });
      tr.appendChild(th);
    });
  }

  function getFiltered(){
    const q = $('#searchInput').value.trim().toLowerCase();
    const fStatus = $('#filterStatus').value, fPriority = $('#filterPriority').value, fArea = $('#filterArea').value;
    return rows.filter(r=>{
      if(fStatus && r.status !== fStatus) return false;
      if(fPriority && r.priority !== fPriority) return false;
      if(fArea && r.area !== fArea) return false;
      if(q){
        const hay = [r.devList, r.func, r.developer, r.remarks, r.spocFunction, r.spocIT].join(' ').toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function sortRows(list){
    return list.slice().sort((a,b)=>{
      let av, bv;
      if(sortKey === 'sno'){ av = rows.indexOf(a); bv = rows.indexOf(b); }
      else if(sortKey === 'revisedTarget'){ av = revisedTarget(a); bv = revisedTarget(b); }
      else if(sortKey === 'daysInStage'){
        const ai = currentStageInfo(a), bi = currentStageInfo(b);
        av = ai ? ai.days : -1; bv = bi ? bi.days : -1;
      }
      else { av = a[sortKey] ?? ''; bv = b[sortKey] ?? ''; }
      if(av < bv) return -1*sortDir;
      if(av > bv) return 1*sortDir;
      return 0;
    });
  }

  function statusColor(status){
    const map = {
      "Not Started": {bg:"#eef0f3", fg:"#647084"}, "Requirement Discussion": {bg:"#eef0fb", fg:"#5b5bd6"},
      "FS Preparation": {bg:"#f4edfb", fg:"#8b4fc7"}, "In Progress": {bg:"#e7f0f7", fg:"#3e7cb1"},
      "IT Testing": {bg:"#e3f6fa", fg:"#1a94ad"}, "User Testing": {bg:"#e6f6f2", fg:"#1f9d80"},
      "Hypercare": {bg:"#fdf2df", fg:"#a56a12"}, "Completed": {bg:"#e6f6ee", fg:"#2f9e63"},
      "On Hold": {bg:"#fdf0e3", fg:"#c4711b"}, "Cancelled": {bg:"#fbeaea", fg:"#d9534f"}
    };
    return map[status] || {bg:"#eef0f3", fg:"#647084"};
  }

  function applyModuleTheme(){
    const area = $('#filterArea').value;
    const theme = area ? themeFor(area) : DEFAULT_THEME;
    document.documentElement.style.setProperty('--module-accent', theme.accent);
    document.documentElement.style.setProperty('--module-accent-soft', theme.soft);
    $('#moduleView').classList.toggle('scoped', !!area);
  }

  function scopedRows(){
    const area = $('#filterArea').value;
    return area ? rows.filter(r=>r.area===area) : rows;
  }

  function renderStats(){
    const data = scopedRows();
    const total = data.length;
    const completed = data.filter(r=>r.status==='Completed').length;
    const active = data.filter(r=>!['Completed','Cancelled'].includes(r.status)).length;
    const overdue = data.filter(r=>{
      if(['Completed','Cancelled'].includes(r.status)) return false;
      const rt = revisedTarget(r);
      return rt && rt < todayStr();
    }).length;
    const stats = [
      {label:'Total Items', num: total, cls:'', icon: ICONS.total},
      {label:'Active', num: active, cls:'active', icon: ICONS.active},
      {label:'Completed', num: completed, cls:'completed', icon: ICONS.completed},
      {label:'Overdue', num: overdue, cls:'overdue', icon: ICONS.overdue}
    ];
    $('#stats').innerHTML = stats.map(s=>`<div class="stat-card ${s.cls}"><div class="stat-card-top"><span class="stat-icon">${s.icon}</span><div class="num">${s.num}</div></div><div class="label">${s.label}</div></div>`).join('');
  }

  function renderCharts(){
    const data = scopedRows();
    const scopeArea = $('#filterArea').value;
    const total = data.length || 1;
    const statusCounts = {};
    data.forEach(r=>{ statusCounts[r.status||"Not Started"] = (statusCounts[r.status||"Not Started"]||0)+1; });
    const topStatuses = Object.entries(statusCounts).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const donutColors = ["#5da8e0","#3fcf9e","#e8a33d","#e0716d"];
    const circumference = 2*Math.PI*15.5;
    let offset = 0;
    const segs = topStatuses.map(([label,count],i)=>{
      const len = (count/total)*circumference;
      const seg = `<circle cx="18" cy="18" r="15.5" fill="none" stroke="${donutColors[i]}" stroke-width="4" stroke-dasharray="${len.toFixed(1)} ${(circumference-len).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" stroke-linecap="round"></circle>`;
      offset += len; return seg;
    }).join('');
    const legend = topStatuses.map(([label,count],i)=>
      `<div><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${donutColors[i]};margin-right:6px;"></span>${label} · ${Math.round(count/total*100)}%</div>`
    ).join('');

    // Second tile: Area breakdown when viewing all modules, or Priority split
    // when scoped to one module — a single-bar "area breakdown" showing just
    // the module you already picked isn't informative, so swap it for
    // something that still tells you something new about that module.
    let secondTileLabel, secondTileHtml;
    if(scopeArea){
      const theme = themeFor(scopeArea);
      const priCounts = {P1:0,P2:0,P3:0};
      data.forEach(r=>{ if(r.priority) priCounts[r.priority] = (priCounts[r.priority]||0)+1; });
      const maxPri = Math.max(priCounts.P1, priCounts.P2, priCounts.P3, 1);
      secondTileLabel = 'Priority split';
      secondTileHtml = ["P1","P2","P3"].map(p=>{
        const alpha = p==="P1" ? 1 : (p==="P2" ? 0.65 : 0.35);
        const col = hexToRgba(theme.accent, alpha);
        return `<div class="bar-row"><span class="bar-name">${p}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(priCounts[p]/maxPri*100)}%;background:${col};"></div></div><span class="bar-val">${priCounts[p]}</span></div>`;
      }).join('');
    } else {
      const areaCounts = {};
      AREA_OPTS.forEach(a=>areaCounts[a]=0);
      data.forEach(r=>{ if(r.area) areaCounts[r.area] = (areaCounts[r.area]||0)+1; });
      const areaEntries = Object.entries(areaCounts).filter(([,c])=>c>0).sort((a,b)=>b[1]-a[1]).slice(0,5);
      const maxArea = Math.max(...areaEntries.map(e=>e[1]), 1);
      secondTileLabel = 'Area breakdown';
      secondTileHtml = areaEntries.map(([label,count])=>
        `<div class="bar-row"><span class="bar-name">${label}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(count/maxArea*100)}%;background:#5da8e0;"></div></div><span class="bar-val">${count}</span></div>`
      ).join('') || '<div style="font-size:11px;color:#9db4d6;">No data yet</div>';
    }

    const checkpoints = [25,20,15,10,5,0];
    const overdueTrend = checkpoints.map(daysAgo=>{
      const checkDate = addDays(todayStr(), -daysAgo);
      return data.filter(r=>{
        if(['Completed','Cancelled'].includes(r.status)) return false;
        const rt = revisedTarget(r);
        return rt && rt < checkDate;
      }).length;
    });
    const maxOverdue = Math.max(...overdueTrend, 1);
    const w=180, h=46;
    const pts = overdueTrend.map((c,i)=>{
      const x = (i/(overdueTrend.length-1))*w;
      const y = h - (c/maxOverdue)*h + 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const lastPt = pts.split(' ').slice(-1)[0].split(',');
    const trendColor = overdueTrend[overdueTrend.length-1] > 0 ? "#e0716d" : "#3fcf9e";

    const devCounts = {};
    data.forEach(r=>{
      const dev = r.developer || "Unassigned";
      if(!['Completed','Cancelled'].includes(r.status)) devCounts[dev] = (devCounts[dev]||0)+1;
    });
    const devEntries = Object.entries(devCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const maxDev = Math.max(...devEntries.map(e=>e[1]), 1);
    const devBars = devEntries.map(([label,count])=>
      `<div class="bar-row"><span class="bar-name">${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(count/maxDev*100)}%;background:#3fcf9e;"></div></div><span class="bar-val">${count}</span></div>`
    ).join('') || '<div style="font-size:11px;color:#9db4d6;">No active items</div>';

    $('#chartRow').innerHTML = `
      <div class="chart-tile" style="display:flex;align-items:center;gap:14px;">
        <svg width="64" height="64" viewBox="0 0 36 36">${segs}</svg>
        <div style="flex:1;"><div class="tile-label">Status mix</div><div style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#e7edf5;">${legend}</div></div>
      </div>
      <div class="chart-tile"><div class="tile-label">${secondTileLabel}</div>${secondTileHtml}</div>
      <div class="chart-tile">
        <div class="tile-label">Overdue burn-down (25d trend)</div>
        <svg width="100%" height="46" viewBox="0 0 180 46" preserveAspectRatio="none">
          <polyline points="${pts}" fill="none" stroke="${trendColor}" stroke-width="2.5"></polyline>
          <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="3" fill="${trendColor}"></circle>
        </svg>
      </div>
      <div class="chart-tile"><div class="tile-label">Workload (active items)</div>${devBars}</div>
    `;
  }

  function renderModuleView(){
    const menu = $('#moduleViewMenu');
    const btnLabel = $('#moduleViewLabel');
    if(!menu || !btnLabel) return;
    const activeArea = $('#filterArea').value;
    const counts = {};
    AREA_OPTS.forEach(a=>counts[a]=0);
    rows.forEach(r=>{ if(r.area) counts[r.area] = (counts[r.area]||0)+1; });
    const presentAreas = AREA_OPTS.filter(a=>counts[a] > 0);

    const items = [{label:'All modules', value:'', count: rows.length}]
      .concat(presentAreas.map(a=>({label:a, value:a, count:counts[a]})));

    menu.innerHTML = items.map(it=>{
      const swatchColor = it.value ? themeFor(it.value).accent : '#94a3b8';
      return `<div class="module-view-item${it.value===activeArea?' active':''}" data-area="${it.value}">
         <span class="module-view-item-label"><span class="swatch" style="background:${swatchColor}"></span>${it.label}</span><span class="count">${it.count}</span>
       </div>`;
    }).join('');

    btnLabel.textContent = activeArea || 'All modules';

    menu.querySelectorAll('.module-view-item').forEach(el=>{
      el.addEventListener('click', (e)=>{
        e.stopPropagation();
        $('#filterArea').value = el.getAttribute('data-area');
        $('#moduleView').classList.remove('open');
        renderTable();
      });
    });
  }

  function renderScopeBanner(){
    const banner = $('#scopeBanner');
    if(!banner) return;
    const area = $('#filterArea').value;
    if(!area){ banner.style.display = 'none'; banner.innerHTML = ''; return; }

    const data = scopedRows();
    const total = data.length;
    const active = data.filter(r=>!['Completed','Cancelled'].includes(r.status)).length;
    const completed = data.filter(r=>r.status==='Completed').length;
    const overdue = data.filter(r=>{
      if(['Completed','Cancelled'].includes(r.status)) return false;
      const rt = revisedTarget(r);
      return rt && rt < todayStr();
    }).length;

    banner.style.display = 'flex';
    banner.innerHTML = `
      <span>Viewing <strong>${area}</strong> — ${total} item${total===1?'':'s'} · ${active} active · ${overdue} overdue · ${completed} completed</span>
      <button class="clear-scope" type="button" id="clearScopeBtn">Clear view</button>
    `;
    $('#clearScopeBtn').addEventListener('click', ()=>{
      $('#filterArea').value = '';
      renderTable();
    });
  }

  function renderTable(){
    applyModuleTheme();
    renderHead(); renderStats(); renderCharts(); renderModuleView(); renderScopeBanner();
    const tbody = $('#tbody');
    const filtered = sortRows(getFiltered());
    if(filtered.length === 0){
      tbody.innerHTML = `<tr><td colspan="${COLUMNS.length}"><div class="empty-state"><h3>No items match</h3><div>Try clearing filters or add a new development item.</div></div></td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    filtered.forEach(r=>{
      const rt = revisedTarget(r);
      const overdue = rt && rt < todayStr() && !['Completed','Cancelled'].includes(r.status);
      const sno = rows.indexOf(r) + 1;
      const stageInfo = currentStageInfo(r);
      let stageCell = '<span class="cell-dim">—</span>';
      if(stageInfo){
        const stalled = stageInfo.days > 7;
        stageCell = `<span class="${stalled?'cell-stalled':'cell-mono'}">${stageInfo.days}d</span>`;
      }
      const tr = document.createElement('tr');
      if(r.area){
        const rowTheme = themeFor(r.area);
        tr.style.setProperty('--row-accent', rowTheme.accent);
        tr.style.setProperty('--row-bg', hexToRgba(rowTheme.accent, 0.045));
        tr.style.setProperty('--row-bg-hover', hexToRgba(rowTheme.accent, 0.09));
      }
      tr.innerHTML = `
        <td class="cell-mono">${sno}</td>
        <td class="cell-title">${escapeHtml(r.devList||'')}</td>
        <td>${r.status ? `<span class="badge" style="background:${statusColor(r.status).bg};color:${statusColor(r.status).fg}">${r.status}</span>
          <div class="status-progress-track"><div class="status-progress-fill" style="width:${statusProgress(r.status)}%;background:${r.area ? themeFor(r.area).accent : 'var(--module-accent)'}"></div></div>` : ''}</td>
        <td>${stageCell}</td>
        <td>${r.area ? `<span class="badge" style="background:${themeFor(r.area).soft};color:${themeFor(r.area).accent}">${r.area}</span>` : ''}</td>
        <td>${r.priority ? `<span class="badge pri-${r.priority}">${r.priority}</span>` : ''}</td>
        <td class="cell-dim">${escapeHtml(r.spocFunction||'')}</td>
        <td class="cell-dim">${r.devFactory||''}</td>
        <td class="cell-mono">${fmtDate(r.startDate)}</td>
        <td class="cell-mono">${fmtDate(r.targetDate)}</td>
        <td class="cell-mono ${overdue?'cell-overdue':''}">${fmtDate(rt)}</td>
        <td class="cell-mono">${r.devTime ?? ''}</td>
        <td class="cell-mono">${r.rework ?? ''}</td>
        <td class="cell-dim">${escapeHtml(r.developer||'')}</td>
        <td><button class="btn-secondary btn-small" data-edit="${r.id}">Edit</button></td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-edit]').forEach(btn=>{
      btn.addEventListener('click', ()=> openPanel(btn.getAttribute('data-edit')));
    });
  }

  function fieldInput(f, value){
    const id = 'f_' + f.key;
    if(f.type === 'select'){
      const opts = ['<option value="">-- select --</option>'].concat(
        f.options.filter(o=>o!=="").map(o=>`<option value="${o}" ${value===o?'selected':''}>${o}</option>`)
      ).join('');
      return `<select id="${id}">${opts}</select>`;
    }
    if(f.type === 'textarea') return `<textarea id="${id}">${value?escapeHtml(value):''}</textarea>`;
    if(f.type === 'date') return `<input type="date" id="${id}" value="${value||''}" />`;
    if(f.type === 'number') return `<input type="number" id="${id}" value="${value ?? ''}" min="0" />`;
    return `<input type="text" id="${id}" value="${value?escapeHtml(value):''}" />`;
  }

  async function openPanel(id){
    editingId = id || null;
    const row = editingId ? rows.find(r=>r.id===editingId) : {};
    $('#panelTitle').textContent = editingId ? 'Edit Development Item' : 'New Development Item';
    $('#deleteBtn').style.display = editingId ? 'inline-block' : 'none';

    const body = $('#panelBody');
    body.innerHTML = '';

    const groups = [
      {label:"Overview", fields:["devList","status","area","func"]},
      {label:"Classification", fields:["impact","complexity","priority"]},
      {label:"Ownership", fields:["spocFunction","spocIT","devFactory","developer"]},
      {label:"Timeline", fields:["startDate","reqDiscussion","fsPrep","development","itTesting","userTesting","targetDate"]},
      {label:"Effort", fields:["hypercare","devTime","rework"]},
      {label:"Notes", fields:["reasonCategory","reasonDelay","remarks"]}
    ];

    groups.forEach(g=>{
      const lab = document.createElement('div');
      lab.className = 'section-label'; lab.textContent = g.label;
      body.appendChild(lab);
      g.fields.forEach(key=>{
        const f = FIELDS.find(x=>x.key===key);
        const wrap = document.createElement('div');
        wrap.className = 'field';
        wrap.innerHTML = `<label>${f.label}${f.required?' *':''}</label>` + fieldInput(f, row[key]);
        body.appendChild(wrap);
      });
      if(g.label === "Overview"){
        const sugWrap = document.createElement('div');
        sugWrap.id = 'suggestWrap';
        body.appendChild(sugWrap);
      }
      if(g.label === "Effort"){
        const warnWrap = document.createElement('div');
        warnWrap.id = 'reworkWarnWrap';
        body.appendChild(warnWrap);
      }
    });

    const computedWrap = document.createElement('div');
    computedWrap.className = 'computed-box'; computedWrap.id = 'computedBox';
    body.appendChild(computedWrap);

    if(editingId){
      const histWrap = document.createElement('div');
      histWrap.id = 'historyWrap';
      histWrap.innerHTML = '<div class="section-label">Recent changes</div><div style="font-size:12px;color:var(--muted);">Loading...</div>';
      body.appendChild(histWrap);
      apiHistory(editingId).then(renderHistory).catch(()=>{
        histWrap.innerHTML = '<div class="section-label">Recent changes</div><div style="font-size:12px;color:var(--muted);">Unable to load history.</div>';
      });
    }

    updateComputed();
    updateSuggestion();
    updateReworkWarning();

    ['f_targetDate','f_rework'].forEach(id=>{
      document.getElementById(id)?.addEventListener('input', ()=>{ updateComputed(); updateReworkWarning(); });
    });
    ['f_reqDiscussion','f_fsPrep','f_development','f_itTesting','f_userTesting'].forEach(id=>{
      document.getElementById(id)?.addEventListener('input', updateSuggestion);
    });
    document.getElementById('f_status')?.addEventListener('change', updateReworkWarning);

    $('#overlay').classList.add('open');
  }

  function renderHistory(entries){
    const wrap = document.getElementById('historyWrap');
    if(!wrap) return;
    if(!entries.length){
      wrap.innerHTML = '<div class="section-label">Recent changes</div><div style="font-size:12px;color:var(--muted);">No changes logged yet.</div>';
      return;
    }
    const fieldLabels = {};
    FIELDS.forEach(f=>{ fieldLabels[f.key] = f.label; });
    const list = entries.slice(0,8).map(h=>{
      const label = fieldLabels[h.field] || h.field;
      const when = new Date(h.changedAt.replace(' ','T') + 'Z').toLocaleString();
      return `<div style="font-size:12px;color:var(--muted);border-bottom:1px solid var(--line);padding:6px 0;">
        <strong style="color:var(--ink);">${label}</strong> changed to "${escapeHtml(h.newValue || '(empty)')}" &middot; ${when}
      </div>`;
    }).join('');
    wrap.innerHTML = '<div class="section-label">Recent changes</div>' + list;
  }

  function currentPanelData(){
    const data = {};
    FIELDS.forEach(f=>{ const el = document.getElementById('f_' + f.key); if(el) data[f.key] = el.value; });
    return data;
  }

  function updateComputed(){
    const target = document.getElementById('f_targetDate')?.value;
    const rework = document.getElementById('f_rework')?.value;
    const rt = target ? revisedTarget({targetDate:target, rework}) : '';
    const box = document.getElementById('computedBox');
    if(box) box.innerHTML = `<span>Revised Target Date (auto)</span><span class="val">${rt ? fmtDate(rt) : '—'}</span>`;
  }

  function updateSuggestion(){
    const wrap = document.getElementById('suggestWrap');
    if(!wrap) return;
    const data = currentPanelData();
    const currentStatus = document.getElementById('f_status')?.value;
    if(MANUAL_ONLY_STATUSES.includes(currentStatus)){ wrap.innerHTML = ''; return; }
    const suggestion = suggestedStatus(data);
    if(suggestion && suggestion !== currentStatus){
      wrap.innerHTML = `<div class="suggest-box"><span class="txt">Dates suggest status: <strong>${suggestion}</strong></span><button class="btn-secondary" type="button" id="applySuggestBtn">Apply</button></div>`;
      document.getElementById('applySuggestBtn').addEventListener('click', ()=>{
        document.getElementById('f_status').value = suggestion;
        updateSuggestion();
      });
    } else {
      wrap.innerHTML = '';
    }
  }

  function updateReworkWarning(){
    const wrap = document.getElementById('reworkWarnWrap');
    if(!wrap) return;
    const status = document.getElementById('f_status')?.value;
    const rework = Number(document.getElementById('f_rework')?.value || 0);
    if(rework > 0 && ['Hypercare','Completed'].includes(status)){
      wrap.innerHTML = `<div class="warn-box">Rework logged after ${status.toLowerCase()} — worth a note in Remarks on what slipped.</div>`;
    } else {
      wrap.innerHTML = '';
    }
  }

  function closePanel(){ $('#overlay').classList.remove('open'); editingId = null; }

  async function saveFromPanel(){
    const devListEl = document.getElementById('f_devList');
    if(!devListEl.value.trim()){
      devListEl.focus(); devListEl.style.borderColor = 'var(--red)'; return;
    }
    const data = currentPanelData();
    const saveBtn = $('#saveBtn');
    saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
    try{
      if(editingId){
        await apiUpdate(editingId, data);
      } else {
        await apiCreate(data);
      }
      await loadRows();
      closePanel();
      renderTable();
    }catch(e){
      alert(e.message || 'Failed to save item');
    }finally{
      saveBtn.disabled = false; saveBtn.textContent = 'Save Item';
    }
  }

  async function deleteRow(){
    if(!editingId) return;
    if(!confirm('Delete this development item? This cannot be undone.')) return;
    try{
      await apiDelete(editingId);
      await loadRows();
      closePanel();
      renderTable();
    }catch(e){
      alert(e.message || 'Failed to delete item');
    }
  }

  function exportCSV(){
    const headers = FIELDS.map(f=>f.label);
    const lines = [headers.join(',')];
    rows.forEach(r=>{
      const vals = FIELDS.map(f=>`"${String(r[f.key] ?? '').replace(/"/g,'""')}"`);
      lines.push(vals.join(','));
    });
    const blob = new Blob([lines.join('\n')], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'development_tracker.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // Signed-in-user chip shown on every page (see home.js's own copy, which additionally gets a
  // Sign out button — that lives only on the home page, not here, so ending the session mid-edit
  // isn't one click away from this screen).
  async function renderAccountBar(){
    const strip = document.getElementById('accountStrip');
    const bar = document.getElementById('accountBar');
    if(!strip || !bar) return;
    let email = null;
    try{ email = localStorage.getItem(HUB_EMAIL_STORAGE_KEY); }catch(e){ /* storage unavailable */ }
    if(!email) return;

    let displayName = email;
    try{
      const res = await fetch(`${ACCESS_API_BASE}/me?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if(data && data.success && data.profile && data.profile.name) displayName = data.profile.name;
    }catch(e){
      // Keep the email fallback already set above.
    }
    bar.innerHTML = `<span class="account-user" title="${escapeHtml(email)}">${escapeHtml(displayName)}</span>`;
    strip.style.display = 'flex';
  }

  function bindEvents(){
    $('#newBtn').addEventListener('click', ()=>openPanel(null));
    $('#closePanel').addEventListener('click', closePanel);
    $('#cancelBtn').addEventListener('click', closePanel);
    $('#saveBtn').addEventListener('click', saveFromPanel);
    $('#deleteBtn').addEventListener('click', deleteRow);
    $('#overlay').addEventListener('click', (e)=>{ if(e.target.id==='overlay') closePanel(); });
    $('#exportBtn').addEventListener('click', exportCSV);
    $('#searchInput').addEventListener('input', renderTable);
    $('#filterStatus').addEventListener('change', renderTable);
    $('#filterPriority').addEventListener('change', renderTable);
    $('#filterArea').addEventListener('change', renderTable);

    $('#moduleViewBtn').addEventListener('click', (e)=>{
      e.stopPropagation();
      $('#moduleView').classList.toggle('open');
    });
    document.addEventListener('click', (e)=>{
      const mv = $('#moduleView');
      if(mv && !mv.contains(e.target)) mv.classList.remove('open');
    });
  }

  async function init(){
    renderAccountBar();
    await loadMasterData();
    await loadRows(); populateFilterOptions(); bindEvents(); renderTable();

    const params = new URLSearchParams(window.location.search);
    if(params.get('action') === 'new'){
      openPanel(null);
      // Clean the URL so a refresh doesn't reopen the panel.
      window.history.replaceState({}, '', window.location.pathname);
    }
  }
  init();
})();
