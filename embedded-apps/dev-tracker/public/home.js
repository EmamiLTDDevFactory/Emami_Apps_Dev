(function(){
  // Same production API base as app.js (see comment there) — no bundler here, so it's a
  // hardcoded constant rather than a build-time env var.
  const API_BASE = 'https://audit-capa-api.emamiapps.in/api/dev-tracker';

  // Placeholder until real auth exists — see .agents/rules/project.md.
  // Swap this for the logged-in user's name once authentication is added.
  const CURRENT_USER = "Abhishek";

  function greetingForHour(h){
    if(h < 5) return "Working late, " + CURRENT_USER + "?";
    if(h < 12) return "Good morning, " + CURRENT_USER;
    if(h < 17) return "Good afternoon, " + CURRENT_USER;
    if(h < 21) return "Good evening, " + CURRENT_USER;
    return "Working late, " + CURRENT_USER + "?";
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
  loadQuickStats();

  // Exposed so a single-page context (e.g. the standalone preview build, which
  // toggles between a home view and a dashboard view in one file instead of
  // two real page loads) can ask for a fresh stats read without duplicating
  // this logic. The real two-page app never calls this — it just reloads the
  // page.
  window.__refreshHomeStats = loadQuickStats;
})();
