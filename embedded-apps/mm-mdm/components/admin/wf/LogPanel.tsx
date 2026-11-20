'use client';

import { useCallback, useEffect, useState } from 'react';
import { WfCfg, WfKey, WfLogRow, emptyKey, wfApi } from '@/lib/admin/wfApi';
import { keyText, visibleKeyFields } from '@/lib/admin/wfLogic';
import { IconRefresh, IconSearch } from '../../icons';
import { LoadingState } from '../../ui';
import { MessageBox, VhInput } from './parts';

const KIND: Record<string, string> = { level: 'Level', agent: 'Agent', view: 'Tab' };

/** Read-only change log (what was changed, by whom, in which run), written by every save, copy, delete and mass change */
export default function LogPanel({ appId, cfg, fixedKey, auto }: { appId: string; cfg: WfCfg | undefined; fixedKey?: WfKey; auto?: boolean }) {
  const [key, setKey] = useState<WfKey>(fixedKey || emptyKey(appId));
  const [agent, setAgent] = useState('');
  const [lvl, setLvl] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<WfLogRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const fields = visibleKeyFields(cfg, fixedKey ? [fixedKey] : []);

  const load = useCallback(async (k: WfKey) => {
    if (!appId) return;
    setBusy(true); setErr(null);
    try { setRows((await wfApi.log({ ...k, appId, agent, lvl, dateFrom: from, dateTo: to, limit: 300 })).rows); } catch (e) { setErr(e); setRows(null); } finally { setBusy(false); }
  }, [appId, agent, lvl, from, to]);

  useEffect(() => { if (fixedKey) setKey(fixedKey); }, [fixedKey?.genType, fixedKey?.genField, fixedKey?.genField2, fixedKey?.genField3, fixedKey?.genField4]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (auto) load(fixedKey || key); }, [auto, appId, fixedKey?.genType, fixedKey?.genField, fixedKey?.genField2, fixedKey?.genField3, fixedKey?.genField4]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="wf-log">
      <form className="wf-filter" onSubmit={(e) => { e.preventDefault(); load(key); }}>
        {!fixedKey && fields.map((f) => (
          <VhInput key={f.field} id={`wf-log-${f.field}`} label={f.label} kind={f.vh} appId={appId} value={key[f.field]} onChange={(v) => setKey({ ...key, [f.field]: v })} placeholder="any" />
        ))}
        <VhInput id="wf-log-agent" label="User" kind="USER" appId={appId} value={agent} onChange={setAgent} placeholder="any" />
        <div className="field"><label className="field-label" htmlFor="wf-log-lvl">Level</label><input id="wf-log-lvl" value={lvl} onChange={(e) => setLvl(e.target.value.toUpperCase())} placeholder="any, e.g. L1" /></div>
        <div className="field"><label className="field-label" htmlFor="wf-log-from">From</label><input id="wf-log-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="wf-log-to">To</label><input id="wf-log-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button type="submit" className="btn btn-primary" disabled={busy || !appId}><IconSearch size={14} /> Show log</button>
      </form>
      <p className="muted wf-note">The log has no plant or brand column in SAP: plant and brand are kept in the note of each entry (entries of the old Web Dynpro carry none). {fixedKey ? `Showing ${keyText(fixedKey)}.` : ''}</p>
      <MessageBox error={err} />
      {busy && <LoadingState text="Reading the change log…" />}
      {!busy && rows && rows.length === 0 && <div className="empty"><p>No log entries for this selection.</p></div>}
      {!busy && rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="table wf-table wf-logtable">
            <thead><tr><th>Run</th><th>When / who</th><th>Combination</th><th>Type</th><th>Change</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.transId}-${i}`}>
                  <td className="num"><code>{r.transId}</code></td>
                  <td>{r.changedOn}<br /><span className="muted">{r.changedBy}</span></td>
                  <td>{[r.genType, r.genField, r.genField2, r.genField3, r.genField4].filter(Boolean).join(' / ') || '-'}</td>
                  <td><span className="badge badge-neutral">{KIND[r.kind] || r.kind}</span><br /><span className="muted">{r.reason}</span></td>
                  <td>{r.summary}{r.context && <><br /><small className="muted">{r.context}</small></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted wf-note">{rows.length} entries (newest first, at most 300).</p>
        </div>
      )}
      {rows === null && !busy && !err && <p className="muted">Choose the filters and press Show log.</p>}
      <button type="button" className="btn btn-sm btn-ghost wf-refresh" onClick={() => load(fixedKey || key)} disabled={busy}><IconRefresh size={14} /> Refresh</button>
    </div>
  );
}
