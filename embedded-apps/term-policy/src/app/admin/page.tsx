'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Download, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listTermPolicySubmissions } from '../../lib/policyService';
import { exportTermPolicySubmissionsToExcel } from '../../lib/exportExcel';
import type { TermPolicySubmission } from '../../types/policy';

function matchesQuery(text: string, q: string): boolean {
  return text.toLowerCase().includes(q.trim().toLowerCase());
}

export default function AdminPage() {
  const { role, isAdmin, loading: authLoading } = useApp();
  const [rows, setRows] = useState<TermPolicySubmission[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    setLoadingRows(true);
    listTermPolicySubmissions()
      .then(setRows)
      .finally(() => setLoadingRows(false));
  }, [isAdmin]);

  const filtered = useMemo(
    () => rows.filter((r) => !search || [r.employee.name, r.employee.employeeId, r.employee.department].some((v) => matchesQuery(v, search))),
    [rows, search]
  );

  if (authLoading && role === 'User') {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="glass-card mx-auto max-w-sm p-4 text-center">
        <p className="text-[13px] font-semibold text-ink">Admins only</p>
        <p className="mt-1 text-[12px] text-inkSoft">
          You don&apos;t have Admin access for this app. Contact a Super Admin to request it via Manage Access.
        </p>
        <Link href="/" className="btn-primary mt-3 !px-3 !py-1.5 text-[12.5px]">Back to Home</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="glass-card flex items-center gap-2 px-3 py-1.5">
          <ShieldCheck size={14} className="text-rust" />
          <span className="text-[12px] font-semibold text-inkSoft">Term Policy Submissions</span>
          <span className="text-[13px] font-extrabold text-ink">{rows.length}</span>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 min-w-[180px] items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5">
          <Search size={13} className="text-inkSoft" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, employee ID, or department..."
            className="flex-1 text-[12.5px] text-ink outline-none placeholder:text-inkSoft"
          />
        </div>
        <button
          onClick={() => exportTermPolicySubmissionsToExcel(filtered)}
          disabled={filtered.length === 0}
          className="btn-ghost !px-2.5 !py-1.5 text-[12px]"
        >
          <Download size={13} />
          Download
        </button>
      </div>

      {loadingRows ? (
        <div className="flex justify-center py-10">
          <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-white text-[11px] font-bold uppercase text-inkSoft">
              <tr>
                {['Employee ID', 'Name', 'Department', 'Location', 'Sum Assured', 'Nominees', 'Smoker', 'Submitted On'].map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="odd:bg-white/40 border-t border-glassBorder">
                  <td className="px-2 py-1.5 font-semibold text-ink">{r.employee.employeeId}</td>
                  <td className="px-2 py-1.5">{r.employee.name}</td>
                  <td className="px-2 py-1.5">{r.employee.department}</td>
                  <td className="px-2 py-1.5">{r.employee.location}</td>
                  <td className="px-2 py-1.5">{r.sumAssured}</td>
                  <td className="px-2 py-1.5">{r.nominees.length}</td>
                  <td className="px-2 py-1.5">{r.isSmoker ? 'Yes' : 'No'}</td>
                  <td className="px-2 py-1.5 text-inkSoft">{new Date(r.submittedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-[12px] text-inkSoft">
                    No submissions match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
