'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Mail, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import Banner, { type BannerState } from '../../components/Banner';
import { api, massUpload } from '../../lib/termPolicyApi';
import { downloadLimitTemplate, downloadMassTemplate, exportPoliciesToExcel, parseLimitFile, parseMassFile } from '../../lib/exportExcel';
import { inr } from '../../lib/validate';
import type { LimitRow, MassRowResult, Policy } from '../../types/policy';

type Tab = 'policies' | 'limits' | 'mass';

export default function AdminPage() {
  const { email, isAdmin, loading: authLoading } = useApp();
  const [tab, setTab] = useState<Tab>('policies');
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);

  const [rows, setRows] = useState<Policy[]>([]);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const [limitRows, setLimitRows] = useState<LimitRow[]>([]);
  const [massResults, setMassResults] = useState<MassRowResult[]>([]);

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
    if (isAdmin) void loadAll();
  }, [isAdmin, loadAll]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? rows.filter((r) => [r.empId, r.employeeName, r.reqno, r.orgUnit].some((v) => v.toLowerCase().includes(s))) : rows;
  }, [rows, search]);

  if (authLoading) {
    return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="glass-card p-6 text-center">
        <ShieldCheck className="mx-auto mb-2 text-inkSoft" />
        <p className="text-[13px] font-bold text-ink">Not authorised</p>
        <p className="mt-1 text-[12px] text-inkSoft">Only HR administrators can open this page.</p>
        <Link href="/" className="btn btn-primary mt-3 inline-flex">Back to my policy</Link>
      </div>
    );
  }

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

  async function onLimitFile(file?: File) {
    if (!file) return;
    setBanner(null);
    try {
      const parsed = await parseLimitFile(file);
      setLimitRows(parsed);
      if (parsed.length === 0) setBanner({ type: 'error', message: 'The file has no rows.' });
    } catch {
      setBanner({ type: 'error', message: 'Could not read that file. Use the template (.xlsx).' });
    }
  }

  async function saveLimits() {
    if (!email) return;
    setBusy(true);
    try {
      const { count } = await api.saveLimits(email, limitRows);
      setBanner({ type: 'success', message: `Saved ${count} limit(s).` });
      setLimitRows([]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function onMassFile(file?: File) {
    if (!file || !email) return;
    setBanner(null);
    setMassResults([]);
    setBusy(true);
    try {
      const parsed = await parseMassFile(file);
      if (parsed.length === 0) {
        setBanner({ type: 'error', message: 'The file has no rows.' });
        return;
      }
      const results = await massUpload(email, parsed);
      setMassResults(results);
      const ok = results.filter((r) => r.ok).length;
      setBanner({ type: ok === results.length ? 'success' : 'error', message: `Employee Policies Saved: ${ok} of ${results.length} row(s).` });
      await loadAll();
    } catch {
      setBanner({ type: 'error', message: 'Could not read that file. Use the template (.xlsx).' });
    } finally {
      setBusy(false);
    }
  }

  const tabBtn = (t: Tab, label: string) => (
    <button type="button" onClick={() => setTab(t)} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`}>{label}</button>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {tabBtn('policies', 'Policies')}
        {tabBtn('limits', 'Insurance limits')}
        {tabBtn('mass', 'Mass upload')}
      </div>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

      {tab === 'policies' && (
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
      )}

      {tab === 'limits' && (
        <div className="glass-card space-y-3 p-4">
          <p className="text-[12.5px] text-inkSoft">Upload each employee&apos;s sum-assured cap (for example <b>50 LAKHS</b>) for the active year. Existing limits are overwritten.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-ghost" onClick={downloadLimitTemplate}><Download size={13} /> Template</button>
            <label className="btn btn-primary cursor-pointer"><Upload size={13} /> Choose file<input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { void onLimitFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
          </div>
          {limitRows.length > 0 && (
            <>
              <p className="text-[12.5px] font-semibold text-ink">{limitRows.length} row(s) ready. Preview of the first 10:</p>
              <ul className="text-[12px] text-inkSoft">{limitRows.slice(0, 10).map((l, i) => <li key={i}>{l.empId} → {l.limit}</li>)}</ul>
              <button className="btn btn-primary" disabled={busy} onClick={saveLimits}>Save {limitRows.length} limit(s)</button>
            </>
          )}
        </div>
      )}

      {tab === 'mass' && (
        <div className="glass-card space-y-3 p-4">
          <p className="text-[12.5px] text-inkSoft">Create policies for many employees at once. Every row goes through the same checks as the single form (limit, mobile, nominee shares = 100%). Rows that fail are listed below; the others are saved.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-ghost" onClick={downloadMassTemplate}><Download size={13} /> Template</button>
            <label className="btn btn-primary cursor-pointer"><Upload size={13} /> {busy ? 'Uploading…' : 'Choose file'}<input type="file" accept=".xlsx,.xls" className="hidden" disabled={busy} onChange={(e) => { void onMassFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
          </div>
          {massResults.length > 0 && (
            <table className="w-full text-left text-[12px]">
              <thead className="text-inkSoft"><tr><th className="p-1.5">Row</th><th className="p-1.5">Employee</th><th className="p-1.5">Result</th></tr></thead>
              <tbody>
                {massResults.map((r) => (
                  <tr key={r.row} className="border-t border-border">
                    <td className="p-1.5">{r.row}</td><td className="p-1.5">{r.empId}</td>
                    <td className={`p-1.5 font-semibold ${r.ok ? 'text-green' : 'text-red'}`}>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
