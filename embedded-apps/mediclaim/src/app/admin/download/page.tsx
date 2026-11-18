'use client';

import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import AdminGuard from '../../../components/AdminGuard';
import Banner, { type BannerState } from '../../../components/Banner';
import { Field, Section, Spinner, TableWrap, inputCls, selectCls, td, tdNum, th } from '../../../components/ui';
import { exportPolicyReportToExcel } from '../../../lib/exportExcel';
import { fmtDate, fmtMoney } from '../../../lib/format';
import { listPolicyReport } from '../../../lib/mediclaim';
import { genderLabel, relLabel } from '../../../lib/rules';
import type { PolicyReportRow } from '../../../lib/types';

function DownloadScreen() {
  const { ctx } = useApp();
  const [year, setYear] = useState(ctx?.Year ?? '');
  const [rows, setRows] = useState<PolicyReportRow[] | null>(null);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);

  const years = useMemo(() => {
    const y = Number(ctx?.Year);
    return y ? Array.from({ length: 8 }, (_, i) => String(y - i)) : [];
  }, [ctx?.Year]);

  const run = async () => {
    setBanner(null);
    setLoading(true);
    setLocation('');
    try {
      setRows(await listPolicyReport(year));
    } catch (e) {
      setRows(null);
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Could not load the report.' });
    } finally {
      setLoading(false);
    }
  };

  const locations = useMemo(() => [...new Set((rows ?? []).map((r) => r.LocText).filter(Boolean))].sort(), [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) => !location || r.LocText === location), [rows, location]);
  const employees = useMemo(() => new Set(shown.map((r) => r.ReqNo)).size, [shown]);

  return (
    <div>
      <h1 className="mb-3 text-[16px] font-extrabold text-ink">HR download</h1>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
      <Section title="Policies of a year" note="One row per insured member; deleted policies are not included">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-[160px]">
            <Field label="Year" htmlFor="dlYear">
              <select id="dlYear" className={selectCls()} value={year} onChange={(e) => setYear(e.target.value)}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
          </div>
          <button type="button" onClick={() => void run()} disabled={loading || !year} className="btn-primary !px-3 !py-2 text-[12.5px]">
            <Search size={13} />
            Search
          </button>
          {rows && (
            <>
              <div className="w-full max-w-[240px]">
                <Field label="Location" htmlFor="dlLoc">
                  <select id="dlLoc" className={selectCls()} value={location} onChange={(e) => setLocation(e.target.value)}>
                    <option value="">All locations</option>
                    {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </Field>
              </div>
              <button type="button" onClick={() => exportPolicyReportToExcel(shown, year)} disabled={shown.length === 0} className="btn-ghost !px-3 !py-2 text-[12.5px]">
                <Download size={13} />
                Download Excel
              </button>
            </>
          )}
        </div>
      </Section>

      {loading && <Spinner />}
      {!loading && rows && (
        <Section title="Preview" note={`${shown.length} row${shown.length === 1 ? '' : 's'} for ${employees} employee${employees === 1 ? '' : 's'}${shown.length > 100 ? ' (first 100 shown)' : ''}`}>
          {shown.length === 0 ? (
            <p className="text-[12.5px] text-inkSoft">No policies for this selection.</p>
          ) : (
            <TableWrap>
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-border bg-cream">
                  <tr>
                    <th className={th}>Employee ID</th><th className={th}>Location</th><th className={th}>Family No</th><th className={th}>Name</th>
                    <th className={th}>DOB</th><th className={th}>Gender</th><th className={th}>Relation</th>
                    <th className={`${th} text-right`}>Sum Insured</th><th className={`${th} text-right`}>Individual Premium</th>
                    <th className={`${th} text-right`}>Total Premium</th><th className={`${th} text-right`}>Employee Share</th><th className={`${th} text-right`}>Employer Share</th><th className={th}>New</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 100).map((r) => (
                    <tr key={`${r.ReqNo}-${r.SlNo}`} className="border-b border-border/60 last:border-0">
                      <td className={td}>{r.EmpId}</td><td className={td}>{r.LocText}</td><td className={td}>{r.FamilyNo || r.SlNo}</td><td className={td}>{r.Name}</td>
                      <td className={td}>{fmtDate(r.Dob)}</td><td className={td}>{genderLabel(r.Gender)}</td><td className={td}>{relLabel(r.Relation, r.Gender)}</td>
                      <td className={tdNum}>{fmtMoney(r.SumBase)}</td><td className={tdNum}>{fmtMoney(r.PreAmt)}</td>
                      <td className={tdNum}>{fmtMoney(r.TotalPre)}</td><td className={tdNum}>{fmtMoney(r.EmpShare)}</td><td className={tdNum}>{fmtMoney(r.EmployerShare)}</td>
                      <td className={td}>{r.NewInd ? 'New' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Section>
      )}
    </div>
  );
}

export default function DownloadPage() {
  return (
    <AdminGuard hrOnly>
      <DownloadScreen />
    </AdminGuard>
  );
}
