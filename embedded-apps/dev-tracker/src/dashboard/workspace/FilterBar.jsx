import React, { useMemo, useState } from 'react';
import { Avatar, Popover, TypeIcon } from './ui.jsx';
import { UNASSIGNED, EMPTY_FILTERS, activeFilterCount } from './filters.js';
import { ISSUE_TYPES, issueKey, parseLabels, splitPeople } from '../../shared/pm.js';
import { SearchIcon } from '../../shared/icons.jsx';

const VISIBLE_AVATARS = 7;

function toggleIn(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function MultiSelect({ label, values, options, onChange, renderOption }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <span className="pm-rel">
      <button type="button" className={`pm-filter-btn${values.length ? ' is-on' : ''}`} onClick={() => setOpen((o) => !o)}>
        {label}{values.length > 0 && <span className="pm-filter-count">{values.length}</span>}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="pm-pop-wide">
        {options.length > 8 && (
          <input className="pm-pop-search" autoFocus placeholder={`Search ${label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        )}
        <div className="pm-pop-scroll">
          {shown.map((o) => (
            <label key={o.value} className="pm-pop-check">
              <input type="checkbox" checked={values.includes(o.value)} onChange={() => onChange(toggleIn(values, o.value))} />
              {renderOption ? renderOption(o) : <span>{o.label}</span>}
            </label>
          ))}
          {!shown.length && <div className="pm-pop-empty">No matches</div>}
        </div>
        {values.length > 0 && (
          <div className="pm-pop-foot"><button type="button" className="pm-link-btn" onClick={() => onChange([])}>Clear</button></div>
        )}
      </Popover>
    </span>
  );
}

const PRESET_CHIPS = [
  ['status', (v) => `Status: ${v}`],
  ['priority', (v) => `Priority: ${v}`],
  ['overdueOnly', () => 'Overdue'],
  ['lifecycle', (v) => (v === 'active' ? 'Active work' : 'Completed')],
  ['impact', (v) => `Impact: ${v}`],
  ['complexity', (v) => `Complexity: ${v}`],
  ['devFactory', (v) => `Dev Factory: ${v}`],
  ['reasonCategory', (v) => `Delay: ${v}`],
  ['dateStart', (v) => `Target ≥ ${v}`],
  ['dateEnd', (v) => `Target ≤ ${v}`],
];

export default function FilterBar({ filters, setFilters, items, epics, options, searchRef, showEpics = true, extra }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const assigneeCounts = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      for (const d of splitPeople(it.developer)) m.set(d, (m.get(d) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [items]);
  const top = assigneeCounts.slice(0, VISIBLE_AVATARS);
  const rest = assigneeCounts.slice(VISIBLE_AVATARS);
  const restSelected = filters.assignees.filter((a) => rest.includes(a) || a === UNASSIGNED).length;
  // Typing searches every assignee, not just the ones past the avatar row, so anyone can be
  // picked by name without scanning the faces first.
  const aq = assigneeQuery.trim().toLowerCase();
  const popAssignees = aq
    ? assigneeCounts.filter((n) => n.toLowerCase().includes(aq)).sort((a, b) => a.localeCompare(b))
    : rest;
  const showUnassigned = !aq || 'unassigned'.includes(aq);
  const labelOptions = useMemo(() => {
    const s = new Set();
    for (const it of items) for (const l of parseLabels(it.labels)) s.add(l);
    return [...s].sort().map((l) => ({ value: l, label: l }));
  }, [items]);

  const count = activeFilterCount(filters) + (filters.search ? 1 : 0);

  return (
    <div className="pm-filterbar">
      <div className="pm-search">
        <SearchIcon size={15} />
        <input ref={searchRef} value={filters.search} onChange={(e) => set({ search: e.target.value })} placeholder="Search issues" aria-label="Search issues" />
      </div>

      {top.length > 0 && (
        <div className="pm-avatar-group" role="group" aria-label="Filter by assignee">
          {top.map((name) => (
            <button
              type="button"
              key={name}
              className={`pm-avatar-toggle${filters.assignees.includes(name) ? ' is-on' : ''}`}
              onClick={() => set({ assignees: toggleIn(filters.assignees, name) })}
              title={name}
              aria-pressed={filters.assignees.includes(name)}
            >
              <Avatar name={name} size={30} />
            </button>
          ))}
          <span className="pm-rel">
            <button type="button" className={`pm-avatar-more${restSelected ? ' is-on' : ''}`} onClick={() => setMoreOpen((o) => !o)} title="More assignees">
              {rest.length ? `+${rest.length}` : '…'}
            </button>
            <Popover open={moreOpen} onClose={() => { setMoreOpen(false); setAssigneeQuery(''); }} className="pm-pop-wide">
              <input className="pm-pop-search" autoFocus placeholder="Search people" aria-label="Search people" value={assigneeQuery} onChange={(e) => setAssigneeQuery(e.target.value)} />
              <div className="pm-pop-scroll">
                {showUnassigned && (
                  <label className="pm-pop-check">
                    <input type="checkbox" checked={filters.assignees.includes(UNASSIGNED)} onChange={() => set({ assignees: toggleIn(filters.assignees, UNASSIGNED) })} />
                    <Avatar name="" size={20} /> <span>Unassigned</span>
                  </label>
                )}
                {popAssignees.map((name) => (
                  <label key={name} className="pm-pop-check">
                    <input type="checkbox" checked={filters.assignees.includes(name)} onChange={() => set({ assignees: toggleIn(filters.assignees, name) })} />
                    <Avatar name={name} size={20} /> <span>{name}</span>
                  </label>
                ))}
                {!showUnassigned && !popAssignees.length && <div className="pm-pop-empty">No matches</div>}
              </div>
            </Popover>
          </span>
        </div>
      )}

      {showEpics && epics.length > 0 && (
        <MultiSelect
          label="Epic"
          values={filters.epics}
          onChange={(v) => set({ epics: v })}
          options={[{ value: UNASSIGNED, label: 'Issues without epic' }, ...epics.map((e) => ({ value: String(e.id), label: `${e.devList}`, key: issueKey(e) }))]}
        />
      )}
      <MultiSelect
        label="Type"
        values={filters.types}
        onChange={(v) => set({ types: v })}
        options={ISSUE_TYPES.map((t) => ({ value: t.key, label: t.key }))}
        renderOption={(o) => <><TypeIcon type={o.value} /> <span>{o.label}</span></>}
      />
      <MultiSelect label="Module" values={filters.areas} onChange={(v) => set({ areas: v })} options={(options.area || []).map((a) => ({ value: a, label: a }))} />
      {labelOptions.length > 0 && <MultiSelect label="Label" values={filters.labels} onChange={(v) => set({ labels: v })} options={labelOptions} />}

      <button type="button" className={`pm-filter-btn${filters.onlyMine ? ' is-on' : ''}`} onClick={() => set({ onlyMine: !filters.onlyMine })} aria-pressed={filters.onlyMine}>Only my issues</button>
      <button type="button" className={`pm-filter-btn${filters.recent ? ' is-on' : ''}`} onClick={() => set({ recent: !filters.recent })} aria-pressed={filters.recent}>Recently updated</button>

      {PRESET_CHIPS.filter(([k]) => filters[k]).map(([k, fmt]) => (
        <span className="pm-chip" key={k}>
          {fmt(filters[k])}
          <button type="button" aria-label="Remove filter" onClick={() => set({ [k]: EMPTY_FILTERS[k] })}>×</button>
        </span>
      ))}

      {count > 0 && <button type="button" className="pm-link-btn" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>}
      {extra && <div className="pm-filterbar-extra">{extra}</div>}
    </div>
  );
}
