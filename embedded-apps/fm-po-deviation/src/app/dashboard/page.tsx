'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, CheckCircle2, XCircle, IndianRupee, Download, Building2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchApprovedHistory, fetchMyApprovals, fetchRejectedHistory } from '../../lib/sapClient';
import { getHubEmail } from '../../lib/hubEmailLogin';
import type { PoRow } from '../../types/po';
import { formatCurrency, formatDate } from '../../lib/formatters';

function KpiCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}20` }}>
        <Icon size={18} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-extrabold text-ink">{value}</p>
        <p className="text-[11.5px] font-semibold text-inkSoft">{label}</p>
      </div>
    </div>
  );
}

function sumValue(rows: PoRow[]): number {
  return rows.reduce((acc, r) => acc + (parseFloat(r.netwr) || 0), 0);
}

/** Top vendors by pending exposure — a quick "who's waiting on me" view an approver can't get from
 * the source Fiori app at all, since it never aggregated anything beyond a flat list. */
function topVendors(rows: PoRow[], limit = 5) {
  const map = new Map<string, { name: string; count: number; value: number }>();
  rows.forEach((r) => {
    const key = r.lifnr || 'Unknown';
    const entry = map.get(key) || { name: r.name1 || key, count: 0, value: 0 };
    entry.count += 1;
    entry.value += parseFloat(r.netwr) || 0;
    map.set(key, entry);
  });
  return Array.from(map.entries())
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [pending, setPending] = useState<PoRow[]>([]);
  const [approved, setApproved] = useState<PoRow[]>([]);
  const [rejected, setRejected] = useState<PoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setEmail(getHubEmail());
  }, []);

  useEffect(() => {
    if (!email) return;
    setLoading(true);
    Promise.all([fetchMyApprovals(email), fetchApprovedHistory(email), fetchRejectedHistory(email)])
      .then(([p, a, r]) => { setPending(p); setApproved(a); setRejected(r); })
      .finally(() => setLoading(false));
  }, [email]);

  const vendors = useMemo(() => topVendors(pending), [pending]);
  const currency = pending[0]?.waers || approved[0]?.waers || 'INR';

  const exportHistory = () => {
    const rows = [...approved, ...rejected].map((r) => ({
      'PO Number': r.ebeln,
      Vendor: r.name1,
      'Vendor Code': r.lifnr,
      Description: r.stxt,
      Amount: r.netwr,
      Currency: r.waers,
      Status: r.status === 'A' ? 'Approved' : 'Rejected',
      Date: formatDate(r.erdat),
      Remarks: r.addInfo,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Approval History');
    XLSX.writeFile(book, `PO_Approval_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-ink">Dashboard</h1>
        <button onClick={exportHistory} className="btn-primary">
          <Download size={15} /> Export History (Excel)
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={ClipboardCheck} label="Pending Approvals" value={String(pending.length)} accent="#B45309" />
        <KpiCard icon={CheckCircle2} label="Approved" value={String(approved.length)} accent="#1F7A4D" />
        <KpiCard icon={XCircle} label="Rejected" value={String(rejected.length)} accent="#C0392B" />
        <KpiCard icon={IndianRupee} label="Pending Value" value={formatCurrency(currency, String(sumValue(pending)))} accent="#4F3FD6" />
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Building2 size={16} className="text-rust" />
          <h2 className="text-sm font-extrabold text-ink">Top Vendors Awaiting Your Approval</h2>
        </div>
        {vendors.length === 0 ? (
          <p className="py-6 text-center text-sm text-inkSoft">Nothing pending right now.</p>
        ) : (
          <div className="space-y-3">
            {vendors.map((v) => {
              const max = Math.max(...vendors.map((x) => x.value), 1);
              return (
                <div key={v.code} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 truncate text-xs font-semibold text-ink" title={v.name}>{v.name}</div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-appBg">
                    <div className="h-full rounded-full bg-rust" style={{ width: `${(v.value / max) * 100}%` }} />
                  </div>
                  <div className="w-28 shrink-0 text-right text-xs font-bold text-ink">{formatCurrency(currency, String(v.value))}</div>
                  <div className="w-14 shrink-0 text-right text-[11px] font-semibold text-inkSoft">{v.count} PO{v.count === 1 ? '' : 's'}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
