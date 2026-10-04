'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Search, XCircle } from 'lucide-react';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../lib/paymentTrackingApi';
import { usePaymentTrackingAuth } from '../../context/PaymentTrackingAuthContext';
import { useMonthYear, fiscalYearLabel } from '../../context/MonthYearContext';
import { ProvisionHero, ProvisionDetailModal } from '../../components/ProvisionUI';
import { Banner, Card, CardTitle, Chip, Input, LoadingBlock, TableWrap } from '../../components/ui';
import { AdminDenied, RoleLoading } from '../../components/admin/AdminStates';

// Fiscal month order (period 1 = April), matching Monat — the same server-computed field
// paymentTrackingApi.ts already exposes as fiscalPeriod, per ZPROVISIONTRACKS_GET_ENTITYSET's own
// lc_fy_start = 4. Columns read APR..MAR rather than JAN..DEC so they line up 1:1 with whichever
// Gjahr the shared Month/Year bar (useMonthYear) has selected — every other Provision Tracking
// screen already reports by this same financial year, not the calendar one.
const FISCAL_MONTHS = [
  { value: '01', label: 'APR' },
  { value: '02', label: 'MAY' },
  { value: '03', label: 'JUN' },
  { value: '04', label: 'JUL' },
  { value: '05', label: 'AUG' },
  { value: '06', label: 'SEP' },
  { value: '07', label: 'OCT' },
  { value: '08', label: 'NOV' },
  { value: '09', label: 'DEC' },
  { value: '10', label: 'JAN' },
  { value: '11', label: 'FEB' },
  { value: '12', label: 'MAR' },
];

interface MatrixRow {
  key: string;
  row: PaymentTrackingRow;
  vendorCode: string;
  vendorName: string;
  poNumber: string;
  serviceText: string;
  poCreator: string;
  /** One flag per FISCAL_MONTHS entry — true only for this row's own fiscalPeriod, and only once
   * its provision is fully accepted (Status '05'). Every PO item carries exactly one Eindt/Monat,
   * so at most one month is ever true per row (unlike Market Rate's matrix, where the same material
   * can pick up a tick in several different months across the year). */
  monthStatus: boolean[];
}

function buildMatrixRows(rows: PaymentTrackingRow[]): MatrixRow[] {
  return rows.map((r) => {
    const monthIdx = FISCAL_MONTHS.findIndex((m) => m.value === r.fiscalPeriod);
    const monthStatus = FISCAL_MONTHS.map(() => false);
    if (monthIdx >= 0 && r.status === '05') monthStatus[monthIdx] = true;
    return {
      key: r.key,
      row: r,
      vendorCode: r.vendor,
      vendorName: r.vendorName,
      poNumber: r.poNumber,
      serviceText: r.serviceText,
      poCreator: r.poCreator,
      monthStatus,
    };
  });
}

function matchesQuery(row: MatrixRow, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    row.vendorCode.toLowerCase().includes(q) ||
    row.vendorName.toLowerCase().includes(q) ||
    row.poNumber.toLowerCase().includes(q) ||
    row.serviceText.toLowerCase().includes(q) ||
    row.poCreator.toLowerCase().includes(q)
  );
}

/** Opens on tapping a green tick — the full line-item detail for that one PO item, reusing the same
 * ProvisionDetailModal/PaymentTrackingTable every other Provision Tracking screen shows its rows
 * in, rather than a bespoke pop-up. */
export default function ProvisionCalendar() {
  const { email, role, roleLoading } = usePaymentTrackingAuth();
  const { year } = useMonthYear();
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeRow, setActiveRow] = useState<MatrixRow | null>(null);

  useEffect(() => {
    if (roleLoading) return;
    if (role !== 'Admin' || !email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchProvisionPOs(email, { gjahr: year })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load provision data.'))
      .finally(() => setLoading(false));
  }, [email, role, roleLoading, year]);

  const allRows = useMemo(() => buildMatrixRows(rows), [rows]);
  const filteredRows = useMemo(() => allRows.filter((r) => matchesQuery(r, query)), [allRows, query]);

  if (roleLoading) {
    return <RoleLoading />;
  }

  // Defense in depth — the nav bar already hides this link from non-Admins, but the route is
  // still reachable by a typed URL.
  if (role !== 'Admin') {
    return <AdminDenied message="Calendar is only available to Admins." />;
  }

  return (
    <div className="flex flex-col gap-3 pb-10">
      <ProvisionHero
        eyebrow="Admin · Cross-org"
        title="Calendar"
        subtitle="Vendor · PO · month detail for every open service PO — tap a green tick to see that line's full detail."
      />

      {loading ? (
        <LoadingBlock label="Loading provision data…" />
      ) : error ? (
        <Banner type="error">{error}</Banner>
      ) : (
        <Card ledger>
          <CardTitle
            icon={CalendarDays}
            title={`Vendor · PO · month detail — ${fiscalYearLabel(Number(year))}`}
            actions={<Chip tone="rust">{filteredRows.length} row{filteredRows.length === 1 ? '' : 's'}</Chip>}
          />
          <p className="-mt-1 text-xs text-inkSoft">
            {filteredRows.length} row{filteredRows.length === 1 ? '' : 's'} match the current search. A green tick marks the month a line's Service Entry Sheet was created and accepted.
          </p>

          <div className="relative mb-2 mt-2 max-w-[420px]">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkSoft" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this table — vendor, PO, service text or creator"
              aria-label="Search vendor, PO, service text or creator in this table"
              className="pl-7 pr-7"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-inkSoft hover:text-ink">
                <XCircle size={15} />
              </button>
            ) : null}
          </div>

          {filteredRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-inkSoft">No open POs match this search.</p>
          ) : (
            // Bounded height so the (sticky) header row never scrolls out of view — the body scrolls
            // on its own within this box instead of the whole table scrolling with the page.
            <TableWrap maxHeight="480px">
              <table className="tbl min-w-[1260px] table-fixed">
                <colgroup>
                  <col style={{ width: 90 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 240 }} />
                  <col style={{ width: 130 }} />
                  {FISCAL_MONTHS.map((m) => <col key={m.value} style={{ width: 40 }} />)}
                  <col style={{ width: 60 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Vendor Code</th>
                    <th>Vendor Name</th>
                    <th>PO Number</th>
                    <th>Service Text</th>
                    <th>PO Creator</th>
                    {FISCAL_MONTHS.map((m) => (
                      <th key={m.value} className="!px-0 !text-center">{m.label}</th>
                    ))}
                    <th className="!text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => {
                    const acceptedCount = r.monthStatus.filter(Boolean).length;
                    return (
                      <tr key={r.key}>
                        <td className="code truncate">{r.vendorCode || '—'}</td>
                        <td className="truncate" title={r.vendorName}>{r.vendorName || '—'}</td>
                        <td className="code truncate">{r.poNumber || '—'}</td>
                        <td className="truncate" title={r.serviceText}>{r.serviceText || '—'}</td>
                        <td className="truncate">{r.poCreator || '—'}</td>
                        {r.monthStatus.map((accepted, i) => (
                          <td key={FISCAL_MONTHS[i].value} className="!px-0 text-center">
                            {accepted ? (
                              <button
                                type="button"
                                onClick={() => setActiveRow(r)}
                                aria-label={`View ${FISCAL_MONTHS[i].label} detail for PO ${r.poNumber}`}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-green transition-colors hover:bg-greenBg"
                              >
                                <CheckCircle2 size={15} />
                              </button>
                            ) : (
                              <span className="inline-flex h-6 w-6 items-center justify-center text-red/50">
                                <XCircle size={14} />
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="num text-center font-bold text-ink">{acceptedCount}/12</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      )}

      {activeRow && (
        <ProvisionDetailModal
          title={`PO ${activeRow.poNumber} — ${activeRow.vendorName || activeRow.vendorCode}`}
          subtitle={activeRow.serviceText}
          rows={[activeRow.row]}
          onClose={() => setActiveRow(null)}
        />
      )}
    </div>
  );
}
