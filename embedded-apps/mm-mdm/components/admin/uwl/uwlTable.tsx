'use client';

import Link from 'next/link';
import { UwlItem, OPENS_HERE, SLA_HINT, LEVEL_HINT, ageText } from '@/lib/admin/uwlApi';
import { requestHref } from '../../ui';

export type SortKey = 'created' | 'age' | 'app' | 'level' | 'status' | 'agent' | 'initiator' | 'request' | 'text';

function Th({ label, k, sort, dir, onSort, hint }: { label: string; k: SortKey; sort: string; dir: string; onSort: (k: SortKey) => void; hint?: string }) {
  const on = sort === k;
  return (
    <th aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} title={hint}>
      <button type="button" className="wl-sort" onClick={() => onSort(k)}>
        {label}<span aria-hidden>{on ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  );
}

export function ItemLink({ it }: { it: UwlItem }) {
  if (OPENS_HERE.has(it.appId)) {
    return <Link className="row-link" href={requestHref(it.transId)}>{it.text || it.transId}</Link>;
  }
  return (
    <span>
      <span className="wl-text">{it.text || it.transId}</span>{' '}
      <span className="wl-legacy" title="This request type has not been rebuilt here yet. It can only be opened in the legacy SAP Web Dynpro application.">opens in the legacy app</span>
    </span>
  );
}

export default function UwlTable({ items, sort, dir, onSort, showAgent }: { items: UwlItem[]; sort: string; dir: string; onSort: (k: SortKey) => void; showAgent: boolean }) {
  const t = { sort, dir, onSort };
  return (
    <div className="table-wrap">
      <table className="table wl-table">
        <thead>
          <tr>
            <Th label="Request" k="text" {...t} />
            <Th label="App" k="app" {...t} />
            <Th label="Level" k="level" hint={LEVEL_HINT} {...t} />
            <Th label="Status" k="status" {...t} />
            {showAgent && <Th label="Agent(s)" k="agent" {...t} />}
            <Th label="Initiated by" k="initiator" {...t} />
            <Th label="Created" k="created" {...t} />
            <Th label="Age" k="age" hint={SLA_HINT} {...t} />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.wiId} className={it.stale ? 'wl-row-stale' : ''}>
              <td>
                <div className="wl-main"><ItemLink it={it} /></div>
                <span className="matno muted">{it.transId.replace(/^0+/, '')}{it.objValue && ` · ${it.objValue.replace(/^0+/, '')}`} · WI {it.wiId.replace(/^0+/, '')}</span>
              </td>
              <td><span className="pill" title={it.appName}>{it.appId}</span> <span className="muted wl-appname">{it.appName !== it.appId ? it.appName : ''}</span></td>
              <td className="nowrap">{it.level ? <span title={it.levelNote}>{it.level}</span> : <span className="muted" title={it.levelNote}>closed</span>}</td>
              <td><span className="pill" title={it.levelNote}>{it.statusText}</span>{it.orphan && <span className="wl-flag wl-flag-warn" title={it.levelNote}>stray item</span>}</td>
              {showAgent && <td title={it.agents}>{it.agentNames || <span className="muted">none</span>}</td>}
              <td title={it.initiator}>{it.initiatorName || <span className="muted">-</span>}</td>
              <td className="nowrap">{it.created}</td>
              <td className="nowrap">
                {ageText(it.ageDays)}
                {it.slaBreached && <span className="wl-flag wl-flag-bad" title={SLA_HINT}>SLA {it.slaDays}d</span>}
                {it.stale && <span className="wl-flag wl-flag-stale" title="Open for more than 90 days, most likely a dead item.">stale</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
