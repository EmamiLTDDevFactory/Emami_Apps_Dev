'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCheck, Clock, FileText, RotateCcw, type LucideIcon } from 'lucide-react';
import { fetchProvisionPOs, type PaymentTrackingRow, type ProvisionStatus } from '../../lib/paymentTrackingApi';
import { usePaymentTrackingAuth } from '../../context/PaymentTrackingAuthContext';
import { useMonthYear } from '../../context/MonthYearContext';
import { num, formatValue, breakdownBy, filterByMonth } from '../../lib/provisionMetrics';
import { ProvisionHero, KpiCard, HorizontalBarBreakdown, ProvisionDetailModal, PT_COLORS } from '../../components/ProvisionUI';
import { ProvisionFilterBar, applyProvisionFilters, EMPTY_PROVISION_FILTERS, type ProvisionFilterState } from '../../components/ProvisionFilters';
import { Banner, Card, CardTitle, LoadingBlock } from '../../components/ui';
import { AdminDenied, RoleLoading } from '../../components/admin/AdminStates';

// The SES lifecycle, per paymentTrackingApi.ts's own header comment on how Status is derived —
// used as the fixed set of tiles below so every stage always shows (even at zero) rather than only
// the statuses this month's rows happen to include.
const STATUS_STAGES: { code: ProvisionStatus; label: string; icon: LucideIcon; accent: string }[] = [
  { code: '01', label: 'Service Entry Sheet not created', icon: FileText, accent: PT_COLORS.inkSoft },
  { code: '02', label: 'GR posted, SES not created', icon: AlertTriangle, accent: PT_COLORS.red },
  { code: '03', label: 'SES created and reversed', icon: RotateCcw, accent: PT_COLORS.inkSoft },
  { code: '04', label: 'SES created, acceptance pending', icon: Clock, accent: PT_COLORS.amber },
  { code: '05', label: 'SES created and accepted', icon: CheckCheck, accent: PT_COLORS.green },
];

/** Admin's Overall SES Status — a single at-a-glance summary of every open PO item's Service Entry
 * Sheet lifecycle stage (Status '01'-'05', see paymentTrackingApi.ts), across the whole org. Reuses
 * fetchProvisionPOs (ZProvisionTrackSet) exactly as Dashboard/Provision Details do — same Admin-
 * scoped email, same Month/Year context — so this always matches what those screens report. */
export default function SesStatusScreen() {
  const { email, role, roleLoading } = usePaymentTrackingAuth();
  const { month, year } = useMonthYear();
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProvisionFilterState>(EMPTY_PROVISION_FILTERS);
  const [activeStatus, setActiveStatus] = useState<{ title: string; subtitle: string; rows: PaymentTrackingRow[] } | null>(null);

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
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load SES status data.'))
      .finally(() => setLoading(false));
  }, [email, role, roleLoading, year]);

  const monthRows = useMemo(() => filterByMonth(rows, month), [rows, month]);
  const filteredRows = useMemo(() => applyProvisionFilters(monthRows, filters), [monthRows, filters]);

  const rowsByStatus = useMemo(() => {
    const map = new Map<string, PaymentTrackingRow[]>();
    filteredRows.forEach((r) => {
      const key = r.status || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return map;
  }, [filteredRows]);

  const statusBreakdown = useMemo(
    () => breakdownBy(filteredRows, (r) => r.status || '(unknown)', (r) => r.status || 'Unknown', (r) => r.statusText),
    [filteredRows]
  );

  if (roleLoading) {
    return <RoleLoading />;
  }

  // Defense in depth — the nav bar already hides this link from non-Admins, but the route is
  // still reachable by a typed URL.
  if (role !== 'Admin') {
    return <AdminDenied message="Overall SES Status is only available to Admins." />;
  }

  return (
    <div className="flex flex-col gap-3 pb-10">
      <ProvisionHero
        eyebrow="Admin · Cross-org"
        title="Overall SES Status"
        subtitle="Every open PO item's Service Entry Sheet lifecycle stage, at a glance — tap a stage or a bar for its line items."
      />

      {loading ? (
        <LoadingBlock label="Loading SES status data…" />
      ) : error ? (
        <Banner type="error">{error}</Banner>
      ) : (
        <>
          <ProvisionFilterBar rows={monthRows} value={filters} onChange={setFilters} resultCount={filteredRows.length} />

          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 [&>*]:min-w-0">
            {STATUS_STAGES.map((stage) => {
              const stageRows = rowsByStatus.get(stage.code) || [];
              const stageValue = stageRows.reduce((sum, r) => sum + num(r.pendingValue), 0);
              return (
                <KpiCard
                  key={stage.code}
                  icon={stage.icon}
                  label={`${stage.code} · ${stage.label}`}
                  value={`${stageRows.length} · ${formatValue(stageValue)}`}
                  accent={stage.accent}
                  onPress={() => setActiveStatus({
                    title: `${stage.code} · ${stage.label}`,
                    subtitle: `${stageRows.length} line item(s), ${formatValue(stageValue)} pending.`,
                    rows: stageRows,
                  })}
                />
              );
            })}
          </div>

          <Card ledger>
            <CardTitle title="Pending bill value by SES status" />
            <p className="-mt-1.5 mb-2 text-xs text-inkSoft">The provision lifecycle from Service Entry Sheet not created through accepted. Tap a bar for its line items.</p>
            <HorizontalBarBreakdown
              data={statusBreakdown}
              emptyMessage="No open provisions to break down yet."
              onSelect={(d) => setActiveStatus({
                title: `Status: ${d.label}${d.sublabel ? ` — ${d.sublabel}` : ''}`,
                subtitle: `${d.count} line item(s), ${formatValue(d.value)} pending.`,
                rows: filteredRows.filter((r) => (r.status || '(unknown)') === d.key),
              })}
            />
          </Card>
        </>
      )}

      {activeStatus && (
        <ProvisionDetailModal
          title={activeStatus.title}
          subtitle={activeStatus.subtitle}
          rows={activeStatus.rows}
          onClose={() => setActiveStatus(null)}
        />
      )}
    </div>
  );
}
