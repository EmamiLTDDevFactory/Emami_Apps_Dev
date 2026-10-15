import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import Topbar from '../shared/Topbar.jsx';
import { useDevTrackerSession } from '../shared/useDevTrackerSession.js';
import { apiMasterData, apiMasterDataCreate, apiMasterDataUpdate, getCurrentUserEmail } from '../shared/api.js';
import { groupMasterData } from '../shared/masterData.js';
import { hexToSoft } from '../shared/utils.js';
import { CATEGORIES } from '../shared/constants.js';
import { ROUTES } from '../shared/routes.js';

// Master Data has no items/activity of its own to drive the Topbar's bell with real
// notifications, so it's passed a permanently-empty list — genuinely nothing to show
// here, not a stubbed-out feature.
const NO_NOTIFICATIONS = [];
function noop() {}

export default function Admin() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [addingCategory, setAddingCategory] = useState(null);
  const [addValue, setAddValue] = useState('');
  const [addColor, setAddColor] = useState('#3e7cb1');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const email = getCurrentUserEmail();
  const { isAdmin, roleLabel, profileName } = useDevTrackerSession(email);

  useEffect(() => {
    if (!email) {
      window.location.href = ROUTES.home;
      return;
    }
  }, [email]);

  useEffect(() => {
    if (isAdmin === false) window.location.href = ROUTES.home;
    else if (isAdmin === true) loadMasterData();
  }, [isAdmin]);

  function loadMasterData() {
    apiMasterData(email).then((r) => setRows(r || []));
  }

  const grouped = useMemo(() => groupMasterData(rows), [rows]);

  async function toggleActive(row) {
    setError(null);
    try {
      await apiMasterDataUpdate(row.id, { active: !row.active }, email);
      loadMasterData();
    } catch (e) {
      setError(e.message);
    }
  }

  async function commitRename(row) {
    const next = renameValue.trim();
    setRenamingId(null);
    if (!next || next === row.value) return;
    setError(null);
    try {
      await apiMasterDataUpdate(row.id, { value: next }, email);
      loadMasterData();
    } catch (e) {
      setError(e.message);
    }
  }

  async function updateColor(row, color) {
    setError(null);
    try {
      await apiMasterDataUpdate(row.id, { color, softColor: hexToSoft(color) }, email);
      loadMasterData();
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitAdd(cat) {
    if (!addValue.trim()) {
      setError('Enter a value first.');
      return;
    }
    setError(null);
    try {
      const payload = { category: cat.key, value: addValue.trim() };
      if (cat.hasColor) {
        payload.color = addColor;
        payload.softColor = hexToSoft(addColor);
      }
      await apiMasterDataCreate(payload, email);
      setAddValue('');
      setAddColor('#3e7cb1');
      setAddingCategory(null);
      loadMasterData();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!email) return null;

  // Rendered inside the shell, not instead of it — losing the Sidebar/Topbar while
  // access is still resolving (or for a denied user, briefly, before the redirect lands)
  // would strand someone with no way to navigate away.
  if (isAdmin !== true) {
    return (
      <div className="app-shell">
        <Sidebar active="masterData" isAdmin={isAdmin} email={email} name={profileName} identityInTopbar />
        <main className="shell-main">
          <Topbar email={email} name={profileName} roleLabel={roleLabel} notifications={NO_NOTIFICATIONS} onMarkAllRead={noop} onClear={noop} />
          <div className="empty-state">Checking access…</div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar active="masterData" isAdmin={isAdmin} email={email} name={profileName} identityInTopbar />
      <main className="shell-main">
        <Topbar email={email} name={profileName} roleLabel={roleLabel} notifications={NO_NOTIFICATIONS} onMarkAllRead={noop} onClear={noop} />

        <div className="admin-header">
          <div>
            <div className="eyebrow">Change Control Board &amp; CR Tracker Log</div>
            <h1 className="h1">Manage Master Data</h1>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', maxWidth: 280, textAlign: 'right', lineHeight: 1.5 }}>
            Click any value to rename or recolor it. Toggling a value off keeps it on past items but removes it from new entries.
          </div>
        </div>

        <div className="card">
        {CATEGORIES.map((cat) => {
          const values = grouped[cat.key] || [];
          return (
            <div className="shelf" key={cat.key}>
              <div className="shelf-head">
                <span className="shelf-name">{cat.label}</span>
                <span className="shelf-count">{values.length} values{cat.hasColor ? ' · drives color coding everywhere' : ''}</span>
              </div>
              <div className="chips">
                {values.map((row) => (
                  <span className={`chip${row.active ? '' : ' inactive'}`} key={row.id} style={cat.hasColor ? { background: row.softColor || undefined, color: row.color || undefined } : undefined}>
                    {cat.hasColor && (
                      <span className="swatch-dot" style={{ background: row.color || 'var(--mod-fallback)' }}>
                        <input type="color" value={row.color || '#888888'} onChange={(e) => updateColor(row, e.target.value)} title="Recolor" />
                      </span>
                    )}
                    {renamingId === row.id ? (
                      <input
                        autoFocus
                        className="rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(row);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        onBlur={() => commitRename(row)}
                      />
                    ) : (
                      <span onClick={() => { setRenamingId(row.id); setRenameValue(row.value); }} style={{ cursor: 'pointer' }}>{row.value}</span>
                    )}
                    <button className="chip-toggle" title={row.active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(row)}>
                      {row.active ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      )}
                    </button>
                  </span>
                ))}

                {addingCategory === cat.key ? (
                  <span className="add-inline">
                    {cat.hasColor && <input type="color" value={addColor} onChange={(e) => setAddColor(e.target.value)} />}
                    <input
                      type="text"
                      autoFocus
                      placeholder={cat.key === 'holiday' ? 'YYYY-MM-DD Holiday name' : 'New value'}
                      value={addValue}
                      onChange={(e) => setAddValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitAdd(cat)}
                    />
                    <button onClick={() => submitAdd(cat)}>Add</button>
                  </span>
                ) : (
                  <button className="chip-add" onClick={() => { setAddingCategory(cat.key); setAddValue(''); setError(null); }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add {cat.key === 'area' ? 'area' : cat.key === 'reasonCategory' ? 'reason' : cat.key === 'status' ? 'status' : cat.key === 'holiday' ? 'holiday' : cat.key === 'requestingFunction' ? 'function' : ''}
                  </button>
                )}
              </div>
              {addingCategory === cat.key && error && <div className="md-error">{error}</div>}
            </div>
          );
        })}
        </div>
      </main>
    </div>
  );
}
