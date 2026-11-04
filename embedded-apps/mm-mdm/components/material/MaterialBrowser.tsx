'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMdm } from '@/lib/store';
import { FieldKey, MaterialRecord } from '@/lib/types';
import { ALL_VIEW_IDS, VIEW_BY_ID, displayValue } from '@/lib/fieldConfig';
import { MATERIAL_GROUPS, PH_LEVELS, PLANTS, hierarchyText, helpText, splitHierarchy } from '@/lib/valueHelps';
import { fmtDate, fmtMoney } from '@/lib/format';
import DataSummary from '../DataSummary';
import { StatCards } from '../ui';
import {
  IconBox, IconBuilding, IconCopy, IconDoc, IconEdit, IconFilter, IconLayers, IconPlus, IconTag, IconX,
} from '../icons';

type Sort = 'number' | 'newest' | 'description' | 'price';

/** Posted materials. Change (MX) and extension (ME) start here in phase 2. */
export default function MaterialBrowser() {
  const { db, user } = useMdm();
  const [q, setQ] = useState('');
  const [plant, setPlant] = useState('');
  const [group, setGroup] = useState('');
  const [sort, setSort] = useState<Sort>('number');
  const [viewing, setViewing] = useState<MaterialRecord | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = db.materials
      .filter((m) => !s || m.materialNumber.includes(s) || m.description.toLowerCase().includes(s) || m.transId.toLowerCase().includes(s))
      .filter((m) => !plant || m.plant === plant)
      .filter((m) => !group || m.materialGroup === group);
    const by: Record<Sort, (a: MaterialRecord, b: MaterialRecord) => number> = {
      number: (a, b) => a.materialNumber.localeCompare(b.materialNumber),
      newest: (a, b) => b.createdOn.localeCompare(a.createdOn),
      description: (a, b) => a.description.localeCompare(b.description),
      price: (a, b) => Number(b.standardPrice || 0) - Number(a.standardPrice || 0),
    };
    return [...list].sort(by[sort]);
  }, [db.materials, q, plant, group, sort]);

  const plantsUsed = new Set(db.materials.map((m) => m.plant)).size;
  const groupsUsed = new Set(db.materials.map((m) => m.materialGroup)).size;
  const lastCreated = [...db.materials].sort((a, b) => b.createdOn.localeCompare(a.createdOn))[0];
  const filtered = !!(q || plant || group);

  return (
    <>
      <StatCards
        items={[
          { label: 'Materials posted', value: db.materials.length, icon: <IconBox />, tone: 'blue' },
          { label: 'Plants in use', value: plantsUsed, icon: <IconBuilding />, tone: 'violet' },
          { label: 'Material groups', value: groupsUsed, icon: <IconTag />, tone: 'amber' },
        ]}
        aside={lastCreated && (
          <button className="stat-card stat-card-link tone-green" onClick={() => setViewing(lastCreated)}>
            <span className="stat-icon"><IconDoc /></span>
            <span className="stat-text">
              <span>Latest material</span>
              <strong className="stat-sm">{lastCreated.description}</strong>
            </span>
          </button>
        )}
      />

      <section className="card card-flush">
        <div className="search-head">
          <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search material number, description or request" aria-label="Search materials" />
          <div className="search-selects">
            <span className="filter-icon" aria-hidden><IconFilter size={15} /></span>
            <select value={plant} onChange={(e) => setPlant(e.target.value)} aria-label="Plant">
              <option value="">All plants</option>
              {PLANTS.map((p) => <option key={p.value} value={p.value}>{p.value} – {p.label}</option>)}
            </select>
            <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Material group">
              <option value="">All material groups</option>
              {MATERIAL_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.value} – {g.label}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
              <option value="number">Sort: material number</option>
              <option value="newest">Sort: newest first</option>
              <option value="description">Sort: description</option>
              <option value="price">Sort: price (high to low)</option>
            </select>
            {filtered && <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setPlant(''); setGroup(''); }}><IconX size={14} /> Clear</button>}
          </div>
        </div>
        <div className="list-meta">
          <span className="muted small">{rows.length} of {db.materials.length} materials</span>
          {user.level === null && <Link href="/master/material/new" className="btn btn-primary btn-sm"><IconPlus size={14} /> New material request</Link>}
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            <span className="empty-icon" aria-hidden><IconBox size={22} /></span>
            <p>No materials match these filters.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table-click req-table">
              <thead>
                <tr><th>Material</th><th>Group</th><th>Plant</th><th className="num">Price</th><th>Created</th><th>Request</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.materialNumber} onClick={() => setViewing(m)}>
                    <td>
                      <div className="req-cell">
                        <span className="req-cell-icon mat-icon" aria-hidden><IconBox size={16} /></span>
                        <span className="req-cell-text">
                          <button className="row-link link-plain" onClick={(e) => { e.stopPropagation(); setViewing(m); }}>{m.description}</button>
                          <span className="matno muted">{m.materialNumber} · {m.materialType}</span>
                        </span>
                      </div>
                    </td>
                    <td><span className="pill" title={helpText('materialGroup', m.materialGroup)}>{m.materialGroup} · {helpText('materialGroup', m.materialGroup)}</span></td>
                    <td><span className="cell-two"><strong>{m.plant}</strong><small className="muted">{helpText('plant', m.plant)}</small></span></td>
                    <td className="num"><strong>{fmtMoney(m.standardPrice, m.currency)}</strong></td>
                    <td className="nowrap">{fmtDate(m.createdOn)}</td>
                    <td>
                      <Link className="id-chip id-link" href={`/master/material/requests/view?id=${encodeURIComponent(m.transId)}`} onClick={(e) => e.stopPropagation()}>{m.transId}</Link>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                      {user.level === null && (
                        <Link className="btn btn-sm" href={`/master/material/new?ref=${m.materialNumber}`} title="Start a new request with this material's data">
                          <IconCopy size={14} /> Use as reference
                        </Link>
                      )}
                      <button className="btn btn-sm btn-icon" disabled title="Change (MX) – phase 2" aria-label="Change (phase 2)"><IconEdit size={14} /></button>
                      <button className="btn btn-sm btn-icon" disabled title="Extension (ME) – phase 2" aria-label="Extend (phase 2)"><IconLayers size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tab-note muted"><IconLayers size={13} /> Change (MX) and extension (ME) run on the same engine in phase 2.</p>
      </section>

      {viewing && <MaterialDrawer m={viewing} canReference={user.level === null} onClose={() => setViewing(null)} />}
    </>
  );
}

const KEY: FieldKey[] = ['materialType', 'industrySector', 'materialGroup', 'division', 'businessVertical', 'scheme'];
const ORG: FieldKey[] = ['plant', 'storageLocation', 'salesOrg', 'distChannel', 'warehouseNo', 'storageType'];
const LABEL: Partial<Record<FieldKey, string>> = {
  materialType: 'Material type', industrySector: 'Industry sector', materialGroup: 'Material group', division: 'Division',
  businessVertical: 'Business vertical', scheme: 'Scheme', plant: 'Plant', storageLocation: 'Storage location',
  salesOrg: 'Sales org', distChannel: 'Distribution channel', warehouseNo: 'Warehouse', storageType: 'Storage type',
};

function MaterialDrawer({ m, canReference, onClose }: { m: MaterialRecord; canReference: boolean; onClose: () => void }) {
  const [section, setSection] = useState<'key' | string>('key');
  const hierarchy = m.prodHierarchy ? hierarchyText(m.prodHierarchy).split(' › ') : [];
  const codes = splitHierarchy(m.prodHierarchy);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="mat-title" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-hero">
          <div className="drawer-hero-top">
            <span className="page-icon" aria-hidden><IconBox size={22} /></span>
            <button className="drawer-close" onClick={onClose} aria-label="Close"><IconX size={18} /></button>
          </div>
          <div className="req-ids">
            <span className="id-chip id-chip-dark">{m.materialNumber}</span>
            <span className="badge badge-success">Posted</span>
          </div>
          <h2 id="mat-title">{m.description}</h2>
          <div className="drawer-facts">
            <span><strong>{fmtMoney(m.standardPrice, m.currency)}</strong> standard price</span>
            <span>Created {fmtDate(m.createdOn)} by {m.createdBy}</span>
            <span>Request <span className="matno">{m.transId}</span></span>
          </div>
        </header>

        <nav className="drawer-tabs" aria-label="Material sections">
          <button className={`schip ${section === 'key' ? 'on' : ''}`} onClick={() => setSection('key')}>Key and org data</button>
          {ALL_VIEW_IDS.map((id) => (
            <button key={id} className={`schip ${section === id ? 'on' : ''}`} onClick={() => setSection(id)}>{VIEW_BY_ID[id].label}</button>
          ))}
        </nav>

        <div className="drawer-body">
          {section === 'key' ? (
            <>
              <div>
                <div className="block-head"><span className="block-icon"><IconTag size={16} /></span><h3>Key data</h3></div>
                <dl className="kv kv-tiles">
                  {KEY.map((k) => <div key={k}><dt>{LABEL[k]}</dt><dd>{displayValue(k, m[k], m) || '—'}</dd></div>)}
                </dl>
              </div>
              {hierarchy.length > 1 && (
                <div className="ph-block">
                  <span className="ph-block-label">Product hierarchy · <span className="matno">{m.prodHierarchy}</span></span>
                  <ol className="ph-trail">
                    {hierarchy.map((t, i) => <li key={i}><small>{PH_LEVELS[i]} · {codes[i]}</small><span>{t}</span></li>)}
                  </ol>
                </div>
              )}
              {m.longText && <div className="longtext-block"><span className="ph-block-label">Long text</span><p>{m.longText}</p></div>}
              <div>
                <div className="block-head"><span className="block-icon"><IconBuilding size={16} /></span><h3>Organizational data</h3></div>
                <dl className="kv kv-tiles">
                  {ORG.map((k) => <div key={k}><dt>{LABEL[k]}</dt><dd>{displayValue(k, m[k], m) || '—'}</dd></div>)}
                </dl>
              </div>
            </>
          ) : (
            <DataSummary data={m} views={[section as (typeof ALL_VIEW_IDS)[number]]} />
          )}
        </div>

        <footer className="drawer-foot">
          <Link className="btn btn-ghost" href={`/master/material/requests/view?id=${encodeURIComponent(m.transId)}`}><IconDoc size={15} /> Open request</Link>
          {canReference && (
            <Link className="btn btn-primary" href={`/master/material/new?ref=${m.materialNumber}`}><IconCopy size={15} /> Use as reference</Link>
          )}
        </footer>
      </aside>
    </div>
  );
}
