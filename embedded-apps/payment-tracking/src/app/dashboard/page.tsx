'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Banknote, Building2, FileText, Globe, List, Users } from 'lucide-react';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../lib/paymentTrackingApi';
import { usePaymentTrackingAuth } from '../../context/PaymentTrackingAuthContext';
import { useMonthYear } from '../../context/MonthYearContext';
import { num, formatValue, breakdownBy, filterByMonth } from '../../lib/provisionMetrics';
import { ProvisionHero, HeroActionButton, KpiCard, HorizontalBarBreakdown, ProvisionDetailModal, PT_COLORS } from '../../components/ProvisionUI';
import { ProvisionFilterBar, applyProvisionFilters, EMPTY_PROVISION_FILTERS, type ProvisionFilterState } from '../../components/ProvisionFilters';
import { Banner, Card, CardTitle, LoadingBlock } from '../../components/ui';
import { AdminDenied, RoleLoading } from '../../components/admin/AdminStates';

/** Admin's landing screen — cross-org KPIs plus "pending value by status" and "by cost center"
 * breakdowns, from fetchProvisionPOs() called with the signed-in Admin's own login email (always
 * sent, never omitted — see paymentTrackingApi.ts's header comment) and the app-wide Month/Year
 * selection (useMonthYear() — Year goes to SAP as a Gjahr filter, refetching on change; Month
 * narrows the response client-side by Eindt). The filter bar then narrows further on top of that,
 * so every KPI/chart on this screen always matches what's currently filtered by both. */
export default function ProvisionDashboard() {
  const router = useRouter();
  const { email, role, roleLoading } = usePaymentTrackingAuth();
  const { month, year } = useMonthYear();
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProvisionFilterState>(EMPTY_PROVISION_FILTERS);
  const [activeKpi, setActiveKpi] = useState<{ title: string; subtitle: string; rows: PaymentTrackingRow[] } | null>(null);

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

  const monthRows = useMemo(() => filterByMonth(rows, month), [rows, month]);
  const filteredRows = useMemo(() => applyProvisionFilters(monthRows, filters), [monthRows, filters]);

  const totalPending = useMemo(() => filteredRows.reduce((sum, r) => sum + num(r.pendingValue), 0), [filteredRows]);
  const distinctPOs = useMemo(() => new Set(filteredRows.map((r) => r.poNumber)).size, [filteredRows]);
  const distinctCostCenters = useMemo(() => new Set(filteredRows.filter((r) => r.costCenter).map((r) => r.costCenter)).size, [filteredRows]);
  const distinctVendors = useMemo(() => new Set(filteredRows.filter((r) => r.vendor).map((r) => r.vendor)).size, [filteredRows]);
  const distinctCountries = useMemo(() => new Set(filteredRows.filter((r) => r.country).map((r) => r.country)).size, [filteredRows]);
  // '02' = GR/MIGO posted but no Service Entry Sheet yet — called out explicitly as "your main
  // provision exposure bucket".
  const mainExposureRows = useMemo(() => filteredRows.filter((r) => r.status === '02'), [filteredRows]);
  const mainExposureValue = useMemo(() => mainExposureRows.reduce((sum, r) => sum + num(r.pendingValue), 0), [mainExposureRows]);

  const costCenterBreakdown = useMemo(
    () => breakdownBy(filteredRows, (r) => r.costCenter || '(unassigned)', (r) => r.costCenter || 'Unassigned', (r) => r.costCenterText, 8),
    [filteredRows]
  );
  const vendorBreakdown = useMemo(
    () => breakdownBy(filteredRows, (r) => r.vendor || '(unassigned)', (r) => r.vendor || 'Unassigned', (r) => r.vendorName, 8),
    [filteredRows]
  );
  const statusBreakdown = useMemo(
    () => breakdownBy(filteredRows, (r) => r.status || '(unknown)', (r) => r.status || 'Unknown', (r) => r.statusText),
    [filteredRows]
  );
  const countryBreakdown = useMemo(
    () => breakdownBy(filteredRows, (r) => r.country || '(unassigned)', (r) => r.country || 'Unassigned', () => ''),
    [filteredRows]
  );

  if (roleLoading) {
    return <RoleLoading />;
  }

  // Defense in depth — the nav bar already hides this link from non-Admins, but the route is
  // still reachable by a typed URL.
  if (role !== 'Admin') {
    return <AdminDenied message="Dashboard is only available to Admins." />;
  }

  return (
    <div className="flex flex-col gap-3 pb-10">
      <ProvisionHero
        eyebrow="Admin · Cross-org"
        title="Dashboard"
        subtitle="Cross-org provision status across every open service PO — filter by any standard KPI to focus in on a slice of it."
        right={<HeroActionButton label="Provision Details" onPress={() => router.replace('/provision-details/')} />}
      />

      {loading ? (
        <LoadingBlock label="Loading provision data…" />
      ) : error ? (
        <Banner type="error">{error}</Banner>
      ) : (
        <>
          <ProvisionFilterBar rows={monthRows} value={filters} onChange={setFilters} resultCount={filteredRows.length} />

          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
            <KpiCard
              icon={FileText}
              label="Open POs"
              value={String(distinctPOs)}
              onPress={() => setActiveKpi({
                title: 'Open POs',
                subtitle: `${distinctPOs} distinct PO(s) across ${filteredRows.length} open line item(s), under the current filter.`,
                rows: filteredRows,
              })}
            />
            <KpiCard
              icon={List}
              label="Open line items"
              value={String(filteredRows.length)}
              onPress={() => setActiveKpi({
                title: 'Open line items',
                subtitle: `Every open PO line item under the current filter.`,
                rows: filteredRows,
              })}
            />
            <KpiCard
              icon={Banknote}
              label="Pending bill value"
              value={formatValue(totalPending)}
              accent={PT_COLORS.red}
              onPress={() => setActiveKpi({
                title: 'Pending bill value',
                subtitle: `${formatValue(totalPending)} total pending across ${filteredRows.length} open line item(s).`,
                rows: filteredRows,
              })}
            />
            <KpiCard
              icon={Building2}
              label="Cost centers involved"
              value={String(distinctCostCenters)}
              onPress={() => setActiveKpi({
                title: 'Cost centers involved',
                subtitle: `${distinctCostCenters} distinct cost center(s) across the current filter's open line items.`,
                rows: filteredRows,
              })}
            />
            <KpiCard
              icon={Users}
              label="Vendors involved"
              value={String(distinctVendors)}
              onPress={() => setActiveKpi({
                title: 'Vendors involved',
                subtitle: `${distinctVendors} distinct vendor(s) across the current filter's open line items.`,
                rows: filteredRows,
              })}
            />
            <KpiCard
              icon={Globe}
              label="Countries involved"
              value={String(distinctCountries)}
              onPress={() => setActiveKpi({
                title: 'Countries involved',
                subtitle: `${distinctCountries} distinct country/countries (Land1) across the current filter's open line items.`,
                rows: filteredRows,
              })}
            />
          </div>

          {/* The exposure tile carries the longest label, so it gets the full width as a callout. */}
          <div className="grid grid-cols-1 [&>*]:min-w-0">
            <KpiCard
              icon={AlertTriangle}
              label="Main provision exposure — GR posted, no Service Entry Sheet"
              value={`${mainExposureRows.length} · ${formatValue(mainExposureValue)}`}
              accent={PT_COLORS.red}
              onPress={() => setActiveKpi({
                title: 'Main provision exposure',
                subtitle: `GR/MIGO posted but no Service Entry Sheet created yet — ${mainExposureRows.length} line item(s), ${formatValue(mainExposureValue)} pending.`,
                rows: mainExposureRows,
              })}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card ledger>
              <CardTitle title="Pending bill value by status" />
              <p className="-mt-1.5 mb-2 text-xs text-inkSoft">The provision lifecycle from Service Entry Sheet not created through accepted. Tap a bar for its line items.</p>
              <HorizontalBarBreakdown
                data={statusBreakdown}
                emptyMessage="No open provisions to break down yet."
                onSelect={(d) => setActiveKpi({
                  title: `Status: ${d.label}${d.sublabel ? ` — ${d.sublabel}` : ''}`,
                  subtitle: `${d.count} line item(s), ${formatValue(d.value)} pending.`,
                  rows: filteredRows.filter((r) => (r.status || '(unknown)') === d.key),
                })}
              />
            </Card>

            <Card ledger>
              <CardTitle title="Pending bill value by cost center" />
              <p className="-mt-1.5 mb-2 text-xs text-inkSoft">Top 8 cost centers by open value — tap a bar for its line items.</p>
              <HorizontalBarBreakdown
                data={costCenterBreakdown}
                emptyMessage="No open provisions to break down yet."
                onSelect={(d) => setActiveKpi({
                  title: `Cost Center: ${d.label}${d.sublabel ? ` — ${d.sublabel}` : ''}`,
                  subtitle: `${d.count} line item(s), ${formatValue(d.value)} pending.`,
                  rows: filteredRows.filter((r) => (r.costCenter || '(unassigned)') === d.key),
                })}
              />
            </Card>

            <Card ledger>
              <CardTitle title="Pending bill value by vendor" />
              <p className="-mt-1.5 mb-2 text-xs text-inkSoft">Top 8 vendors by open value across the current filter. Tap a bar for its line items.</p>
              <HorizontalBarBreakdown
                data={vendorBreakdown}
                emptyMessage="No open provisions to break down yet."
                onSelect={(d) => setActiveKpi({
                  title: `Vendor: ${d.label}${d.sublabel ? ` — ${d.sublabel}` : ''}`,
                  subtitle: `${d.count} line item(s), ${formatValue(d.value)} pending.`,
                  rows: filteredRows.filter((r) => (r.vendor || '(unassigned)') === d.key),
                })}
              />
            </Card>

            <Card ledger>
              <CardTitle title="Pending bill value by country" />
              <p className="-mt-1.5 mb-2 text-xs text-inkSoft">Every country (Land1) with open provisions. Tap a bar for its line items.</p>
              <HorizontalBarBreakdown
                data={countryBreakdown}
                emptyMessage="No open provisions to break down yet."
                onSelect={(d) => setActiveKpi({
                  title: `Country: ${d.label}`,
                  subtitle: `${d.count} line item(s), ${formatValue(d.value)} pending.`,
                  rows: filteredRows.filter((r) => (r.country || '(unassigned)') === d.key),
                })}
              />
            </Card>
          </div>
        </>
      )}

      {activeKpi && (
        <ProvisionDetailModal
          title={activeKpi.title}
          subtitle={activeKpi.subtitle}
          rows={activeKpi.rows}
          onClose={() => setActiveKpi(null)}
        />
      )}
    </div>
  );
}
