(function(){
  // Same production API base as app.js/home.js — no bundler here, so it's a hardcoded
  // constant rather than a build-time env var.
  const API_BASE = 'https://audit-capa-api.emamiapps.in/api/dev-tracker';
  const ACCESS_API_BASE = 'https://audit-capa-api.emamiapps.in/api';
  const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email';

  let currentUserEmail = null;

  // The write routes on the server (POST/PUT /master-data) re-check this same email against
  // emami_apps.authorized_user_apps themselves — this header is what lets them identify the
  // caller, not what authorizes them; init() below already bounced anyone who isn't an admin
  // before this ever gets called.
  async function adminFetch(url, opts){
    const merged = Object.assign({}, opts, {
      headers: Object.assign({}, opts && opts.headers, { 'X-User-Email': currentUserEmail || '' })
    });
    return fetch(url, merged);
  }

  const CATEGORIES = [
    {key:'status', label:'Status', hasColor:false},
    {key:'area', label:'Area', hasColor:true},
    {key:'priority', label:'Priority', hasColor:false},
    {key:'impact', label:'Business Impact', hasColor:false},
    {key:'complexity', label:'Technical Complexity', hasColor:false},
    {key:'devFactory', label:'Dev Factory', hasColor:false},
    {key:'reasonCategory', label:'Reason for Delay', hasColor:false}
  ];
  let activeCategory = 'area';
  let allMasterData = [];

  function hexToRgba(hex, alpha){
    const h = hex.replace('#','');
    const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function renderCategoryPicker(){
    document.getElementById('categoryPicker').innerHTML = CATEGORIES.map(c=>{
      const dot = c.hasColor ? `<span class="cp-swatch" style="background:#6366f1"></span>` : '';
      return `<span class="category-pill${c.key===activeCategory?' active':''}" data-cat="${c.key}">${dot}${c.label}</span>`;
    }).join('');
    document.querySelectorAll('.category-pill').forEach(el=>{
      el.addEventListener('click', ()=>{
        activeCategory = el.getAttribute('data-cat');
        renderCategoryPicker();
        renderMasterDataList();
        renderAddForm();
      });
    });
    document.getElementById('mdCaption').textContent =
      CATEGORIES.find(c=>c.key===activeCategory).label + ' values';
  }

  function renderMasterDataList(){
    const list = document.getElementById('mdList');
    const items = allMasterData.filter(m=>m.category===activeCategory)
      .sort((a,b)=> a.sortOrder - b.sortOrder);
    if(items.length === 0){
      list.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:10px 0;">No values yet — add one below.</div>`;
      return;
    }
    const catMeta = CATEGORIES.find(c=>c.key===activeCategory);
    list.innerHTML = items.map(m=>{
      const rowStyle = m.color
        ? `--row-accent:${m.color};--row-bg:${hexToRgba(m.color,0.05)};--row-bg-hover:${hexToRgba(m.color,0.1)};`
        : '';
      // The color dot is a real <input type="color"> underneath, triggered by clicking the
      // visible dot — a native color picker, not a prompt()/dialog, so it isn't affected by
      // Chrome's "block additional dialogs" setting or iframe sandboxing the way prompt() was.
      const dot = catMeta.hasColor
        ? `<span class="swatch-dot" style="background:${m.color||'#94a3b8'}" title="Click to change color">
             <input type="color" class="swatch-input" data-id="${m.id}" value="${m.color||'#3e7cb1'}" />
           </span>` : '';
      return `<div class="md-row${m.active?'':' inactive'}" style="${rowStyle}" data-row-id="${m.id}">
        <span class="md-value">${dot}<span class="md-value-text" data-id="${m.id}">${m.value}</span></span>
        <div class="md-row-actions">
          <button type="button" class="link-btn" data-id="${m.id}" data-action="rename">Rename</button>
          <label class="switch" title="${m.active?'Active':'Inactive'}">
            <input type="checkbox" data-id="${m.id}" data-action="toggle" ${m.active?'checked':''}>
            <span class="switch-track"></span>
          </label>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-action="rename"]').forEach(btn=>{
      btn.addEventListener('click', ()=>startInlineRename(findItem(btn)));
    });
    list.querySelectorAll('.swatch-input').forEach(el=>{
      el.addEventListener('input', ()=>handleRecolor(findItem(el), el.value));
    });
    list.querySelectorAll('[data-action="toggle"]').forEach(el=>{
      el.addEventListener('change', ()=>handleToggle(findItem(el)));
    });
  }

  function findItem(el){
    return allMasterData.find(m=>m.id===el.getAttribute('data-id'));
  }

  // Rename swaps the plain text into an inline <input>, right in the row — no browser dialog
  // involved at all, so nothing about it can be silently blocked the way prompt() could be
  // (this app may be embedded inside the Emami Apps hub's iframe/webview).
  function startInlineRename(item){
    const row = document.querySelector(`.md-row[data-row-id="${item.id}"]`);
    const textSpan = row.querySelector('.md-value-text');
    const current = textSpan.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.className = 'inline-rename-input';
    input.style.cssText = 'font-size:13.5px;font-weight:500;border:1px solid var(--accent);border-radius:6px;padding:3px 7px;width:160px;';
    textSpan.replaceWith(input);
    input.focus();
    input.select();

    const commit = async ()=>{
      const next = input.value.trim();
      if(next && next !== current){
        await saveMasterData(item.id, { value: next });
        await loadMasterData();
      } else {
        renderMasterDataList(); // just revert to the plain span, unchanged
      }
    };
    input.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter') commit();
      if(e.key === 'Escape') renderMasterDataList();
    });
    input.addEventListener('blur', commit);
  }

  async function handleToggle(item){
    const errBox = document.getElementById('mdError');
    errBox.style.display = 'none';
    try{
      await saveMasterData(item.id, { active: !item.active });
      await loadMasterData();
    }catch(e){
      errBox.textContent = e.message;
      errBox.style.display = 'block';
    }
  }

  async function handleRecolor(item, nextColor){
    const errBox = document.getElementById('mdError');
    errBox.style.display = 'none';
    try{
      await saveMasterData(item.id, { color: nextColor, softColor: hexToSoft(nextColor) });
      await loadMasterData();
    }catch(e){
      errBox.textContent = e.message;
      errBox.style.display = 'block';
    }
  }

  function hexToSoft(hex){
    try{
      const h = hex.replace('#','');
      const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
      const mix = (c)=> Math.round(c + (255-c)*0.88);
      return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
    }catch(e){ return '#f0f2f5'; }
  }

  async function saveMasterData(id, patch){
    const res = await adminFetch(API_BASE + '/master-data/' + id, {
      method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(patch)
    });
    if(!res.ok) throw new Error((await res.json()).error || 'Failed to save');
  }

  function renderAddForm(){
    const catMeta = CATEGORIES.find(c=>c.key===activeCategory);
    const form = document.getElementById('addForm');
    form.innerHTML = `
      <input type="text" id="newValue" placeholder="Add a new ${catMeta.label.toLowerCase()} value" />
      ${catMeta.hasColor ? `<input type="color" id="newColor" value="#3e7cb1" title="Accent color" />` : ''}
      <button type="button" id="addValueBtn">Add</button>
    `;
    document.getElementById('addValueBtn').addEventListener('click', async ()=>{
      const value = document.getElementById('newValue').value.trim();
      const errBox = document.getElementById('mdError');
      errBox.style.display = 'none';
      if(!value){ errBox.textContent = 'Enter a value first.'; errBox.style.display = 'block'; return; }
      const color = catMeta.hasColor ? document.getElementById('newColor').value : null;
      try{
        const res = await adminFetch(API_BASE + '/master-data', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ category: activeCategory, value, color, softColor: color ? hexToSoft(color) : null })
        });
        if(!res.ok) throw new Error((await res.json()).error || 'Failed to add');
        await loadMasterData();
        renderAddForm();
      }catch(e){
        errBox.textContent = e.message;
        errBox.style.display = 'block';
      }
    });
  }

  async function loadMasterData(){
    const res = await fetch(API_BASE + '/master-data');
    allMasterData = await res.json();
    renderCategoryPicker();
    renderMasterDataList();
  }

  // Mirrors home.js's revealAdminTileIfAuthorized() check — that only hides the tile on the
  // home page, so this page also needs its own gate for anyone who lands here directly (a
  // bookmark, a shared link, or just typing the URL). This is a UX nicety, not the real access
  // control: the server independently re-checks the same thing on every write (see
  // backend/devTracker.js's requireDevTrackerAdmin), so even someone who bypassed this redirect
  // couldn't actually save anything.
  async function checkAdminAccess(){
    try{ currentUserEmail = localStorage.getItem(HUB_EMAIL_STORAGE_KEY); }catch(e){ /* storage unavailable */ }
    if(!currentUserEmail) return false;
    try{
      const res = await fetch(`${ACCESS_API_BASE}/access/me?email=${encodeURIComponent(currentUserEmail)}`);
      const data = await res.json();
      const apps = (data && data.success && Array.isArray(data.apps)) ? data.apps : [];
      return apps.some(a => a.appId === 'dev-tracker' && a.role === 'Admin');
    }catch(e){
      return false;
    }
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // Signed-in-user chip, same as home.js/app.js's own copies — no Sign out button here, that
  // lives only on the home page. currentUserEmail is already resolved by checkAdminAccess() by
  // the time this runs, so no second localStorage read.
  async function renderAccountBar(){
    const strip = document.getElementById('accountStrip');
    const bar = document.getElementById('accountBar');
    if(!strip || !bar || !currentUserEmail) return;
    let displayName = currentUserEmail;
    try{
      const res = await fetch(`${ACCESS_API_BASE}/me?email=${encodeURIComponent(currentUserEmail)}`);
      const data = await res.json();
      if(data && data.success && data.profile && data.profile.name) displayName = data.profile.name;
    }catch(e){
      // Keep the email fallback already set above.
    }
    bar.innerHTML = `<span class="account-user" title="${escapeHtml(currentUserEmail)}">${escapeHtml(displayName)}</span>`;
    strip.style.display = 'flex';
  }

  async function init(){
    const isAdmin = await checkAdminAccess();
    if(!isAdmin){ window.location.href = '/apps/dev-tracker'; return; }
    renderAccountBar();
    renderCategoryPicker();
    renderAddForm();
    await loadMasterData();
  }
  init();
})();
