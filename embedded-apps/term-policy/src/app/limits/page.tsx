'use client';

import { useEffect, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import AdminGuard from '../../components/AdminGuard';
import Banner, { type BannerState } from '../../components/Banner';
import MasterGrid from '../../components/MasterGrid';
import YearBar from '../../components/YearBar';
import { maintApi } from '../../lib/maint';
import { api } from '../../lib/termPolicyApi';
import { downloadLimitTemplate, parseLimitFile } from '../../lib/exportExcel';
import type { LimitRow } from '../../types/policy';

function LimitsInner() {
  const { email, profile } = useApp();
  const [year, setYear] = useState('');
  const [gridKey, setGridKey] = useState(0);
  useEffect(() => {
    if (!year && profile?.activeYear) setYear(profile.activeYear);
  }, [profile?.activeYear, year]);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [limitRows, setLimitRows] = useState<LimitRow[]>([]);

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
      setGridKey((k) => k + 1);
    } catch (e) {
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
      <div className="glass-card space-y-3 p-4">
        <h2 className="text-[13.5px] font-bold text-ink">Insurance limits</h2>
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
      <div className="mt-4">
        <YearBar year={year} onChange={setYear} />
        <MasterGrid
          key={`${year}-${gridKey}`}
          table="LIMIT"
          title="Employee limits"
          note="Sum-assured cap per employee and year (SAP table ZLIFE_INS_LIMIT). Search, change, add or remove single employees here; use the upload above for many."
          year={year}
          api={maintApi}
          mode="diff"
          searchable
          cols={[
            { field: 'key1', label: 'Employee number', type: 'number', keyCol: true, required: true, maxLength: 8, width: '35%' },
            { field: 'val1', label: 'Limit', required: true, placeholder: 'e.g. 50 LAKHS', maxLength: 15 },
          ]}
          validate={(rows) => {
            const bad = rows.find((r) => !/^\d{1,6}( LAKHS)?$/i.test(r.val1.trim()));
            if (bad) return `Limit "${bad.val1}" for ${bad.key1} must look like 50 LAKHS.`;
            return null;
          }}
        />
      </div>
    </div>
  );
}

export default function LimitsPage() {
  return (
    <AdminGuard>
      <LimitsInner />
    </AdminGuard>
  );
}
