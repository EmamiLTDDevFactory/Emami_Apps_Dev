'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Mail, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import AdminGuard from '../../components/AdminGuard';
import Banner, { type BannerState } from '../../components/Banner';
import { api } from '../../lib/termPolicyApi';
import { exportPoliciesToExcel } from '../../lib/exportExcel';
import { inr } from '../../lib/validate';
import type { Policy } from '../../types/policy';

function ReportInner() {
  const { email } = useApp();
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Policy[]>([]);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const fail = (e: unknown) => setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });

  const loadAll = useCallback(async () => {
    if (!email) return;
    setBusy(true);
    try {
      setRows(await api.listPolicies(email, { all: true }));
      setPicked(new Set());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [email]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? rows.filter((r) => [r.empId, r.employeeName, r.reqno, r.orgUnit].some((v) => v.toLowerCase().includes(s))) : rows;
  }, [rows, search]);

  async function removeOne(p: Policy) {
    if (!email || !window.confirm(`Delete request ${p.reqno} for ${p.employeeName}?`)) return;
    setBusy(true);
    try {
      await api.deletePolicy(email, p.reqno);
      setBanner({ type: 'success', message: 'Request Deleted.' });
      await loadAll();
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  }

  async function mail() {
    if (!email || picked.size === 0) return;
    setBusy(true);
    try {
      await api.sendSummary(email, [...picked]);
      setBanner({ type: 'success', message: `Mail sent for ${picked.size} request(s).` });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
      <div className="glass-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className="input w-64" placeholder="Search employee, name, request…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="text-[12px] text-inkSoft">{filtered.length} of {rows.length}</span>
          <div className="ml-auto flex gap-2">
            <button className="btn btn-ghost" disabled={busy || picked.size === 0} onClick={mail}><Mail size={13} /> Send mail ({picked.size})</button>
            <button className="btn btn-primary" disabled={rows.length === 0} onClick={() => exportPoliciesToExcel(filtered)}><Download size={13} /> Download</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="text-inkSoft">
              <tr>
                <th className="p-1.5"><input type="checkbox" checked={filtered.length > 0 && filtered.every((r) => picked.has(r.reqno))} onChange={(e) => setPicked(e.target.checked ? new Set(filtered.map((r) => r.reqno)) : new Set())} aria-label="Select all" /></th>
                <th className="p-1.5">Request</th><th className="p-1.5">Employee</th><th className="p-1.5">Org unit</th><th className="p-1.5">Sum assured</th>
                <th className="p-1.5 text-right">Total premium</th><th className="p-1.5">Nominees</th><th className="p-1.5">By</th><th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.reqno} className="border-t border-border">
                  <td className="p-1.5"><input type="checkbox" checked={picked.has(r.reqno)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.reqno); else n.delete(r.reqno); return n; })} aria-label={`Select ${r.reqno}`} /></td>
                  <td className="p-1.5 font-semibold">{r.reqno}</td>
                  <td className="p-1.5">{r.empId} · {r.employeeName}</td>
                  <td className="p-1.5">{r.orgUnit}</td>
                  <td className="p-1.5">{r.sumAssured}</td>
                  <td className="p-1.5 text-right">{inr(r.total)}</td>
                  <td className="p-1.5">{r.nominees.map((n) => `${n.name} ${n.share}%`).join(', ')}</td>
                  <td className="p-1.5">{r.createdBy}</td>
                  <td className="p-1.5"><button className="text-red" onClick={() => removeOne(r)} aria-label={`Delete ${r.reqno}`}><Trash2 size={14} /></button></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-inkSoft">{busy ? 'Loading…' : 'No policies for this year.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <AdminGuard>
      <ReportInner />
    </AdminGuard>
  );
}
