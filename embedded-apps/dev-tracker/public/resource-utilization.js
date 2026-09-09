(function(){
  // Same production API base as home.js/app.js — no bundler here, so it's a hardcoded constant.
  const API_BASE = 'https://audit-capa-api.emamiapps.in/api/dev-tracker';
  const ACCESS_API_BASE = 'https://audit-capa-api.emamiapps.in/api';
  const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email';
  const HUB_AUTH_API_BASE = 'https://in65bjvxjd.execute-api.ap-south-1.amazonaws.com/api';

  const AREA_COLOR_FALLBACK = '#94a3b8';

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // ---------- Shared account strip (same pattern as home.js's renderAccountBar) ----------
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
    }catch(e){ /* keep email fallback */ }

    bar.innerHTML = `
      <span class="account-user" title="${escapeHtml(email)}">${escapeHtml(displayName)}</span>
      <button type="button" id="logoutBtn" class="account-link">Sign out</button>
    `;
    strip.style.display = 'flex';
    document.getElementById('logoutBtn').addEventListener('click', clearHubSessionAndRedirect);
  }

  // ---------- Date helpers (mirrors home.js's own addDays/revisedTarget) ----------
  function addDays(dateStr, days){
    if(!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + (Number(days)||0));
    return d.toISOString().slice(0,10);
  }
  function revisedTargetStr(row){
    const rework = Number(row.rework)||0;
    if(!row.targetDate) return "";
    return rework > 0 ? addDays(row.targetDate, rework) : row.targetDate;
  }
  function toISO(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function fmtLong(d){ return d.toLocaleDateString('en-GB',{ day:'2-digit', month:'short', year:'numeric' }); }
  function fmtShort(d){ return d.toLocaleDateString('en-GB',{ day:'2-digit', month:'short' }); }
  function dateOnly(dateStr){
    if(!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  // ---------- Load-spectrum bands (same shape as the approved mockup) ----------
  var MAX = 5; // scale for both the spectrum and each gauge; 5 = the "5+" ceiling
  var ZONES = [
    { from:0, to:1, cls:'idle',      color:'var(--ru-idle)',      label:'Idle' },
    { from:1, to:2, cls:'light',     color:'var(--ru-light)',     label:'Light' },
    { from:2, to:4, cls:'balanced',  color:'var(--ru-balanced)',  label:'Balanced' },
    { from:4, to:5, cls:'stretched', color:'var(--ru-stretched)', label:'Stretched' },
  ];
  function bandFor(n){
    if (n >= 4) return ZONES[3];
    if (n >= 2) return ZONES[2];
    if (n === 1) return ZONES[1];
    return ZONES[0];
  }
  function initials(name){
    return String(name).replace(/[^A-Za-z ]/g,' ').split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase() || '?';
  }

  // Straight-line burn assumption: an item's planned devTime is spread evenly across its own
  // start–revised-target span, so "remaining" = plannedDays * (days left in the window / total
  // window length). This is the same methodology as the approved mockup — the only estimate
  // possible without an actual daily time log in the schema (only a planned devTime figure and
  // phase dates exist).
  function remainingDays(it, D){
    var totalSpan = Math.round((it.end - it.start) / 86400000) + 1;
    if(totalSpan <= 0) return 0;
    var daysLeft = Math.round((it.end - D) / 86400000) + 1;
    var frac = Math.max(0, Math.min(1, daysLeft / totalSpan));
    return it.devDays * frac;
  }

  function mostCommon(values){
    var counts = {};
    var best = null, bestCount = 0;
    values.forEach(function(v){
      if(!v) return;
      counts[v] = (counts[v]||0) + 1;
      if(counts[v] > bestCount){ best = v; bestCount = counts[v]; }
    });
    return best;
  }

  // ---------- Build the resource roster from real items ----------
  // A resource is any distinct "developer" name (role: Developer) or "spocFunction" name (role:
  // Functional SPOC) found across the tracker's items — matching the two roles the approved
  // mockup scoped this report to. An item contributes a concurrency window only when it has both
  // a startDate and a resolvable revised target date; items missing either are still counted
  // toward nothing rather than guessed at.
  function buildRoster(items){
    var byKey = {}; // key = role + '|' + name
    function ensure(name, role){
      var key = role + '|' + name;
      if(!byKey[key]) byKey[key] = { name: name, role: role, items: [], tagSource: [] };
      return byKey[key];
    }

    items.forEach(function(row){
      if(row.status === 'Cancelled') return;
      var start = dateOnly(row.startDate);
      var endStr = revisedTargetStr(row);
      var end = dateOnly(endStr);
      var devDays = Number(row.devTime) || 0;
      var windowOk = start && end && end >= start;

      if(row.developer){
        var dev = ensure(row.developer, 'Developer');
        dev.tagSource.push(row.devFactory);
        if(windowOk){
          dev.items.push({ start:start, end:end, devDays:devDays, area:row.area, title:row.devList, targetLabel:end });
        }
      }
      if(row.spocFunction){
        var spoc = ensure(row.spocFunction, 'Functional SPOC');
        spoc.tagSource.push(row.area);
        if(windowOk){
          spoc.items.push({ start:start, end:end, devDays:devDays, area:row.area, title:row.devList, targetLabel:end });
        }
      }
    });

    return Object.keys(byKey).map(function(key){
      var r = byKey[key];
      r.tag = mostCommon(r.tagSource) || '—';
      r.initials = initials(r.name);
      delete r.tagSource;
      return r;
    });
  }

  var ROLE_ORDER = ['Developer','Functional SPOC'];

  function gaugeSVG(value, color){
    var size = 84, r = 33, cx = size/2, cy = size/2, C = 2*Math.PI*r;
    var pct = Math.min(value,MAX)/MAX;
    var dash = pct*C;
    var ticksSvg = '';
    for (var i=0;i<=MAX;i++){
      var a = (i/MAX)*2*Math.PI - Math.PI/2;
      var x1 = cx + (r+5.5)*Math.cos(a), y1 = cy + (r+5.5)*Math.sin(a);
      var x2 = cx + (r+2)*Math.cos(a), y2 = cy + (r+2)*Math.sin(a);
      ticksSvg += '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="var(--ru-muted)" stroke-width="1.2" opacity="0.55"/>';
    }
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">' +
      '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="var(--ru-track)" stroke-width="7"/>' +
      '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="7" stroke-linecap="round" ' +
        'stroke-dasharray="'+dash+' '+(C-dash)+'" transform="rotate(-90 '+cx+' '+cy+')"/>' +
      ticksSvg +
      '</svg>';
  }

  async function loadResourceUtilization(){
    var groupsEl = document.getElementById('groups');
    var emptyEl = document.getElementById('emptyState');
    var markersEl = document.getElementById('spectrumMarkers');
    var detailSubEl = document.getElementById('detailSub');
    var asOfLabelEl = document.getElementById('asOfLabel');
    var dateInput = document.getElementById('asOfDate');

    document.getElementById('reportGeneratedAt').textContent =
      new Date().toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

    // Static spectrum track / ticks / legend chrome — same for every "as of" date.
    document.getElementById('spectrumTrack').innerHTML = ZONES.map(function(z){
      var w = (z.to-z.from)/MAX*100;
      return '<div class="spectrum-zone" style="width:'+w+'%;background:linear-gradient(180deg, color-mix(in srgb, '+z.color+' 88%, white 6%), '+z.color+')">' +
        (w >= 16 ? '<span class="spectrum-zone-label">'+z.label+'</span>' : '') +
      '</div>';
    }).join('');
    var tickHtml = '';
    for (var i=0;i<=MAX;i++){ tickHtml += '<span class="spectrum-tick" style="left:'+(i/MAX*100)+'%">'+(i===MAX?MAX+'+':i)+'</span>'; }
    document.getElementById('spectrumTicks').innerHTML = tickHtml;
    document.getElementById('spectrumLegend').innerHTML = ZONES.map(function(z){
      var range = (z.to-z.from>1 ? z.from+'–'+(z.to-1) : (z.from===4?'4+':z.from));
      return '<span class="key" style="background:color-mix(in srgb, '+z.color+' 14%, var(--ru-surface));color:'+z.color+'">' +
        '<span class="sw"></span>'+z.label+' <span class="n">&middot; '+range+'</span></span>';
    }).join('');

    var resources = [];
    var areaColorMap = {};

    try{
      var [itemsRes, mdRes] = await Promise.all([
        fetch(API_BASE + '/items'),
        fetch(API_BASE + '/master-data')
      ]);
      if(!itemsRes.ok || !mdRes.ok) throw new Error('failed to load');
      var items = await itemsRes.json();
      var areas = (await mdRes.json()).filter(function(r){ return r.active && r.category === 'area'; });
      areas.forEach(function(a){ areaColorMap[a.value] = a.color || AREA_COLOR_FALLBACK; });
      resources = buildRoster(items);
    }catch(e){
      groupsEl.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyEl.textContent = "Couldn't load live data — try refreshing the page.";
      return;
    }

    if(resources.length === 0){
      emptyEl.style.display = 'block';
      detailSubEl.textContent = '0 resources';
      return;
    }

    function render(D){
      resources.forEach(function(r){
        var concurrentItems = r.items.filter(function(it){ return it.start <= D && it.end >= D; });
        r.concurrentItems = concurrentItems;
        r.concurrent = concurrentItems.length;
        r.devDaysPlanned = concurrentItems.reduce(function(s,it){ return s+it.devDays; }, 0);
        r.devDaysRemaining = concurrentItems.reduce(function(s,it){ return s+remainingDays(it,D); }, 0);
        r.band = bandFor(r.concurrent);
      });

      asOfLabelEl.textContent = fmtLong(D);

      // Spectrum markers — group by concurrent value so ties fan out instead of overlapping.
      var byValue = {};
      resources.forEach(function(r){ (byValue[r.concurrent] = byValue[r.concurrent] || []).push(r); });
      var markersHtml = '';
      Object.keys(byValue).forEach(function(v){
        var group = byValue[v];
        var baseLeft = (Math.min(Number(v),MAX)/MAX)*100;
        group.forEach(function(r, i){
          var spread = (i - (group.length-1)/2) * 30;
          markersHtml +=
            '<div class="spectrum-marker" style="left:calc('+baseLeft+'% + '+spread+'px);color:'+r.band.color+'">' +
              '<span class="spectrum-avatar" style="background:'+r.band.color+'" title="'+escapeHtml(r.name)+' — '+r.concurrent+' concurrent">'+r.initials+'</span>' +
              '<span class="spectrum-marker-stem"></span>' +
            '</div>';
        });
      });
      markersEl.innerHTML = markersHtml;

      var stretchedCount = resources.filter(function(r){ return r.concurrent >= 4; }).length;
      detailSubEl.textContent = resources.length+' resources · '+stretchedCount+' stretched';

      var html = '';
      ROLE_ORDER.forEach(function(role){
        var group = resources.filter(function(r){ return r.role === role; }).sort(function(a,b){ return b.concurrent - a.concurrent; });
        if (!group.length) return;
        html += '<div class="group-title"><h3>'+escapeHtml(role)+'s</h3><span class="count">'+group.length+'</span></div>';
        html += '<div class="gauge-grid">';
        group.forEach(function(r){
          var backBody = r.concurrentItems.length
            ? r.concurrentItems.map(function(it){
                var rem = Math.round(remainingDays(it, D)*10)/10;
                var plan = Math.round(it.devDays*10)/10;
                var areaColor = areaColorMap[it.area] || AREA_COLOR_FALLBACK;
                return '<div class="back-item">' +
                  '<span class="area-chip" style="background:'+areaColor+'">'+escapeHtml(it.area||'—')+'</span>' +
                  '<span class="back-item-title">'+escapeHtml(it.title||'(untitled)')+'</span>' +
                  '<span class="back-item-meta">Target '+fmtShort(it.targetLabel)+' &middot; <b>'+rem+'d/'+plan+'d</b> rem/planned</span>' +
                '</div>';
              }).join('')
            : '<div class="back-empty">No active items as of this date</div>';

          html +=
            '<div class="gcard-flip">' +
              '<div class="gcard-inner">' +
                '<div class="gcard-face gcard-front '+r.band.cls+'" style="--band-color:'+r.band.color+'">' +
                  '<span class="flip-hint" title="Click for current items">&#8635;</span>' +
                  '<div class="id-block">' +
                    '<div style="position:relative;width:82px;height:82px;">' +
                      gaugeSVG(r.concurrent, r.band.color) +
                      '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
                        '<span class="gauge-num">'+r.concurrent+'</span><span class="gauge-cap">of '+MAX+'+</span>' +
                      '</div>' +
                    '</div>' +
                    '<div class="name">'+escapeHtml(r.name)+'</div>' +
                    '<div class="tag">'+escapeHtml(r.tag)+'</div>' +
                  '</div>' +
                  '<div class="metrics-block">' +
                    '<div class="status-row '+r.band.cls+'"><span class="d"></span>'+r.band.label+'</div>' +
                    '<div class="devdays-lines">' +
                      '<span class="dd-chip"><span class="dd-num">'+(Math.round(r.devDaysPlanned*10)/10)+'</span><span class="dd-cap">Planned</span></span>' +
                      '<span class="dd-chip"><span class="dd-num">'+(Math.round(r.devDaysRemaining*10)/10)+'</span><span class="dd-cap">Remaining</span></span>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="gcard-face gcard-back">' +
                  '<div class="back-head">'+escapeHtml(r.name)+'<span class="back-close" title="Back to summary">&#10005;</span></div>' +
                  '<div class="back-list">'+backBody+'</div>' +
                '</div>' +
              '</div>' +
            '</div>';
        });
        html += '</div>';
      });
      groupsEl.innerHTML = html;
      emptyEl.style.display = 'none';

      // Click flips a card; once flipped, moving the mouse off it starts a 3s countdown back to
      // the front (cancelled if the mouse returns in time) — same interaction as the mockup.
      groupsEl.querySelectorAll('.gcard-flip').forEach(function(card){
        var autoFlipTimer = null;
        card.addEventListener('click', function(){
          clearTimeout(autoFlipTimer);
          card.classList.toggle('flipped');
        });
        card.addEventListener('mouseleave', function(){
          if (!card.classList.contains('flipped')) return;
          clearTimeout(autoFlipTimer);
          autoFlipTimer = setTimeout(function(){ card.classList.remove('flipped'); }, 3000);
        });
        card.addEventListener('mouseenter', function(){
          clearTimeout(autoFlipTimer);
        });
      });
    }

    var TODAY = new Date(); TODAY.setHours(0,0,0,0);
    dateInput.value = toISO(TODAY);
    dateInput.addEventListener('change', function(){
      if (!dateInput.value) return;
      var parts = dateInput.value.split('-').map(Number);
      render(new Date(parts[0], parts[1]-1, parts[2]));
    });
    document.getElementById('asOfToday').addEventListener('click', function(){
      dateInput.value = toISO(TODAY);
      render(TODAY);
    });

    render(TODAY);
  }

  loadResourceUtilization();
  renderAccountBar();
})();
