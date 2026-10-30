import React, { useState } from 'react';
import { CHANGE_TYPES, CHANGE_TYPE_META, LANDSCAPES } from './model.js';
import { AlertIcon, CheckIcon, SearchIcon, XIcon } from '../shared/icons.jsx';

// "IT landscape" step of the request form: SAP or Non-SAP, then every area the change touches. The areas are
// Dev Tracker's Area master data in that group (Master Data › Area), with their colors; anything else can be typed.
const META = {
  SAP: { tag: 'SAP landscape', text: 'ERP modules, Fiori, Enterprise Portal and SAP-integrated third-party applications.' },
  'Non-SAP': { tag: 'Beyond SAP', text: 'Emami Apps, RPA, mobile and other third-party applications.' },
};

export default function ItLandscape({ system, modules, changeTypes = [], areas, onChange, onChangeTypes }) {
  const [q, setQ] = useState('');
  const [custom, setCustom] = useState('');
  const isLandscape = LANDSCAPES.includes(system);
  const inGroup = (g) => (areas || []).filter((a) => a.areaGroup === g);
  const options = isLandscape ? inGroup(system) : [];
  const known = new Set(options.map((a) => a.value));
  const shown = options.filter((a) => !q.trim() || a.value.toLowerCase().includes(q.trim().toLowerCase()));
  const extras = modules.filter((m) => !known.has(m));

  // Switching group keeps only what still belongs: typed-in values carry over, the other group's areas don't.
  const pickSystem = (g) => {
    if (g === system) return;
    const other = new Set((areas || []).filter((a) => a.areaGroup && a.areaGroup !== g).map((a) => a.value));
    onChange(g, modules.filter((m) => !other.has(m)));
    setQ('');
  };
  const toggle = (m) => onChange(system, modules.includes(m) ? modules.filter((x) => x !== m) : [...modules, m]);
  const addCustom = () => {
    const v = custom.trim().slice(0, 30);
    if (v && !modules.includes(v)) onChange(system, [...modules, v]);
    setCustom('');
  };

  return (
    <div className="ccb-land">
      <div className="ccb-field-label">Landscape<em>*</em></div>
      <div className="ccb-land-cards" role="radiogroup" aria-label="Landscape">
        {LANDSCAPES.map((g) => (
          <button key={g} type="button" role="radio" aria-checked={system === g} className={`ccb-land-card${system === g ? ' on' : ''}`} onClick={() => pickSystem(g)}>
            <span className="ccb-land-radio">{system === g && <CheckIcon size={12} />}</span>
            <span className="ccb-land-body">
              <span className="ccb-land-tag">{META[g].tag}</span>
              <strong>{g}</strong>
              <span className="ccb-land-text">{META[g].text}</span>
            </span>
            <span className="ccb-land-count">{areas ? inGroup(g).length : '…'}<small>areas</small></span>
          </button>
        ))}
      </div>
      {system && !isLandscape && (
        <div className="ccb-land-legacy"><AlertIcon size={13} /> Logged under the earlier IT area <strong>{system}</strong>. Pick SAP or Non-SAP to reclassify it.</div>
      )}

      {system === 'SAP' && (
        <div className="ccb-land-types">
          <div className="ccb-field-label">SAP change type<em>*</em> <span className="ccb-land-sub">— pick one or both</span></div>
          <div className="ccb-land-type-grid">
            {CHANGE_TYPES.map((t) => {
              const on = changeTypes.includes(t);
              return (
                <button
                  key={t} type="button" aria-pressed={on} className={`ccb-land-type tone-${CHANGE_TYPE_META[t].tone}${on ? ' on' : ''}`}
                  onClick={() => onChangeTypes(on ? changeTypes.filter((x) => x !== t) : CHANGE_TYPES.filter((x) => x === t || changeTypes.includes(x)))}
                >
                  <span className="ccb-land-check">{on && <CheckIcon size={11} />}</span>
                  <span className="ccb-land-body"><strong>{t}</strong><span className="ccb-land-text">{CHANGE_TYPE_META[t].text}</span></span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isLandscape && (
        <div className="ccb-land-areas">
          <div className="ccb-land-areas-head">
            <div>
              <div className="ccb-field-label">{system} areas affected</div>
              <div className="ccb-land-sub">{modules.length ? `${modules.length} selected` : 'Pick every area the change touches.'}</div>
            </div>
            {options.length > 8 && (
              <label className="ccb-land-search">
                <SearchIcon size={13} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${system} areas…`} />
                {q && <button type="button" aria-label="Clear filter" onClick={() => setQ('')}><XIcon size={11} /></button>}
              </label>
            )}
          </div>
          {areas === null && <div className="ccb-land-sub">Loading areas…</div>}
          {areas && !options.length && <div className="ccb-land-sub">No {system} areas in Master Data yet — type one below.</div>}
          <div className="ccb-land-grid">
            {shown.map((a) => {
              const on = modules.includes(a.value);
              return (
                <button
                  key={a.id} type="button" aria-pressed={on} className={`ccb-land-area${on ? ' on' : ''}`} onClick={() => toggle(a.value)}
                  style={{ '--area': a.color || 'var(--accent)', '--area-soft': a.softColor || 'var(--accent-soft)' }}
                >
                  <span className="ccb-land-dot" />
                  <span className="ccb-land-name">{a.value}</span>
                  {on && <CheckIcon size={12} />}
                </button>
              );
            })}
            {q && !shown.length && <div className="ccb-land-sub">No {system} area matches “{q}”.</div>}
          </div>
          <div className="ccb-land-custom">
            {extras.map((m) => (
              <span key={m} className="ccb-land-extra">{m}<button type="button" aria-label={`Remove ${m}`} onClick={() => toggle(m)}><XIcon size={10} /></button></span>
            ))}
            <input
              className="ccb-input" value={custom} maxLength={30} placeholder="+ Not listed? Type it and press Enter"
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              onBlur={addCustom}
            />
          </div>
        </div>
      )}
    </div>
  );
}
