'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import Banner, { type BannerState } from '../../components/Banner';
import { api } from '../../lib/termPolicyApi';
import { inr } from '../../lib/validate';
import { relationLabel, type Policy } from '../../types/policy';

/** Web Dynpro DISPLAY: look up a request. Editors and admins search any employee; an ordinary user sees the requests they created. */
export default function DisplayPage() {
  const { email, canActForOthers, loading } = useApp();
  const [empId, setEmpId] = useState('');
  const [rows, setRows] = useState<Policy[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);

  const load = useCallback(async (id?: string) => {
    if (!email) return;
    setBusy(true);
    setBanner(null);
    try {
      setRows(await api.listPolicies(email, id ? { empId: id } : {}));
    } catch (e) {
      setRows(null);
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }, [email]);

  useEffect(() => {
    if (!loading && !canActForOthers) void load();
  }, [loading, canActForOthers, load]);

  return (
    <div>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
      <div className="glass-card mb-3 p-4">
        <h2 className="mb-3 text-[13.5px] font-bold text-ink">Display request</h2>
        {canActForOthers ? (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (empId.trim()) void load(empId.trim()); }}>
            <div>
              <label className="field-label">Employee ID</label>
              <input className="input mt-1 w-44" inputMode="numeric" value={empId} onChange={(e) => setEmpId(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 90000618" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !empId}><Search size={13} /> Search</button>
          </form>
        ) : (
          <p className="text-[12.5px] text-inkSoft">Requests created by you for the active year.</p>
        )}
      </div>

      {busy && <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" /></div>}
      {!busy && rows && rows.length === 0 && <div className="glass-card p-4 text-[12.5px] text-inkSoft">No request found.</div>}
      {!busy && rows?.map((p) => (
        <div key={p.reqno} className="glass-card mb-3 p-4">
          <div className="mb-2 text-[13px] font-bold text-ink">Request {p.reqno} · {p.empId} {p.employeeName}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-4">
            <Item l="Year" v={p.year} /><Item l="Filed on" v={p.requestDate} /><Item l="Created by" v={p.createdBy} /><Item l="Org Unit" v={p.orgUnit} />
            <Item l="Designation" v={p.designation} /><Item l="Location" v={p.locationText} /><Item l="Mobile" v={p.contact} /><Item l="Personal Mail" v={p.personalEmail} />
            <Item l="Sum Assured" v={p.sumAssured} /><Item l="Base premium" v={inr(p.premium)} /><Item l="GST" v={inr(p.gst)} /><Item l="Total premium" v={inr(p.total)} />
          </div>
          <table className="mt-3 w-full text-left text-[12px]">
            <thead className="text-inkSoft"><tr><th className="p-1.5">Nominee</th><th className="p-1.5">Relation</th><th className="p-1.5">Share %</th></tr></thead>
            <tbody>
              {p.nominees.map((n, i) => <tr key={i} className="border-t border-border"><td className="p-1.5">{n.name}</td><td className="p-1.5">{relationLabel(n.relation)}</td><td className="p-1.5">{n.share}</td></tr>)}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Item({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div className="field-label">{l}</div>
      <div className="font-semibold text-ink">{v || '—'}</div>
    </div>
  );
}
