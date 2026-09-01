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
      const completed = rows.filter(r=>r.status==='Completed').length;
      const active = rows.filter(r=>!['Completed','Cancelled'].includes(r.status)).length;
      const overdue = rows.filter(r=>{
        if(['Completed','Cancelled'].includes(r.status)) return false;
        const rt = revisedTarget(r);
        return rt && rt < todayStr();
      }).length;

      const stats = document.getElementById('quickStats');
      stats.innerHTML = `
        <div class="quick-stat"><div class="num">${total}</div><div class="label">Total items</div></div>
        <div class="quick-stat active"><div class="num">${active}</div><div class="label">Active</div></div>
        <div class="quick-stat overdue"><div class="num">${overdue}</div><div class="label">Overdue</div></div>
        <div class="quick-stat completed"><div class="num">${completed}</div><div class="label">Completed</div></div>
      `;

      document.getElementById('tileDashMeta').textContent =
        total === 0 ? "No items yet — the tracker is empty." :
        `${total} item${total===1?'':'s'} tracked, ${active} active`;

      document.getElementById('homeFooter').textContent =
        overdue > 0
          ? `Heads up — ${overdue} item${overdue===1?' is':'s are'} past ${overdue===1?'its':'their'} revised target date.`
          : `Everything's on track — no overdue items right now.`;

    }catch(e){
      document.getElementById('quickStats').innerHTML =
        `<div class="quick-stat-error">Couldn't load live stats — the dashboard will still show everything.</div>`;
      document.getElementById('tileDashMeta').textContent = '';
      document.getElementById('homeFooter').textContent = '';
    }
  }

  updateClock();
  setInterval(updateClock, 1000 * 30); // refresh every 30s — a clock this coarse doesn't need per-second updates
  resolveCurrentUserName();
  loadQuickStats();
  revealAdminTileIfAuthorized();
  renderAccountBar();

  // Exposed so a single-page context (e.g. the standalone preview build, which
  // toggles between a home view and a dashboard view in one file instead of
  // two real page loads) can ask for a fresh stats read without duplicating
  // this logic. The real two-page app never calls this — it just reloads the
  // page.
  window.__refreshHomeStats = loadQuickStats;
})();
