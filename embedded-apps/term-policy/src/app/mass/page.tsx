'use client';

import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import AdminGuard from '../../components/AdminGuard';
import Banner, { type BannerState } from '../../components/Banner';
import { massUpload } from '../../lib/termPolicyApi';
import { downloadMassTemplate, parseMassFile } from '../../lib/exportExcel';
import type { MassRowResult } from '../../types/policy';

function MassInner() {
  const { email } = useApp();
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [massResults, setMassResults] = useState<MassRowResult[]>([]);

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
    } catch {
      setBanner({ type: 'error', message: 'Could not read that file. Use the template (.xlsx).' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
      <div className="glass-card space-y-3 p-4">
        <h2 className="text-[13.5px] font-bold text-ink">Mass upload</h2>
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
    </div>
  );
}

export default function MassPage() {
  return (
    <AdminGuard>
      <MassInner />
    </AdminGuard>
  );
}
