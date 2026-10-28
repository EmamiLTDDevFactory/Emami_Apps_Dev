'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, ChevronRight, Globe, List } from 'lucide-react';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../lib/paymentTrackingApi';
import { usePaymentTrackingAuth } from '../../context/PaymentTrackingAuthContext';
import { hasRole } from '../../lib/hubAccessApi';
import { useMonthYear } from '../../context/MonthYearContext';
import { filterByMonth } from '../../lib/provisionMetrics';
import PaymentTrackingTable from '../../components/PaymentTrackingTable';
import { ProvisionHero, HeroIconButton, OptionCard, PT_COLORS, ExcelButton } from '../../components/ProvisionUI';
import { lineItemSheet, type Sheet } from '../../lib/exportExcel';
import { ProvisionFilterBar, applyProvisionFilters, EMPTY_PROVISION_FILTERS, type ProvisionFilterState } from '../../components/ProvisionFilters';
import { Banner, InfoField, LoadingBlock, Modal, TableWrap } from '../../components/ui';
import { AdminDenied, RoleLoading } from '../../components/admin/AdminStates';

type Mode = 'choose' | 'costcenter' | 'costcenter-po' | 'country' | 'country-po' | 'report-po';

interface PoGroup {
  poNumber: string;
  poCreator: string;
  vendor: string;
  vendorName: string;
  costCenter: string;
  costCenterText: string;
  glAccount: string;
  glAccountText: string;
  country: string;
  lineCount: number;
  totalOpenValue: number;
  lines: PaymentTrackingRow[];
}

interface CostCenterGroup {
  costCenter: string;
  costCenterText: string;
  poCount: number;
  lineCount: number;
  totalOpenValue: number;
}

interface CountryGroup {
  country: string;
  poCount: number;
  lineCount: number;
  totalOpenValue: number;
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatValue(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** One tile per PO, aggregating that PO's line items (rows sharing the same poNumber) — used by
 * both drill-down flows' final tile level. Vendor/cost center/GL are taken from the group's first
 * line for the tile's own display; the popup shows every line's own values, which is what actually
 * matters if they ever differ within a PO. */
function groupByPo(rows: PaymentTrackingRow[]): PoGroup[] {
  const byPo = new Map<string, PoGroup>();
  for (const r of rows) {
    const key = r.poNumber || '(unknown PO)';
    let g = byPo.get(key);
    if (!g) {
      g = {
        poNumber: r.poNumber || 'Unknown',
        poCreator: r.poCreator,
        vendor: r.vendor,
        vendorName: r.vendorName,
        costCenter: r.costCenter,
        costCenterText: r.costCenterText,
        glAccount: r.glAccount,
        glAccountText: r.glAccountText,
        country: r.country,
        lineCount: 0,
        totalOpenValue: 0,
        lines: [],
      };
      byPo.set(key, g);
    }
    g.lineCount += 1;
    g.totalOpenValue += num(r.pendingValue);
    g.lines.push(r);
  }
  return Array.from(byPo.values()).sort((a, b) => b.totalOpenValue - a.totalOpenValue);
}

/** One tile per cost center — Cost Center Wise Details' first drill-down level. PO count is the
 * count of *distinct* POs touching that cost center, not the line-item count. */
function groupByCostCenter(rows: PaymentTrackingRow[]): CostCenterGroup[] {
  const byCc = new Map<string, { costCenter: string; costCenterText: string; poSet: Set<string>; lineCount: number; totalOpenValue: number }>();
  for (const r of rows) {
    const key = r.costCenter || '(unassigned)';
    let g = byCc.get(key);
    if (!g) {
      g = { costCenter: r.costCenter || 'Unassigned', costCenterText: r.costCenterText, poSet: new Set(), lineCount: 0, totalOpenValue: 0 };
      byCc.set(key, g);
    }
    g.poSet.add(r.poNumber);
    g.lineCount += 1;
    g.totalOpenValue += num(r.pendingValue);
  }
  return Array.from(byCc.values())
    .map((g) => ({ costCenter: g.costCenter, costCenterText: g.costCenterText, poCount: g.poSet.size, lineCount: g.lineCount, totalOpenValue: g.totalOpenValue }))
    .sort((a, b) => b.totalOpenValue - a.totalOpenValue);
}

/** One tile per country (Land1) — Country Wise Details' first drill-down level, same shape as
 * groupByCostCenter above. PO count is the count of *distinct* POs touching that country, not the
 * line-item count. */
function groupByCountry(rows: PaymentTrackingRow[]): CountryGroup[] {
  const byCountry = new Map<string, { country: string; poSet: Set<string>; lineCount: number; totalOpenValue: number }>();
  for (const r of rows) {
    const key = r.country || '(unassigned)';
    let g = byCountry.get(key);
    if (!g) {
      g = { country: r.country || 'Unassigned', poSet: new Set(), lineCount: 0, totalOpenValue: 0 };
      byCountry.set(key, g);
    }
    g.poSet.add(r.poNumber);
    g.lineCount += 1;
    g.totalOpenValue += num(r.pendingValue);
  }
  return Array.from(byCountry.values())
    .map((g) => ({ country: g.country, poCount: g.poSet.size, lineCount: g.lineCount, totalOpenValue: g.totalOpenValue }))
    .sort((a, b) => b.totalOpenValue - a.totalOpenValue);
}

// Colors each tile by where its pending value ranks against its siblings in the same grid — top
// third (biggest exposure) red, middle third amber, bottom third green — so the grid reads like a
// heatmap at a glance instead of a wall of identical white cards. Groups already arrive sorted by
// totalOpenValue descending (see groupByPo/groupByCostCenter), so `index` alone gives the rank.
function tileRankAccent(index: number, total: number): string {
  if (total <= 1) return PT_COLORS.red;
  const third = total / 3;
  if (index < third) return PT_COLORS.red;
  if (index < third * 2) return PT_COLORS.amber;
  return PT_COLORS.green;
}

/** One clickable group (the original's "Tile"): title, optional subtitle, KPIs, rank accent. */
interface TileItem {
  key: string;
  title: string;
  subtitle?: string;
  kpis: { label: string; value: string }[];
  accent: string;
  onPress: () => void;
}

/** The original's tile grid, rendered as a dense ranked table on desktop (one row per tile, KPI
 * columns right-aligned, rank accent as a left stripe) and a compact card list below 768px. Same
 * items, same order, same tap target per item. */
function TileTable({ items, titleLabel, subtitleLabel }: { items: TileItem[]; titleLabel: string; subtitleLabel?: string }) {
  const kpiLabels = items[0]?.kpis.map((k) => k.label) ?? [];
  return (
    <>
      <div className="hidden md:block">
        <TableWrap>
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-[44px] !pl-3">#</th>
                <th>{titleLabel}</th>
                {subtitleLabel ? <th>{subtitleLabel}</th> : null}
                {kpiLabels.map((l) => <th key={l} className="!text-right">{l}</th>)}
                <th className="w-[32px]" />
              </tr>
            </thead>
            <tbody>
              {items.map((t, i) => (
                <tr
                  key={t.key}
                  onClick={t.onPress}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.onPress(); } }}
                  tabIndex={0}
                  role="button"
                  aria-label={t.title}
                  className="group cursor-pointer outline-none focus-visible:bg-cream"
                >
                  <td className="relative !pl-3 text-2xs font-bold text-inkFaint num">
                    <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: t.accent }} aria-hidden />
                    {i + 1}
                  </td>
                  <td className="code whitespace-nowrap">{t.title}</td>
                  {subtitleLabel ? <td className="max-w-[380px] truncate text-xs text-inkSoft" title={t.subtitle}>{t.subtitle || '—'}</td> : null}
                  {t.kpis.map((k, ki) => (
                    <td
                      key={k.label}
                      className={`num whitespace-nowrap text-right ${ki === t.kpis.length - 1 ? 'font-bold' : 'text-inkSoft'}`}
                      style={ki === t.kpis.length - 1 ? { color: t.accent } : undefined}
                    >
                      {k.value}
                    </td>
                  ))}
                  <td className="text-inkFaint"><ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:text-rust" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>

      <div className="flex flex-col gap-1.5 md:hidden">
        {items.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={t.onPress}
            aria-label={t.title}
            className="relative flex items-center gap-2 overflow-hidden rounded-xl border border-border bg-white py-2 pl-3.5 pr-2 text-left shadow-card"
          >
            <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: t.accent }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="code truncate text-ink">{t.title}</p>
              {t.subtitle ? <p className="truncate text-xs text-inkSoft">{t.subtitle}</p> : null}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {t.kpis.map((k) => (
                  <span key={k.label} className="text-2xs text-inkSoft">
                    <span className="num text-xs font-bold text-ink">{k.value}</span> {k.label}
                  </span>
                ))}
              </div>
            </div>
            <ChevronRight size={15} className="shrink-0 text-inkSoft" />
          </button>
        ))}
      </div>
    </>
  );
}

/** The pop-up per instruction — full PO header context plus every line item, reusing
 * PaymentTrackingTable (same approved column set) so the line-item detail matches Upcoming/
 * Missed's own table instead of a second, divergent one. */
function PoDetailModal({ group, onClose }: { group: PoGroup; onClose: () => void }) {
  return (
    <Modal
      size="xl"
      title={`PO ${group.poNumber}`}
      subtitle={<>{group.vendor}{group.vendorName ? ` · ${group.vendorName}` : ''}</>}
      onClose={onClose}
    >
      <div className="mb-3 grid grid-cols-2 gap-3 border-b border-line pb-3 sm:grid-cols-3 lg:grid-cols-5">
        <InfoField label="PO Creator" value={group.poCreator || '—'} />
        <InfoField label="Cost Center" value={`${group.costCenter || '—'}${group.costCenterText ? ` · ${group.costCenterText}` : ''}`} />
        <InfoField label="GL Code" value={`${group.glAccount || '—'}${group.glAccountText ? ` · ${group.glAccountText}` : ''}`} />
        <InfoField label="Country" value={group.country || '—'} />
        <div className="min-w-0">
          <p className="text-2xs font-bold uppercase tracking-[0.06em] text-inkFaint">Pending Bill Value</p>
          <p className="num mt-[1px] text-sm font-extrabold text-red">{formatValue(group.totalOpenValue)}</p>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-ink">Line items ({group.lineCount})</p>
        <ExcelButton fileBase={`PO_${group.poNumber}`} sheets={() => [lineItemSheet(group.lines)]} />
      </div>
      <PaymentTrackingTable rows={group.lines} emptyMessage="No line items." />
    </Modal>
  );
}

/** Admin's Provision Details — a chooser between two drill-downs sharing the same tile/KPI/pop-up
 * shapes:
 *  - Cost Center Wise Details: cost center tiles -> that cost center's PO tiles -> pop-up.
 *  - Detailed Report: skips the cost-center level, starts straight at PO tiles (still showing
 *    cost center & GL on each tile) -> pop-up.
 * All client-side state (mode/selection), not route changes — the "pages" here are really just
 * drill-down levels within one screen. Data (fetchProvisionPOs) is fetched once, with the signed-
 * in Admin's own login email always sent (never omitted — see paymentTrackingApi.ts's header
 * comment), and grouped client-side. */
export default function ProvisionDetailsScreen() {
  const { email, role, roleLoading } = usePaymentTrackingAuth();
  const { month, year } = useMonthYear();
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('choose');
  const [selectedCostCenter, setSelectedCostCenter] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedPo, setSelectedPo] = useState<PoGroup | null>(null);
  const [filters, setFilters] = useState<ProvisionFilterState>(EMPTY_PROVISION_FILTERS);

  useEffect(() => {
    if (roleLoading) return;
    if (!hasRole(role, 'Admin') || !email) {
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
  const poGroups = useMemo(() => groupByPo(filteredRows), [filteredRows]);
  const costCenterGroups = useMemo(() => groupByCostCenter(filteredRows), [filteredRows]);
  const countryGroups = useMemo(() => groupByCountry(filteredRows), [filteredRows]);
  const posForSelectedCostCenter = useMemo(
    () => poGroups.filter((g) => (g.costCenter || 'Unassigned') === selectedCostCenter),
    [poGroups, selectedCostCenter]
  );
  const posForSelectedCountry = useMemo(
    () => poGroups.filter((g) => (g.country || 'Unassigned') === selectedCountry),
    [poGroups, selectedCountry]
  );

  if (roleLoading) {
    return <RoleLoading />;
  }

  // Defense in depth — the nav bar already hides this link from non-Admins, but the route is
  // still reachable by a typed URL.
  if (!hasRole(role, 'Admin')) {
    return <AdminDenied message="Provision Details is only available to Admins." />;
  }

  const onBack = () => {
    if (mode === 'costcenter-po') {
      setMode('costcenter');
      setSelectedCostCenter(null);
      return;
    }
    if (mode === 'country-po') {
      setMode('country');
      setSelectedCountry(null);
      return;
    }
    setMode('choose');
  };

  const heroTitle =
    mode === 'choose'
      ? 'Provision Details'
      : mode === 'costcenter'
        ? 'Cost Center Wise Details'
        : mode === 'costcenter-po'
          ? `Cost Center ${selectedCostCenter}`
          : mode === 'country'
            ? 'Country Wise Details'
            : mode === 'country-po'
              ? `Country ${selectedCountry}`
              : 'Detailed Report';

  const heroSubtitle =
    mode === 'choose'
      ? 'Choose how to browse every open provision — by cost center, by country, or as one flat report.'
      : mode === 'costcenter'
        ? 'Every open cost center with its PO count and pending value — tap one to drill into its POs.'
        : mode === 'costcenter-po'
          ? 'Every open PO under this cost center — tap one for its full line-item detail.'
          : mode === 'country'
            ? 'Every open country (Land1) with its PO count and pending value — tap one to drill into its POs.'
            : mode === 'country-po'
              ? 'Every open PO under this country — tap one for its full line-item detail.'
              : 'Every open PO at once, with cost center and GL shown up front — tap one for its full line-item detail.';

  // PO-level tiles are identical across the three PO drill-downs (cost center / country / report).
  const poTiles = (groups: PoGroup[]): TileItem[] =>
    groups.map((g, i) => ({
      key: g.poNumber,
      title: g.poNumber,
      subtitle: `GL ${g.glAccount || '—'} · CC ${g.costCenter || '—'}`,
      accent: tileRankAccent(i, groups.length),
      kpis: [
        { label: 'Lines', value: String(g.lineCount) },
        { label: 'Pending Value', value: formatValue(g.totalOpenValue) },
      ],
      onPress: () => setSelectedPo(g),
    }));

  // Excel for whatever level is on screen: that level's table (cost centers, countries or POs) plus the line items
  // behind it, under the current Period and filters.
  const poSheet = (groups: PoGroup[]): Sheet => ({
    name: 'POs', widths: [12, 14, 10, 28, 12, 26, 12, 26, 8, 8, 16],
    header: ['PO Number', 'PO Creator', 'Vendor', 'Vendor Name', 'Cost Center', 'Cost Center Text', 'GL Code', 'GL Text', 'Country', 'Lines', 'Pending bill value'],
    rows: groups.map((g) => [g.poNumber, g.poCreator, g.vendor, g.vendorName, g.costCenter, g.costCenterText, g.glAccount, g.glAccountText, g.country, g.lineCount, g.totalOpenValue]),
  });
  const detailSheets = (): Sheet[] => {
    if (mode === 'costcenter') return [{ name: 'Cost centers', widths: [14, 32, 8, 8, 18], header: ['Cost Center', 'Description', 'POs', 'Lines', 'Pending bill value'], rows: costCenterGroups.map((g) => [g.costCenter, g.costCenterText, g.poCount, g.lineCount, g.totalOpenValue]) }, lineItemSheet(filteredRows)];
    if (mode === 'country') return [{ name: 'Countries', widths: [10, 8, 8, 18], header: ['Country', 'POs', 'Lines', 'Pending bill value'], rows: countryGroups.map((g) => [g.country, g.poCount, g.lineCount, g.totalOpenValue]) }, lineItemSheet(filteredRows)];
    const groups = mode === 'costcenter-po' ? posForSelectedCostCenter : mode === 'country-po' ? posForSelectedCountry : mode === 'report-po' ? poGroups : poGroups;
    return [poSheet(groups), lineItemSheet(mode === 'choose' ? filteredRows : groups.flatMap((g) => g.lines))];
  };
  const excelBase = mode === 'choose' ? 'Provision_Details_All' : `Provision_Details_${heroTitle}`;

  const emptyText = (text: string) => <p className="py-10 text-center text-sm text-inkSoft">{text}</p>;

  return (
    <div className="flex flex-col gap-3 pb-10">
      <ProvisionHero
        eyebrow="Admin · Cross-org"
        title={heroTitle}
        subtitle={heroSubtitle}
        left={mode !== 'choose' ? <HeroIconButton icon={ArrowLeft} label="Back" onPress={onBack} /> : undefined}
        right={!loading && !error ? <ExcelButton fileBase={excelBase} sheets={detailSheets} label={mode === 'choose' ? 'Excel (all)' : 'Excel'} disabled={filteredRows.length === 0} /> : undefined}
      />

      {loading ? (
        <LoadingBlock label="Loading provision data…" />
      ) : error ? (
        <Banner type="error">{error}</Banner>
      ) : (
        <>
          {mode !== 'choose' && (
            <ProvisionFilterBar rows={monthRows} value={filters} onChange={setFilters} resultCount={filteredRows.length} />
          )}

          {mode === 'choose' && (
            <div className="flex flex-wrap gap-3">
              <OptionCard
                icon={Building2}
                title="Cost Center Wise Details"
                subtitle="Browse by cost center first, then drill into each PO under it."
                accent={PT_COLORS.rust}
                onPress={() => setMode('costcenter')}
              />
              <OptionCard
                icon={Globe}
                title="Country Wise Details"
                subtitle="Browse by country (Land1) first, then drill into each PO under it."
                accent={PT_COLORS.amber}
                onPress={() => setMode('country')}
              />
              <OptionCard
                icon={List}
                title="Detailed Report"
                subtitle="Every open PO at once, with cost center & GL shown up front."
                accent={PT_COLORS.green}
                onPress={() => setMode('report-po')}
              />
            </div>
          )}

          {mode === 'costcenter' && (
            costCenterGroups.length === 0 ? (
              emptyText('No open provisions found.')
            ) : (
              <TileTable
                titleLabel="Cost Center"
                subtitleLabel="Description"
                items={costCenterGroups.map((g, i) => ({
                  key: g.costCenter,
                  title: g.costCenter,
                  subtitle: g.costCenterText,
                  accent: tileRankAccent(i, costCenterGroups.length),
                  kpis: [
                    { label: 'POs', value: String(g.poCount) },
                    { label: 'Lines', value: String(g.lineCount) },
                    { label: 'Pending Value', value: formatValue(g.totalOpenValue) },
                  ],
                  onPress: () => { setSelectedCostCenter(g.costCenter); setMode('costcenter-po'); },
                }))}
              />
            )
          )}

          {mode === 'costcenter-po' && (
            posForSelectedCostCenter.length === 0 ? (
              emptyText('No open POs under this cost center.')
            ) : (
              <TileTable titleLabel="PO Number" subtitleLabel="GL · Cost Center" items={poTiles(posForSelectedCostCenter)} />
            )
          )}

          {mode === 'country' && (
            countryGroups.length === 0 ? (
              emptyText('No open provisions found.')
            ) : (
              <TileTable
                titleLabel="Country"
                items={countryGroups.map((g, i) => ({
                  key: g.country,
                  title: g.country,
                  accent: tileRankAccent(i, countryGroups.length),
                  kpis: [
                    { label: 'POs', value: String(g.poCount) },
                    { label: 'Lines', value: String(g.lineCount) },
                    { label: 'Pending Value', value: formatValue(g.totalOpenValue) },
                  ],
                  onPress: () => { setSelectedCountry(g.country); setMode('country-po'); },
                }))}
              />
            )
          )}

          {mode === 'country-po' && (
            posForSelectedCountry.length === 0 ? (
              emptyText('No open POs under this country.')
            ) : (
              <TileTable titleLabel="PO Number" subtitleLabel="GL · Cost Center" items={poTiles(posForSelectedCountry)} />
            )
          )}

          {mode === 'report-po' && (
            poGroups.length === 0 ? (
              emptyText('No open POs found.')
            ) : (
              <TileTable titleLabel="PO Number" subtitleLabel="GL · Cost Center" items={poTiles(poGroups)} />
            )
          )}
        </>
      )}

      {selectedPo && <PoDetailModal group={selectedPo} onClose={() => setSelectedPo(null)} />}
    </div>
  );
}
