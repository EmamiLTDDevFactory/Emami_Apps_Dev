(function(){
  // Same production API base as app.js (see comment there) — no bundler here, so it's a
  // hardcoded constant rather than a build-time env var.
  const API_BASE = 'https://audit-capa-api.emamiapps.in/api/dev-tracker';
  // Root of the same Postgres-reachable backend, used below to fetch the logged-in user's real
  // name from the hub's own /me profile endpoint (src/lib/authApi.ts's getMyProfile).
  const ACCESS_API_BASE = 'https://audit-capa-api.emamiapps.in/api';
  // Same localStorage key the hub writes on login (AuthContext.tsx's AUTH_EMAIL_STORAGE_KEY) —
  // readable here because Dev Tracker is served same-origin at /apps/dev-tracker, not in an
  // iframe/webview, so it shares the hub's localStorage.
  const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email';

  // Matches DEFAULT_MASTER_DATA's status list in backend/devTracker.js — status doesn't carry a
  // color column in master_data (only "area" does, for the module theme), so this stays a
  // hardcoded map here same as the standalone app's, rather than a half-migrated mix of the two.
  const STATUS_COLOR = {
    "Not Started": "#94a3b8", "Requirement Discussion": "#5b5bd6", "FS Preparation": "#8b4fc7",
    "In Progress": "#3e7cb1", "IT Testing": "#1a94ad", "User Testing": "#1f9d80",
    "Hypercare": "#e8a33d", "Completed": "#2f9e63", "On Hold": "#e8a33d", "Cancelled": "#d9534f"
  };

  // Resolved once at startup: the real logged-in user's first name if we can get one, else null
  // (greetings fall back to a name-less phrasing rather than a hardcoded placeholder).
  let currentUserFirstName = null;

  function firstNameFrom(fullName){
    return fullName ? fullName.trim().split(/\s+/)[0] : null;
  }

  // Best-effort fallback so the greeting still looks personal if the profile fetch fails (e.g.
  // offline) but we at least know who's logged in — turns "abhishek.tripathi" into "Abhishek".
  function nameFromEmail(email){
    const local = email.split('@')[0].split(/[._]/)[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : null;
  }

  async function resolveCurrentUserName(){
    let email = null;
    try{ email = localStorage.getItem(HUB_EMAIL_STORAGE_KEY); }catch(e){ /* storage unavailable */ }
    if(!email) return;

    currentUserFirstName = nameFromEmail(email);
    try{
      const res = await fetch(`${ACCESS_API_BASE}/me?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      const realName = firstNameFrom(data && data.success && data.profile && data.profile.name);
      if(realName) currentUserFirstName = realName;
    }catch(e){
      // Keep the email-derived fallback name already set above.
    }
    updateClock(); // re-render the greeting once we know (or refine) the name
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // The hub-auth Lambda's own API Gateway URL (src/lib/authApi.ts's AUTH_API_URL, normally an
  // Amplify build-time env var — no bundler here to inject it, so it's confirmed by hand instead:
  // extracted from the production hub's own JS bundle, and confirmed live by curling
  // /hub-auth/saml/logout and getting back a real SAML redirect to login.microsoftonline.com).
  const HUB_AUTH_API_BASE = 'https://in65bjvxjd.execute-api.ap-south-1.amazonaws.com/api';

  // Mirrors AuthContext.tsx's logout(): clears the same four keys it clears
  // (AUTH_STORAGE_KEY, AUTH_EMAIL_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY, AUTH_METHOD_STORAGE_KEY),
  // and — for an SSO login specifically — also ends the Entra ID (Microsoft) session via the same
  // SAML Single Logout redirect the hub itself uses, so a direct-email OR Microsoft login both
  // get a genuinely complete sign-out from here, not just the hub's own half of it.
  function clearHubSessionAndRedirect(){
    let email = null, wasSso = false;
    try{
      email = localStorage.getItem('emami_apps_user_email');
      wasSso = localStorage.getItem('emami_apps_login_method') === 'sso';
      ['emami_apps_is_logged_in','emami_apps_user_email','emami_apps_session_token','emami_apps_login_method']
        .forEach(k => localStorage.removeItem(k));
    }catch(e){ /* storage unavailable */ }

    if(wasSso && email){
      window.location.href = `${HUB_AUTH_API_BASE}/hub-auth/saml/logout?email=${encodeURIComponent(email)}`;
    } else {
      window.location.href = '/';
    }
  }

  // Signed-in-user strip, shown on every Dev Tracker page (see equivalent renderAccountBar() in
  // app.js/admin.js) — only the home page's copy gets a Sign out button, per its own instance
  // here, since ending the hub session from a sub-page felt like an easy way to lose work
  // mid-edit rather than a deliberate action. The strip stays display:none (set in the HTML)
  // until an identity actually resolves, so a not-yet-loaded state never flashes an empty bar.
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

    bar.innerHTML = `
      <span class="account-user" title="${escapeHtml(email)}">${escapeHtml(displayName)}</span>
      <button type="button" id="logoutBtn" class="account-link">Sign out</button>
    `;
    strip.style.display = 'flex';
    document.getElementById('logoutBtn').addEventListener('click', clearHubSessionAndRedirect);
  }

  // Shows the "Manage master data" tile only for users granted the "Admin" role for the
  // 'dev-tracker' app in the hub's own Manage Access screen (src/screens/UserAccessScreen.tsx,
  // backed by emami_apps.authorized_user_apps — same table/API every other per-app permission in
  // this hub already uses). Hiding the tile is a UI convenience only, not real access control —
  // the actual enforcement is server-side, in backend/devTracker.js's master-data write routes.
  async function revealAdminTileIfAuthorized(){
    const tile = document.getElementById('adminTile');
    if(!tile) return;
    let email = null;
    try{ email = localStorage.getItem(HUB_EMAIL_STORAGE_KEY); }catch(e){ /* storage unavailable */ }
    if(!email) return; // stays hidden — no identity, no access

    try{
      const res = await fetch(`${ACCESS_API_BASE}/access/me?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      const apps = (data && data.success && Array.isArray(data.apps)) ? data.apps : [];
      const isDevTrackerAdmin = apps.some(a => a.appId === 'dev-tracker' && a.role === 'Admin');
      if(isDevTrackerAdmin) tile.style.display = '';
    }catch(e){
      // Network/API failure — stays hidden, same fail-closed posture as everywhere else here.
    }finally{
      updateTileBannerState();
    }
  }

  // Whenever an odd number of tiles end up visible, the last visible one becomes a full-width
  // banner (see .tile-banner in home.css) instead of dangling alone beside empty grid space. This
  // is computed from actual visibility rather than DOM position, since the admin-only tile is
  // always present in the DOM (just hidden) — a plain :nth-child CSS rule would either fire for
  // the wrong tile or never fire once more always-visible tiles are added.
  function updateTileBannerState(){
    const tiles = Array.from(document.querySelectorAll('.tile-grid > .tile'))
      .filter(t => getComputedStyle(t).display !== 'none');
    tiles.forEach(t => t.classList.remove('tile-banner'));
    if(tiles.length % 2 === 1 && tiles.length > 1){
      tiles[tiles.length - 1].classList.add('tile-banner');
    }
  }

  function greetingForHour(h){
    const name = currentUserFirstName;
    if(!name) return h < 5 || h >= 21 ? "Working late?" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    if(h < 5) return "Working late, " + name + "?";
    if(h < 12) return "Good morning, " + name;
    if(h < 17) return "Good afternoon, " + name;
    if(h < 21) return "Good evening, " + name;
    return "Working late, " + name + "?";
  }

  function updateClock(){
    const now = new Date();
    document.getElementById('greeting').textContent = greetingForHour(now.getHours());
    document.getElementById('homeDate').textContent = now.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    document.getElementById('homeClock').textContent = now.toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit'
    });
  }

  function todayStr(){ return new Date().toISOString().slice(0,10); }

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

  async function loadQuickStats(){
    try{
      const res = await fetch(API_BASE + '/items');
      if(!res.ok) throw new Error('failed');
      const rows = await res.json();

      const total = rows.length;
      const active = rows.filter(r=>!['Completed','Cancelled'].includes(r.status)).length;
      const overdue = rows.filter(r=>{
        if(['Completed','Cancelled'].includes(r.status)) return false;
        const rt = revisedTarget(r);
        return rt && rt < todayStr();
      }).length;

      renderStatusDistribution(rows, total);

      document.getElementById('tileDashMeta').textContent =
        total === 0 ? "No items yet — the tracker is empty." :
        `${total} item${total===1?'':'s'} tracked, ${active} active`;

      document.getElementById('homeFooter').textContent =
        overdue > 0
          ? `Heads up — ${overdue} item${overdue===1?' is':'s are'} past ${overdue===1?'its':'their'} revised target date.`
          : `Everything's on track — no overdue items right now.`;

    }catch(e){
      document.getElementById('statusDistBar').innerHTML = '';
      document.getElementById('statusDistLegend').innerHTML =
        `<div style="color:#9db4d6;font-size:11.5px;">Couldn't load live stats — the dashboard will still show everything.</div>`;
      document.getElementById('tileDashMeta').textContent = '';
      document.getElementById('homeFooter').textContent = '';
    }
  }

  // The distribution bar replaces four isolated stat numbers with one continuous bar showing the
  // actual composition of the tracker — how much of everything is in each status right now, at a
  // glance, colored to match STATUS_COLOR above.
  function renderStatusDistribution(rows, total){
    const bar = document.getElementById('statusDistBar');
    const legend = document.getElementById('statusDistLegend');
    bar.classList.remove('skeleton');

    if(total === 0){
      bar.innerHTML = `<div class="seg" style="width:100%;background:rgba(255,255,255,.15);"></div>`;
      legend.innerHTML = `<div style="color:#9db4d6;font-size:11.5px;">No items yet — add one to see the breakdown here.</div>`;
      return;
    }

    const counts = {};
    rows.forEach(r=>{ const s = r.status || 'Not Started'; counts[s] = (counts[s]||0)+1; });
    const ordered = Object.entries(counts).sort((a,b)=>b[1]-a[1]);

    bar.innerHTML = ordered.map(([status,count])=>{
      const pct = (count/total*100).toFixed(2);
      const color = STATUS_COLOR[status] || '#94a3b8';
      return `<div class="seg" style="width:${pct}%;background:${color};" title="${status}: ${count}"></div>`;
    }).join('');

    legend.innerHTML = ordered.map(([status,count])=>{
      const color = STATUS_COLOR[status] || '#94a3b8';
      return `<div class="leg-item"><span class="leg-dot" style="background:${color}"></span>${status} <span class="leg-count">${count}</span></div>`;
    }).join('');
  }

  function showCommandResponse(text, isError){
    const box = document.getElementById('homeCommandResponse');
    box.classList.toggle('error', !!isError);
    box.style.display = 'flex';
    box.innerHTML = `<span>${escapeHtml(text)}</span><button type="button" class="ai-response-close" id="homeCommandCloseBtn" aria-label="Dismiss">&times;</button>`;
    document.getElementById('homeCommandCloseBtn').addEventListener('click', ()=>{
      box.style.display = 'none';
    });
  }

  // Handles the same three intents the dashboard's own command bar does — but "filter" and
  // "create_draft" can't be applied on THIS page (there's no table or edit panel here), so instead
  // this hands off to dashboard.html with enough information for it to pick up exactly where the
  // request left off, rather than making the person retype anything.
  async function handleHomeCommand(){
    const input = document.getElementById('homeCommandInput');
    const btn = document.getElementById('homeCommandSend');
    const message = input.value.trim();
    if(!message) return;
    btn.disabled = true; btn.textContent = 'Thinking...';
    try{
      const res = await fetch(API_BASE + '/ai/command', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message})
      });
      const data = await res.json();
      if(!res.ok){
        showCommandResponse(data.error || 'Something went wrong.', true);
        return;
      }

      if(data.intent === 'answer'){
        showCommandResponse(data.text, false);

      } else if(data.intent === 'filter'){
        const f = data.filters || {};
        const params = new URLSearchParams();
        if(f.area) params.set('aiArea', f.area);
        if(f.status) params.set('aiStatus', f.status);
        if(f.priority) params.set('aiPriority', f.priority);
        if(f.overdueOnly) params.set('aiOverdue', '1');
        if(f.search) params.set('aiSearch', f.search);
        window.location.href = '/apps/dev-tracker/dashboard' + (params.toString() ? '?' + params.toString() : '');

      } else if(data.intent === 'create_draft'){
        sessionStorage.setItem('aiPendingDraft', JSON.stringify(data.draft || {}));
        window.location.href = '/apps/dev-tracker/dashboard?action=new';

      } else {
        showCommandResponse('Got an unexpected response — try rephrasing.', true);
      }
    }catch(e){
      showCommandResponse(e.message || 'Something went wrong.', true);
    }finally{
      btn.disabled = false; btn.textContent = 'Quick Ask';
    }
  }

  const FIELD_LABELS = {
    status: 'the status', area: 'the area', priority: 'the priority', func: 'the function',
    impact: 'the business impact', complexity: 'the technical complexity', spocFunction: 'the SPOC (function)',
    spocIT: 'the SPOC (IT)', devFactory: 'the dev factory', startDate: 'the start date',
    reqDiscussion: 'the requirement discussion date', fsPrep: 'the FS preparation date',
    development: 'the development date', itTesting: 'the IT testing date', userTesting: 'the user testing date',
    hypercare: 'the hypercare days', targetDate: 'the target date', devTime: 'the development time',
    rework: 'the rework days', reasonCategory: 'the delay reason', reasonDelay: 'the delay details',
    remarks: 'the remarks', developer: 'the developer', devList: 'the name'
  };

  function initials(name){ return (name || '?').slice(0,2).toUpperCase(); }

  function relativeTime(dateStr){
    const then = new Date(dateStr);
    const diffMs = Date.now() - then.getTime();
    const mins = Math.floor(diffMs / 60000);
    if(mins < 1) return 'just now';
    if(mins < 60) return mins + 'm ago';
    const hours = Math.floor(mins / 60);
    if(hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if(days < 7) return days + 'd ago';
    return then.toLocaleDateString(undefined, {month:'short', day:'numeric'});
  }

  function describeActivity(entry){
    const who = entry.changedByUsername || 'Someone';
    if(entry.field === '__created__'){
      return `<strong>${escapeHtml(who)}</strong> created <strong>${escapeHtml(entry.devList)}</strong>`;
    }
    const fieldLabel = FIELD_LABELS[entry.field] || ('the ' + entry.field);
    return `<strong>${escapeHtml(who)}</strong> updated ${fieldLabel} of <strong>${escapeHtml(entry.devList)}</strong> to "${escapeHtml(entry.newValue || '(empty)')}"`;
  }

  async function loadActivity(){
    try{
      const res = await fetch(API_BASE + '/activity');
      if(!res.ok) return;
      const entries = await res.json();
      if(entries.length === 0) return;

      const feed = document.getElementById('activityFeed');
      feed.style.display = 'block';
      document.getElementById('activityList').innerHTML = entries.map(e => `
        <div class="activity-row">
          <div class="activity-avatar">${initials(e.changedByUsername)}</div>
          <div class="activity-text">${describeActivity(e)}</div>
          <div class="activity-time">${relativeTime(e.changedAt)}</div>
        </div>
      `).join('');
    }catch(e){
      // Non-essential — the rest of the home page works fine without it.
    }
  }

  const PULSE_WINDOWS = [
    { label: 'Since start', days: null },
    { label: 'Last 6 months', days: 182 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 15 days', days: 15 },
    { label: 'Last 7 days', days: 7 }
  ];
  let pulseWindowIndex = 0;
  let pulseItemsCache = null;
  let pulseAreasCache = null;
  let pulseRotationTimer = null;

  function startPulseRotation(){
    if(pulseRotationTimer) return; // already running — never stack a second interval
    pulseRotationTimer = setInterval(rotatePulseWithSlide, 10000);
  }

  function stopPulseRotation(){
    if(pulseRotationTimer){
      clearInterval(pulseRotationTimer);
      pulseRotationTimer = null;
    }
  }

  // A real slide transition, not an instant content swap: the current content slides fully out to
  // the left, then the new window's content (already updated underneath) snaps in from the right
  // with no transition, then immediately slides into place. All timing here is plain setTimeout
  // rather than a `transitionend` listener, and a fixed duration matching the CSS is just as
  // accurate here since both durations are hardcoded to the same 260ms in this one place.
  const PULSE_SLIDE_MS = 260;
  function rotatePulseWithSlide(){
    const inner = document.getElementById('pulseSlideInner');
    if(!inner) return;
    inner.style.transition = `transform ${PULSE_SLIDE_MS}ms ease`;
    inner.style.transform = 'translateX(-100%)';
    setTimeout(()=>{
      pulseWindowIndex = (pulseWindowIndex + 1) % PULSE_WINDOWS.length;
      renderModulePulseBars();
      inner.style.transition = 'none';
      inner.style.transform = 'translateX(100%)';
      // Forces the browser to apply the "none transition + translateX(100%)" state immediately,
      // before the next line changes it again — without this, the browser can coalesce both style
      // changes into one paint and the slide-in would never actually animate.
      inner.offsetHeight;
      inner.style.transition = `transform ${PULSE_SLIDE_MS}ms ease`;
      inner.style.transform = 'translateX(0)';
    }, PULSE_SLIDE_MS);
  }

  // "Since start" (days: null) means no filter at all — every item ever created. Every other
  // window filters by createdAt, since that's the one date every item genuinely has (unlike
  // startDate/targetDate, which are often blank early on).
  function filterItemsByWindow(items, days){
    if(days === null) return items;
    const cutoff = Date.now() - days * 86400000;
    return items.filter(r => r.createdAt && new Date(r.createdAt).getTime() >= cutoff);
  }

  function renderModulePulseBars(){
    if(!pulseItemsCache || !pulseAreasCache) return;
    const win = PULSE_WINDOWS[pulseWindowIndex];
    document.getElementById('modulePulseWindowLabel').textContent = win.label;

    const filtered = filterItemsByWindow(pulseItemsCache, win.days);
    const list = document.getElementById('modulePulseList');

    const colorByArea = {};
    pulseAreasCache.forEach(a => { colorByArea[a.value] = a.color || '#94a3b8'; });

    // Every configured module gets a row, always — starting every area at zero and only
    // incrementing where real items exist in the current window, so a module with no items in
    // "Last 7 days" still shows up at 0% instead of the row disappearing.
    const statsByArea = {};
    pulseAreasCache.forEach(a => { statsByArea[a.value] = { total: 0, closed: 0, held: 0 }; });
    filtered.forEach(r => {
      const a = r.area || 'Unassigned';
      if(!statsByArea[a]) statsByArea[a] = { total: 0, closed: 0, held: 0 };
      statsByArea[a].total++;
      if(r.status === 'Completed') statsByArea[a].closed++;
      else if(r.status === 'On Hold' || r.status === 'Cancelled') statsByArea[a].held++;
    });
    const ordered = Object.entries(statsByArea).sort((a,b) => b[1].total - a[1].total);

    list.innerHTML = ordered.map(([area, stats]) => {
      const color = colorByArea[area] || '#94a3b8';
      const closedPct = stats.total > 0 ? Math.round((stats.closed / stats.total) * 100) : 0;
      const heldPct = stats.total > 0 ? Math.round((stats.held / stats.total) * 100) : 0;
      const activePct = stats.total > 0 ? Math.max(0, 100 - closedPct - heldPct) : 0;
      return `<div class="pulse-row" title="${stats.closed} closed, ${stats.held} on hold/cancelled, of ${stats.total} total (${win.label.toLowerCase()})">
        <span class="pulse-dot" style="background:${color}"></span>
        <span class="pulse-name">${escapeHtml(area)}</span>
        <div class="pulse-bar-track">
          <div class="pulse-seg" style="width:${closedPct}%;background:${color};"></div>
          <div class="pulse-seg" style="width:${heldPct}%;background:#c7ccd6;"></div>
          <div class="pulse-seg" style="width:${activePct}%;background:${hexToRgba(color, 0.28)};"></div>
        </div>
        <span class="pulse-count">${closedPct}%</span>
      </div>`;
    }).join('');
  }

  function hexToRgba(hex, alpha){
    const h = hex.replace('#','');
    const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  async function loadModulePulse(){
    try{
      const [itemsRes, areaRes] = await Promise.all([
        fetch(API_BASE + '/items'),
        fetch(API_BASE + '/master-data')
      ]);
      if(!itemsRes.ok || !areaRes.ok) return;
      pulseItemsCache = await itemsRes.json();
      pulseAreasCache = (await areaRes.json()).filter(r=>r.active && r.category==='area');
      if(pulseItemsCache.length === 0) return;

      const card = document.getElementById('modulePulse');
      card.style.display = 'block';
      pulseWindowIndex = 0;
      renderModulePulseBars();
      startPulseRotation();

      // Hovering pauses the rotation entirely — someone reading a specific window's numbers
      // shouldn't have the data change out from under them mid-read. It resumes with a fresh
      // 10-second countdown once the pointer leaves.
      card.addEventListener('mouseenter', stopPulseRotation);
      card.addEventListener('mouseleave', startPulseRotation);
    }catch(e){
      // Non-essential — the rest of the home page works fine without it.
    }
  }

  // ============================================================
  // Critical / time-sensitive panel — top 10 active items ranked by how overdue they are (or how
  // close their revised target date is) combined with priority, shown as auto-flipping placards.
  // On screens too narrow for the fixed side panel (see .side-panel's media query in home.css), an
  // edge tab opens the same list as a floating drawer instead — never a separate feature, just a
  // different presentation of the same ranked list, built from the same fetch.
  // ============================================================
  const PRIORITY_RANK = { P1: 0, P2: 1, P3: 2 };
  const AREA_COLOR_FALLBACK = '#94a3b8';
  let criticalItemsCache = null;
  let criticalActive = 0;
  let criticalCycleTimer = null;

  function priorityRankOf(item){
    const r = PRIORITY_RANK[item.priority];
    return r === undefined ? 2 : r; // unknown/blank priority ranks alongside the lowest tier
  }

  // Blends "how close/overdue" with priority into one ranking score, rather than sorting purely by
  // date and only using priority as a tie-breaker — a P1 item due in 3 days should generally surface
  // above a P3 item due in 1 day. Each priority tier below the top counts as 2 extra apparent days
  // of lateness; this is a simple, tunable weighting, not a claimed-precise formula.
  function criticalScore(daysDiff, item){
    return daysDiff + priorityRankOf(item) * 2;
  }

  function rankCriticalItems(items){
    const today = todayStr();
    return items
      .filter(r => !['Completed','Cancelled'].includes(r.status))
      .map(r => {
        const rt = revisedTarget(r);
        if(!rt) return null;
        const daysDiff = Math.round((new Date(rt+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000);
        return { item: r, daysDiff, score: criticalScore(daysDiff, r) };
      })
      .filter(Boolean)
      .sort((a,b) => a.score - b.score)
      .slice(0, 10);
  }

  function urgencyTagHtml(daysDiff){
    return daysDiff < 0
      ? `<span class="placard-tag overdue">OVERDUE ${Math.abs(daysDiff)}D</span>`
      : `<span class="placard-tag soon">DUE ${daysDiff}D</span>`;
  }
  function urgencyColorOf(daysDiff){
    if(daysDiff < 0) return 'var(--red)';
    if(daysDiff <= 2) return 'var(--amber)';
    return 'color-mix(in srgb, var(--accent) 55%, var(--muted))';
  }

  function criticalPlacardsHtml(ranked, areaColorMap){
    return ranked.map(({item, daysDiff}) => {
      const areaColor = areaColorMap[item.area] || AREA_COLOR_FALLBACK;
      const synopsis = item.remarks ? item.remarks : `${item.area || 'Unassigned'} · ${item.status || 'Not Started'}`;
      return `<div class="placard"><div class="placard-inner">
        <div class="placard-face placard-front"><span class="placard-urgency-bar" style="background:${urgencyColorOf(daysDiff)}"></span>
          <div class="placard-front-body"><div class="placard-title-row"><span class="placard-title">${escapeHtml(item.devList)}</span>${urgencyTagHtml(daysDiff)}</div>
          <span class="placard-synopsis">${escapeHtml(synopsis)}</span></div></div>
        <div class="placard-face placard-back">
          <div class="pb-row"><span class="pb-area" style="background:${areaColor}">${escapeHtml(item.area || '—')}</span><b>${escapeHtml(item.status || 'Not Started')}</b></div>
          <div class="pb-row">Func <b>${escapeHtml(item.spocFunction || '—')}</b> &middot; Dev <b>${escapeHtml(item.developer || '—')}</b></div>
          <div class="pb-row">${item.remarks ? ('Note: <b>'+escapeHtml(item.remarks)+'</b>') : '<i>No remarks</i>'}</div>
        </div>
      </div></div>`;
    }).join('');
  }

  function stopCriticalCycle(){
    if(criticalCycleTimer){ cancelAnimationFrame(criticalCycleTimer); criticalCycleTimer = null; }
  }

  function setActivePlacard(listEl, i){
    const cards = listEl.querySelectorAll('.placard');
    cards.forEach((c, ci) => c.classList.toggle('flipped', ci === i));
  }

  function startCriticalCycle(listEl, count){
    stopCriticalCycle();
    if(count <= 1) return;
    let remaining = 4000;
    const clockEl = document.getElementById('critCycleClock');
    let lastTs = null;
    function tick(ts){
      if(lastTs == null) lastTs = ts;
      remaining -= (ts - lastTs); lastTs = ts;
      if(clockEl) clockEl.textContent = Math.max(0, Math.ceil(remaining/1000)) + 's';
      if(remaining <= 0){
        criticalActive = (criticalActive + 1) % count;
        setActivePlacard(listEl, criticalActive);
        remaining = 4000;
      }
      criticalCycleTimer = requestAnimationFrame(tick);
    }
    criticalCycleTimer = requestAnimationFrame(tick);
  }

  function openCriticalDrawer(){
    document.getElementById('critBackdrop').classList.add('open');
    document.getElementById('critDrawer').classList.add('open');
  }
  function closeCriticalDrawer(){
    document.getElementById('critBackdrop').classList.remove('open');
    document.getElementById('critDrawer').classList.remove('open');
  }

  async function loadCriticalPanel(){
    try{
      const [itemsRes, mdRes] = await Promise.all([
        fetch(API_BASE + '/items'),
        fetch(API_BASE + '/master-data')
      ]);
      if(!itemsRes.ok || !mdRes.ok) return;
      const items = await itemsRes.json();
      const areas = (await mdRes.json()).filter(r => r.active && r.category === 'area');
      const areaColorMap = {};
      areas.forEach(a => { areaColorMap[a.value] = a.color || AREA_COLOR_FALLBACK; });

      const ranked = rankCriticalItems(items);
      if(ranked.length === 0) return; // nothing time-sensitive — panel/tab stay hidden

      const html = criticalPlacardsHtml(ranked, areaColorMap);
      const sidePanel = document.getElementById('criticalSidePanel');
      const placardList = document.getElementById('critPlacardList');
      const drawerList = document.getElementById('critDrawerList');
      const tab = document.getElementById('critTab');
      const tabBadge = document.getElementById('critTabBadge');

      placardList.innerHTML = html;
      drawerList.innerHTML = html;

      sidePanel.style.display = '';
      tab.style.display = '';
      tabBadge.textContent = String(ranked.filter(r => r.daysDiff < 0).length);

      criticalActive = 0;
      setActivePlacard(placardList, 0);
      startCriticalCycle(placardList, ranked.length);
      placardList.querySelectorAll('.placard').forEach((card, i) => {
        card.addEventListener('click', () => { criticalActive = i; setActivePlacard(placardList, i); });
      });
      // Drawer cards flip independently on tap — opening the drawer is already a deliberate
      // action, so there's no need to also force an auto-cycle on it.
      drawerList.querySelectorAll('.placard').forEach(card => {
        card.addEventListener('click', () => card.classList.toggle('flipped'));
      });

      tab.addEventListener('click', openCriticalDrawer);
      document.getElementById('critBackdrop').addEventListener('click', closeCriticalDrawer);
      document.getElementById('critDrawerClose').addEventListener('click', closeCriticalDrawer);
    }catch(e){
      // Non-essential — the rest of the home page works fine without it.
    }
  }

  document.getElementById('homeCommandSend').addEventListener('click', handleHomeCommand);
  document.getElementById('homeCommandInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') handleHomeCommand(); });

  updateClock();
  setInterval(updateClock, 1000 * 30); // refresh every 30s — a clock this coarse doesn't need per-second updates
  resolveCurrentUserName();
  loadQuickStats();
  loadActivity();
  loadModulePulse();
  loadCriticalPanel();
  updateTileBannerState(); // regular-user default (3 tiles) — revealAdminTileIfAuthorized() re-runs this if the admin tile appears
  revealAdminTileIfAuthorized();
  renderAccountBar();

  // Exposed so a single-page context (e.g. the standalone preview build, which
  // toggles between a home view and a dashboard view in one file instead of
  // two real page loads) can ask for a fresh stats read without duplicating
  // this logic. The real two-page app never calls this — it just reloads the
  // page.
  window.__refreshHomeStats = loadQuickStats;
})();
