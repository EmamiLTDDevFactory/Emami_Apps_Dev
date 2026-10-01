import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { fetchSubmissionRecords, type SubmissionRecord } from '../../../src/lib/marketRateApi';
import { useMarketRateAuth } from '../../../src/context/MarketRateAuthContext';
import { ALL_MONTH_VALUES, CompactSelect, MONTHS, MonthMultiSelect, formatMonthSelection } from '../../../src/components/CompactFilters';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR - i));

const CURRENT_MONTH_VALUE = String(new Date().getMonth() + 1).padStart(2, '0');

const STATUS_OPTIONS: { value: 'all' | 'submitted' | 'pending'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'submitted', label: 'Submitted (every selected month)' },
  { value: 'pending', label: 'Pending (any selected month)' },
];

interface MatrixRow {
  key: string;
  email: string;
  vendorCode: string;
  vendorName: string;
  materialCode: string;
  materialDesc: string;
  /** One flag per MONTHS entry — true only when that material's SubDone was 'X' for that month. */
  monthStatus: boolean[];
}

interface VendorSummary {
  vendorCode: string;
  vendorName: string;
  materials: number;
  submitted: number;
  pending: number;
  compliancePct: number;
}

/** Builds one row per vendor/material combo straight off ZmarketRateSet's own rows — that entity
 * already carries the vendor (Lifnr/Name1) and material (Matnr/Maktx) alongside Zyear/Zmonth/
 * SubDone, so there's no second entity to cross-reference; a material with no row for a given
 * month simply stays unsubmitted (false) for that month. */
function buildMatrixRows(submissions: SubmissionRecord[]): MatrixRow[] {
  const byKey = new Map<string, MatrixRow>();
  for (const s of submissions) {
    const key = `${s.email.toLowerCase()}|${s.vendorCode}|${s.materialCode}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        email: s.email,
        vendorCode: s.vendorCode,
        vendorName: s.vendorName,
        materialCode: s.materialCode,
        materialDesc: s.materialDesc,
        monthStatus: MONTHS.map(() => false),
      };
      byKey.set(key, row);
    }
    const monthIdx = MONTHS.findIndex((m) => m.value === s.zmonth);
    if (monthIdx >= 0 && s.submitted) row.monthStatus[monthIdx] = true;
  }
  return Array.from(byKey.values());
}

/** Per-vendor counts over every selected month — one vendor/material/month cell is one expected
 * submission, so `submitted + pending` is materials × months. */
function buildVendorSummary(rows: MatrixRow[], monthIdxs: number[]): VendorSummary[] {
  const byVendor = new Map<string, VendorSummary>();
  for (const r of rows) {
    const key = r.vendorCode || '(unassigned)';
    const cur = byVendor.get(key) ?? {
      vendorCode: r.vendorCode || '—',
      vendorName: r.vendorName,
      materials: 0,
      submitted: 0,
      pending: 0,
      compliancePct: 0,
    };
    cur.materials += 1;
    for (const i of monthIdxs) {
      if (r.monthStatus[i]) cur.submitted += 1;
      else cur.pending += 1;
    }
    byVendor.set(key, cur);
  }
  return Array.from(byVendor.values())
    .map((v) => ({ ...v, compliancePct: v.submitted + v.pending ? (v.submitted / (v.submitted + v.pending)) * 100 : 0 }))
    .sort((a, b) => a.compliancePct - b.compliancePct);
}

function matchesQuery(row: MatrixRow, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    row.vendorCode.toLowerCase().includes(q) ||
    row.vendorName.toLowerCase().includes(q) ||
    row.materialCode.toLowerCase().includes(q) ||
    row.materialDesc.toLowerCase().includes(q) ||
    row.email.toLowerCase().includes(q)
  );
}

interface VendorMaterialRate {
  vendorCode: string;
  vendorName: string;
  materialCode: string;
  materialDesc: string;
  rate: number;
  ratePer: string;
  zmonth: string;
  submittedOn: string;
}

/** One quote per vendor+material — the LATEST submitted month within the loaded year, since a
 * vendor can resubmit a fresh rate every month and comparing "current" pricing means each pair's
 * most recent quote, not its whole history. Rows with no submission, or a rate that doesn't
 * parse, are skipped — there's nothing to compare for those. */
function buildLatestVendorMaterialRates(submissions: SubmissionRecord[]): VendorMaterialRate[] {
  const byKey = new Map<string, VendorMaterialRate>();
  for (const s of submissions) {
    if (!s.submitted) continue;
    const rate = parseFloat(s.rate);
    if (Number.isNaN(rate)) continue;
    const key = `${s.vendorCode}|${s.materialCode}`;
    const existing = byKey.get(key);
    if (!existing || s.zmonth > existing.zmonth) {
      byKey.set(key, {
        vendorCode: s.vendorCode,
        vendorName: s.vendorName,
        materialCode: s.materialCode,
        materialDesc: s.materialDesc,
        rate,
        ratePer: s.ratePer,
        zmonth: s.zmonth,
        submittedOn: s.submittedOn,
      });
    }
  }
  return Array.from(byKey.values());
}

interface VendorRateGroup {
  vendorCode: string;
  vendorName: string;
  /** Every material this vendor has a latest quote for, ascending by material code — e.g. a
   * vendor quoting four materials shows all four nested here, each with its own rate and date. */
  materials: VendorMaterialRate[];
}

/** Groups the latest quotes by vendor — one entry per vendor, every material they quoted nested
 * underneath — ordered by materials-quoted count (vendors with the most materials first, since
 * those are the ones with the most to review) then vendor code. */
function groupRatesByVendor(rates: VendorMaterialRate[]): VendorRateGroup[] {
  const byVendor = new Map<string, VendorMaterialRate[]>();
  for (const r of rates) {
    const list = byVendor.get(r.vendorCode) ?? [];
    list.push(r);
    byVendor.set(r.vendorCode, list);
  }
  return Array.from(byVendor.entries())
    .map(([vendorCode, materials]) => ({
      vendorCode,
      vendorName: materials[0].vendorName,
      materials: [...materials].sort((a, b) => a.materialCode.localeCompare(b.materialCode)),
    }))
    .sort((a, b) => b.materials.length - a.materials.length || a.vendorCode.localeCompare(b.vendorCode));
}

function matchesVendorQuery(group: VendorRateGroup, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  if (group.vendorCode.toLowerCase().includes(q) || group.vendorName.toLowerCase().includes(q)) return true;
  return group.materials.some((m) => m.materialCode.toLowerCase().includes(q) || m.materialDesc.toLowerCase().includes(q));
}

/** 'YYYY-MM-DD' submittedOn when present, else falls back to the MONTHS label for zmonth — every
 * quote has at least one of the two, so this never returns an empty string for a real quote. */
function formatQuoteDate(rate: VendorMaterialRate): string {
  if (rate.submittedOn) {
    const d = new Date(`${rate.submittedOn}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return MONTHS.find((m) => m.value === rate.zmonth)?.label ?? '—';
}

/** The matrix only keeps a submitted/not boolean per month (see buildMatrixRows) — this looks the
 * original SubmissionRecord back up from the full year's records already sitting in state, so
 * tapping a green tick can show the Rate without a second API call. */
function findSubmissionRecord(submissions: SubmissionRecord[], row: MatrixRow, monthValue: string): SubmissionRecord | undefined {
  return submissions.find(
    (s) =>
      s.email.toLowerCase() === row.email.toLowerCase() &&
      s.vendorCode === row.vendorCode &&
      s.materialCode === row.materialCode &&
      s.zmonth === monthValue
  );
}

function KpiCard({ icon, label, value, accent }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; accent?: string }) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIconBox, accent ? { backgroundColor: `${accent}14` } : null]}>
        <Ionicons name={icon} size={15} color={accent || colors.rust} />
      </View>
      <View style={styles.flex1}>
        <Text style={styles.kpiValue}>{value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
    </View>
  );
}

/** Submitted-vs-pending ring for the selected month — a CSS conic-gradient on web (this app has no
 * SVG dependency installed), a stacked progress bar fallback on native. */
function ComplianceRing({ pct }: { pct: number }) {
  const rounded = Math.max(0, Math.min(100, Math.round(pct)));

  if (Platform.OS === 'web') {
    return (
      // @ts-expect-error — raw DOM element, valid under react-native-web
      <div
        style={{
          width: 128,
          height: 128,
          borderRadius: '50%',
          background: `conic-gradient(${colors.rust} ${rounded}%, ${colors.border} 0)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {/* @ts-expect-error — raw DOM element */}
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: '50%',
            backgroundColor: colors.white,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* @ts-expect-error — raw DOM element */}
          <span style={{ fontSize: 22, fontWeight: 800, color: colors.ink }}>{rounded}%</span>
          {/* @ts-expect-error — raw DOM element */}
          <span style={{ fontSize: 10, color: colors.inkSoft }}>submitted</span>
        </div>
      </div>
    );
  }

  return (
    <View style={styles.ringFallback}>
      <Text style={styles.ringFallbackPct}>{rounded}%</Text>
      <View style={styles.ringFallbackTrack}>
        <View style={[styles.ringFallbackFill, { width: `${rounded}%` }]} />
      </View>
      <Text style={styles.ringFallbackLabel}>submitted</Text>
    </View>
  );
}

function TrendChart({ data }: { data: { label: string; pct: number; highlighted: boolean }[] }) {
  return (
    <View style={styles.trendWrap}>
      {data.map((d) => (
        <View key={d.label} style={styles.trendCol}>
          <Text style={styles.trendPctLabel}>{Math.round(d.pct)}</Text>
          <View style={styles.trendTrack}>
            <View
              style={[
                styles.trendFill,
                { height: `${Math.max(2, d.pct)}%` },
                d.highlighted && styles.trendFillActive,
              ]}
            />
          </View>
          <Text style={[styles.trendMonthLabel, d.highlighted && styles.trendMonthLabelActive]}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Opens on tapping a submitted (green tick) month cell — shows the Rate actually submitted for
 * that vendor/material/month, looked up from the already-fetched SubmissionRecord (see
 * findSubmissionRecord above), not a fresh API call. */
function RateDetailModal({
  row,
  monthLabel,
  year,
  record,
  onClose,
}: {
  row: MatrixRow;
  monthLabel: string;
  year: string;
  record: SubmissionRecord | undefined;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.rateModalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={styles.rateModalCard}>
          <View style={styles.rateModalHeaderRow}>
            <View style={styles.flex1}>
              <Text style={styles.rateModalTitle}>{row.materialDesc || row.materialCode}</Text>
              <Text style={styles.rateModalSubtitle}>
                {row.vendorCode}{row.vendorName ? ` · ${row.vendorName}` : ''} — {monthLabel} {year}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          {record ? (
            <View style={styles.rateModalGrid}>
              <View style={styles.rateModalItem}>
                <Text style={styles.rateModalLabel}>Rate</Text>
                <Text style={[styles.rateModalValue, styles.rateModalValueStrong]}>
                  {record.rate}{record.ratePer ? ` / ${record.ratePer}` : ''}
                </Text>
              </View>
              <View style={styles.rateModalItem}>
                <Text style={styles.rateModalLabel}>Material Code</Text>
                <Text style={styles.rateModalValue}>{row.materialCode || '—'}</Text>
              </View>
              <View style={styles.rateModalItem}>
                <Text style={styles.rateModalLabel}>Submitted By</Text>
                <Text style={styles.rateModalValue}>{record.email || '—'}</Text>
              </View>
              <View style={styles.rateModalItem}>
                <Text style={styles.rateModalLabel}>Submitted On</Text>
                <Text style={styles.rateModalValue}>{record.submittedOn || '—'}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.rateModalMissing}>
              This material shows as submitted for {monthLabel}, but the matching rate record couldn't be found.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Admin-only summary + detail dashboard, inside the Submission History screen's "Vendor Rate
 * Comparison" tab — for each material, ranks every vendor's latest quote cheapest-first so an
 * Admin can see at a glance who to buy from. Built entirely off the SubmissionRecord[] the screen
 * already loaded (see buildLatestVendorMaterialRates/groupRatesByMaterial above), no extra call. */
function VendorRateComparisonSection({
  groups,
  totalVendors,
  materialsQuoted,
  avgMaterialsPerVendor,
  topVendor,
  query,
  setQuery,
  year,
  monthsLabel,
}: {
  groups: VendorRateGroup[];
  totalVendors: number;
  materialsQuoted: number;
  avgMaterialsPerVendor: number;
  topVendor: { vendorCode: string; vendorName: string; count: number } | null;
  query: string;
  setQuery: (v: string) => void;
  year: string;
  /** The Month filter's selection, e.g. "All months" or "Jan, Feb" — see formatMonthSelection. */
  monthsLabel: string;
}) {
  const period = monthsLabel === 'All months' ? year : `${monthsLabel} ${year}`;
  if (totalVendors === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="pricetags-outline" size={22} color={colors.inkSoft} />
        <Text style={styles.emptyText}>No submitted rates found for {period} to compare.</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.kpiGrid}>
        <KpiCard icon="people-outline" label="Vendors quoting" value={String(totalVendors)} />
        <KpiCard icon="cube-outline" label="Materials quoted" value={String(materialsQuoted)} accent={colors.rust} />
        <KpiCard icon="stats-chart-outline" label="Avg materials / vendor" value={avgMaterialsPerVendor.toFixed(1)} />
        {topVendor && (
          <KpiCard
            icon="trophy-outline"
            label="Most materials quoted"
            value={`${topVendor.vendorName || topVendor.vendorCode} (${topVendor.count})`}
            accent={colors.green}
          />
        )}
      </View>

      <View style={styles.matrixHeaderRow}>
        <View style={styles.flex1}>
          <Text style={styles.cardTitle}>Rate comparison by vendor — {period}</Text>
          <Text style={styles.cardSubtitle}>
            {groups.length} vendor{groups.length === 1 ? '' : 's'}. Every material each vendor last quoted in {period}, with rate and date.
          </Text>
        </View>
        <View style={styles.matrixSearchWrap}>
          <Ionicons name="search-outline" size={14} color={colors.inkSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search vendor or material"
            placeholderTextColor={colors.inkSoft}
            style={styles.matrixSearchInput}
            accessibilityLabel="Search vendor or material"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {groups.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={22} color={colors.inkSoft} />
          <Text style={styles.emptyText}>No vendors match this search.</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {groups.map((group) => (
            <View key={group.vendorCode} style={styles.card}>
              <View style={styles.matrixHeaderRow}>
                <View style={styles.flex1}>
                  <Text style={styles.cardTitle}>{group.vendorName || group.vendorCode}</Text>
                  <Text style={styles.cardSubtitle}>
                    {group.vendorCode} · {group.materials.length} material{group.materials.length === 1 ? '' : 's'} quoted
                  </Text>
                </View>
                <View style={styles.spreadBadge}>
                  <Ionicons name="cube-outline" size={12} color={colors.rust} />
                  <Text style={styles.spreadBadgeText}>{group.materials.length}</Text>
                </View>
              </View>

              <View style={{ gap: 4 }}>
                {group.materials.map((m) => (
                  <View key={`${group.vendorCode}-${m.materialCode}`} style={styles.quoteRow}>
                    <View style={styles.flex1}>
                      <Text style={styles.quoteVendorText} numberOfLines={1}>{m.materialDesc || m.materialCode}</Text>
                      <Text style={styles.quoteVendorCodeText}>{m.materialCode} · {formatQuoteDate(m)}</Text>
                    </View>
                    <Text style={styles.quoteRateText}>
                      {m.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {m.ratePer ? ` / ${m.ratePer}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

export default function SubmissionHistoryScreen() {
  const { email, role, roleLoading } = useMarketRateAuth();
  const [activeView, setActiveView] = useState<'compliance' | 'rates'>('compliance');
  const [year, setYear] = useState(String(CURRENT_YEAR));
  // Compliance view's months (any number, at least one) and Vendor Rate Comparison's own, separate
  // selection — rate comparison starts on every month so it keeps showing each pair's latest quote
  // of the year until the Admin narrows it.
  const [months, setMonths] = useState<string[]>([CURRENT_MONTH_VALUE]);
  const [rateMonths, setRateMonths] = useState<string[]>(ALL_MONTH_VALUES);
  const [status, setStatus] = useState<'all' | 'submitted' | 'pending'>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [rateDetail, setRateDetail] = useState<{ row: MatrixRow; monthValue: string; monthLabel: string } | null>(null);

  const load = async (y: string, adminEmail: string) => {
    setLoading(true);
    setError(null);
    try {
      // Only ZmarketRateSet, passing Mail (the signed-in Admin's own login email) — no
      // ZMarketSuppDataSet lookup involved.
      const s = await fetchSubmissionRecords(y, adminEmail);
      setSubmissions(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load submission history.');
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!roleLoading && role === 'Admin' && email) load(year, email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, role, email, year]);

  const allRows = useMemo(() => buildMatrixRows(submissions), [submissions]);
  // Indexes into MONTHS for the selected months, in calendar order — every count below covers all
  // of them, and the detail table shows a column for only these months.
  const monthIdxs = useMemo(() => MONTHS.map((m, i) => (months.includes(m.value) ? i : -1)).filter((i) => i >= 0), [months]);
  const singleMonth = monthIdxs.length === 1;
  const monthsLabel = formatMonthSelection(months);
  const periodText = singleMonth ? 'this month' : 'selected months';

  // `filteredRows` is the one place status is applied, and every derived value below reads from
  // it, so the whole page moves together. With several months picked, "Submitted" means submitted
  // in every one of them and "Pending" means missing at least one.
  const searchRows = useMemo(() => allRows.filter((r) => matchesQuery(r, query)), [allRows, query]);
  const filteredRows = useMemo(
    () =>
      searchRows.filter((r) => {
        if (status === 'all') return true;
        const allSubmitted = monthIdxs.every((i) => r.monthStatus[i]);
        return status === 'submitted' ? allSubmitted : !allSubmitted;
      }),
    [searchRows, status, monthIdxs]
  );

  // One vendor/material/month cell is one expected submission.
  const totalExpected = filteredRows.length * monthIdxs.length;
  const totalSubmitted = filteredRows.reduce((sum, r) => sum + monthIdxs.filter((i) => r.monthStatus[i]).length, 0);
  const totalPending = totalExpected - totalSubmitted;
  const compliancePct = totalExpected ? (totalSubmitted / totalExpected) * 100 : 0;

  const vendorSummary = useMemo(() => buildVendorSummary(filteredRows, monthIdxs), [filteredRows, monthIdxs]);
  const vendorsTracked = vendorSummary.length;
  const materialsTracked = new Set(filteredRows.map((r) => r.materialCode)).size;
  const fullyCompliantVendors = vendorSummary.filter((v) => v.materials > 0 && v.pending === 0).length;

  const trendData = useMemo(
    () =>
      MONTHS.map((m, i) => {
        const total = filteredRows.length;
        const submitted = filteredRows.filter((r) => r.monthStatus[i]).length;
        return { label: m.label, pct: total ? (submitted / total) * 100 : 0, highlighted: monthIdxs.includes(i) };
      }),
    [filteredRows, monthIdxs]
  );
  // Year to date through the latest selected month.
  const lastMonthIdx = monthIdxs[monthIdxs.length - 1] ?? 0;
  const ytdAvgCompliancePct = trendData.slice(0, lastMonthIdx + 1).reduce((sum, d) => sum + d.pct, 0) / (lastMonthIdx + 1);
  const matrixTableWidth = MATRIX_FIXED_WIDTH + COL.month * monthIdxs.length + COL.total;

  // Vendor Rate Comparison — its own Month filter (rateMonths) plus Year and the search box; the
  // compliance Month/Status filters don't apply. Each pair's latest quote within the selected
  // months, built straight off the same `submissions` already in state, no second API call.
  const latestRates = useMemo(
    () => buildLatestVendorMaterialRates(submissions.filter((s) => rateMonths.includes(s.zmonth))),
    [submissions, rateMonths]
  );
  const rateGroups = useMemo(() => groupRatesByVendor(latestRates), [latestRates]);
  const filteredRateGroups = useMemo(() => rateGroups.filter((g) => matchesVendorQuery(g, query)), [rateGroups, query]);
  const materialsQuoted = latestRates.length;
  const avgMaterialsPerVendor = rateGroups.length ? materialsQuoted / rateGroups.length : 0;
  const topVendor = useMemo(() => {
    const sorted = [...rateGroups].sort((a, b) => b.materials.length - a.materials.length);
    return sorted[0] ? { vendorCode: sorted[0].vendorCode, vendorName: sorted[0].vendorName, count: sorted[0].materials.length } : null;
  }, [rateGroups]);

  if (roleLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  // Defense in depth — the nav bar already hides this link from non-Admins, but the route is
  // still reachable by a typed URL.
  if (role !== 'Admin') {
    return (
      <View style={styles.centerWrap}>
        <Ionicons name="lock-closed-outline" size={22} color={colors.inkSoft} />
        <Text style={styles.deniedText}>Submission History is only available to Admins.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* One compact bar: title, the Compliance / Vendor Rate Comparison switch and that view's
          filters, wrapping onto a second line only on narrow screens. zIndex keeps the month
          picker's popover above the content below it. */}
      <View style={styles.headerBar}>
        <View style={styles.titleWrap}>
          <View style={styles.sectionIconBox}>
            <Ionicons name="bar-chart-outline" size={14} color={colors.rust} />
          </View>
          <Text style={styles.sectionTitle}>Submission History</Text>
        </View>

        <View style={styles.tabRow}>
          {([
            { key: 'compliance', label: 'Compliance' },
            { key: 'rates', label: 'Vendor Rate Comparison' },
          ] as const).map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tabBtn, activeView === tab.key && styles.tabBtnActive]}
              onPress={() => { setActiveView(tab.key); setQuery(''); }}
              accessibilityRole="button"
            >
              <Text style={[styles.tabBtnText, activeView === tab.key && styles.tabBtnTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.filterBar}>
          <CompactSelect label="Year" value={year} onChange={setYear} options={YEAR_OPTIONS.map((y) => ({ value: y, label: y }))} />
          {activeView === 'compliance' ? (
            <>
              <MonthMultiSelect selected={months} onChange={setMonths} />
              <CompactSelect label="Status" value={status} onChange={(v) => setStatus(v as typeof status)} options={STATUS_OPTIONS} />
            </>
          ) : (
            <MonthMultiSelect selected={rateMonths} onChange={setRateMonths} />
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.rust} />
          <Text style={styles.loadingText}>Loading submission history…</Text>
        </View>
      ) : error ? (
        <View style={[styles.statusBanner, styles.statusError]}>
          <Ionicons name="alert-circle" size={16} color={colors.red} />
          <Text style={[styles.statusText, { color: colors.red }]}>{error}</Text>
        </View>
      ) : activeView === 'rates' ? (
        <VendorRateComparisonSection
          groups={filteredRateGroups}
          totalVendors={rateGroups.length}
          materialsQuoted={materialsQuoted}
          avgMaterialsPerVendor={avgMaterialsPerVendor}
          topVendor={topVendor}
          query={query}
          setQuery={setQuery}
          year={year}
          monthsLabel={formatMonthSelection(rateMonths)}
        />
      ) : filteredRows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="file-tray-outline" size={22} color={colors.inkSoft} />
          <Text style={styles.emptyText}>No submission records found for this search.</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.matrixHeaderRow}>
              <View style={styles.flex1}>
                <Text style={styles.cardTitle}>Vendor · material · month detail — {monthsLabel} {year}</Text>
                <Text style={styles.cardSubtitle}>
                  {filteredRows.length} row{filteredRows.length === 1 ? '' : 's'} match the current filters. Tap a green tick to see that month's submitted rate.
                </Text>
              </View>
              <View style={styles.matrixSearchWrap}>
                <Ionicons name="search-outline" size={14} color={colors.inkSoft} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search this table — vendor, material or email"
                  placeholderTextColor={colors.inkSoft}
                  style={styles.matrixSearchInput}
                  accessibilityLabel="Search vendor, material or email in this table"
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
                  </Pressable>
                ) : null}
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
              <View style={{ width: matrixTableWidth }}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.headerCell, { width: COL.vendorCode }]}>Vendor Code</Text>
                  <Text style={[styles.headerCell, { width: COL.vendorName }]}>Vendor Name</Text>
                  <Text style={[styles.headerCell, { width: COL.materialCode }]}>Material Code</Text>
                  <Text style={[styles.headerCell, { width: COL.materialDesc }]}>Material Description</Text>
                  <Text style={[styles.headerCell, { width: COL.email }]}>Submitted By</Text>
                  {monthIdxs.map((i) => (
                    <Text key={MONTHS[i].value} style={[styles.headerCell, styles.centerCell, { width: COL.month }]}>{MONTHS[i].label}</Text>
                  ))}
                  <Text style={[styles.headerCell, styles.centerCell, { width: COL.total }]}>Total</Text>
                </View>
                {/* Body scrolls on its own, bounded to matrixBody's maxHeight, so the header row
                    above stays put (visually "fixed") instead of scrolling away with the rows. */}
                <ScrollView style={styles.matrixBody} nestedScrollEnabled showsVerticalScrollIndicator>
                  {filteredRows.map((row) => {
                    const submittedCount = monthIdxs.filter((i) => row.monthStatus[i]).length;
                    return (
                      <View key={row.key} style={styles.tableRow}>
                        <Text style={[styles.readonlyCell, { width: COL.vendorCode }]} numberOfLines={1}>{row.vendorCode}</Text>
                        <Text style={[styles.readonlyCell, { width: COL.vendorName }]} numberOfLines={1}>{row.vendorName}</Text>
                        <Text style={[styles.readonlyCell, { width: COL.materialCode }]} numberOfLines={1}>{row.materialCode}</Text>
                        <Text style={[styles.readonlyCell, { width: COL.materialDesc }]} numberOfLines={1}>{row.materialDesc}</Text>
                        <Text style={[styles.readonlyCell, { width: COL.email }]} numberOfLines={1}>{row.email}</Text>
                        {monthIdxs.map((i) =>
                          row.monthStatus[i] ? (
                            <Pressable
                              key={MONTHS[i].value}
                              style={[styles.monthCell, { width: COL.month }]}
                              onPress={() => setRateDetail({ row, monthValue: MONTHS[i].value, monthLabel: MONTHS[i].label })}
                              accessibilityRole="button"
                              accessibilityLabel={`View ${MONTHS[i].label} rate for ${row.materialDesc || row.materialCode}`}
                              hitSlop={4}
                            >
                              <Ionicons name="checkmark-circle" size={15} color={colors.green} />
                            </Pressable>
                          ) : (
                            <View key={MONTHS[i].value} style={[styles.monthCell, { width: COL.month }]}>
                              <Ionicons name="close-circle-outline" size={15} color={colors.red} />
                            </View>
                          )
                        )}
                        <Text style={[styles.readonlyCell, styles.centerCell, { width: COL.total, fontWeight: '700', color: colors.ink }]}>
                          {submittedCount}/{monthIdxs.length}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </ScrollView>
          </View>

          <View style={styles.kpiGrid}>
            <KpiCard icon="people-outline" label="Vendors tracked" value={String(vendorsTracked)} />
            <KpiCard icon="cube-outline" label="Materials tracked" value={String(materialsTracked)} />
            <KpiCard icon="list-outline" label={`Expected ${periodText}`} value={String(totalExpected)} />
            <KpiCard icon="checkmark-done-outline" label={`Submitted ${periodText}`} value={String(totalSubmitted)} accent={colors.green} />
            <KpiCard icon="time-outline" label={`Pending ${periodText}`} value={String(totalPending)} accent={colors.red} />
            <KpiCard icon="speedometer-outline" label={`Compliance ${periodText}`} value={`${Math.round(compliancePct)}%`} />
            <KpiCard icon="ribbon-outline" label="Fully compliant vendors" value={`${fullyCompliantVendors}/${vendorsTracked}`} accent={colors.green} />
            <KpiCard icon="trending-up-outline" label="YTD avg compliance" value={`${Math.round(ytdAvgCompliancePct)}%`} />
          </View>

          <View style={styles.chartsRow}>
            <View style={[styles.card, styles.chartCard]}>
              <Text style={styles.cardTitle}>{monthsLabel} {year} compliance</Text>
              <View style={styles.ringRow}>
                <ComplianceRing pct={compliancePct} />
                <View style={styles.ringLegend}>
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: colors.rust }]} />
                    <Text style={styles.legendText}>Submitted — {totalSubmitted}</Text>
                  </View>
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
                    <Text style={styles.legendText}>Pending — {totalPending}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.card, styles.chartCard, styles.flex1]}>
              <Text style={styles.cardTitle}>Compliance trend — {year}</Text>
              <TrendChart data={trendData} />
            </View>
          </View>
        </>
      )}

      {rateDetail && (
        <RateDetailModal
          row={rateDetail.row}
          monthLabel={rateDetail.monthLabel}
          year={year}
          record={findSubmissionRecord(submissions, rateDetail.row, rateDetail.monthValue)}
          onClose={() => setRateDetail(null)}
        />
      )}
    </ScrollView>
  );
}

const COL = {
  vendorCode: 90,
  vendorName: 150,
  materialCode: 100,
  materialDesc: 190,
  email: 170,
  month: 38,
  total: 60,
};
// Width of the fixed columns; the table adds one COL.month per selected month plus the Total column.
const MATRIX_FIXED_WIDTH = COL.vendorCode + COL.vendorName + COL.materialCode + COL.materialDesc + COL.email;

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 60,
    gap: 16,
  },
  flex1: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  deniedText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  headerBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    position: 'relative',
    zIndex: 20,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 4,
  },
  sectionIconBox: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tabBtnActive: {
    backgroundColor: colors.rust,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  tabBtnTextActive: {
    color: colors.white,
  },
  spreadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 9,
    backgroundColor: `${colors.rust}14`,
  },
  spreadBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.rust,
  },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.md,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: colors.appBg,
  },
  quoteVendorText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
  },
  quoteVendorCodeText: {
    fontSize: 10.5,
    color: colors.inkSoft,
    marginTop: 1,
  },
  quoteRateText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 190,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 14,
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  kpiLabel: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
  },
  chartsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 18,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(31,27,51,0.06)' },
      default: {
        shadowColor: colors.plum,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  chartCard: {
    minWidth: 280,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.ink,
  },
  cardSubtitle: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
    marginBottom: 12,
  },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 14,
  },
  ringLegend: {
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.ink,
  },
  ringFallback: {
    alignItems: 'center',
    gap: 8,
    width: 128,
  },
  ringFallbackPct: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  ringFallbackTrack: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  ringFallbackFill: {
    height: '100%',
    backgroundColor: colors.rust,
    borderRadius: 5,
  },
  ringFallbackLabel: {
    fontSize: 10.5,
    color: colors.inkSoft,
  },
  trendWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
    height: 150,
    marginTop: 10,
  },
  trendCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  trendPctLabel: {
    fontSize: 9.5,
    color: colors.inkSoft,
    marginBottom: 4,
  },
  trendTrack: {
    width: '70%',
    height: 90,
    borderRadius: 6,
    backgroundColor: colors.appBg,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  trendFill: {
    width: '100%',
    backgroundColor: colors.border,
    borderRadius: 6,
  },
  trendFillActive: {
    backgroundColor: colors.rust,
  },
  trendMonthLabel: {
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 6,
  },
  trendMonthLabelActive: {
    color: colors.rust,
    fontWeight: '700',
  },
  tableScroll: {
    flexGrow: 0,
    marginTop: 8,
  },
  matrixHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  matrixSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    height: 38,
    backgroundColor: colors.white,
    minWidth: 220,
    flexShrink: 0,
  },
  matrixSearchInput: {
    flex: 1,
    fontSize: 12.5,
    color: colors.ink,
  },
  // Bounded height so the header row above it never scrolls out of view — the body scrolls on its
  // own within this box instead of the whole table scrolling with the page.
  matrixBody: {
    maxHeight: 480,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.rust,
    borderRadius: radii.md,
  },
  headerCell: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    color: colors.white,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  centerCell: {
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  readonlyCell: {
    fontSize: 12,
    color: colors.ink,
    paddingVertical: 11,
    paddingHorizontal: 8,
  },
  monthCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.lg,
    padding: 12,
  },
  statusError: {
    backgroundColor: `${colors.red}14`,
  },
  statusText: {
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  rateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(31,27,51,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  rateModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: 20,
    gap: 14,
  },
  rateModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  rateModalTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.ink,
  },
  rateModalSubtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 3,
    lineHeight: 17,
  },
  rateModalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  rateModalItem: {
    minWidth: 140,
    gap: 2,
  },
  rateModalLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  rateModalValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  rateModalValueStrong: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.rust,
  },
  rateModalMissing: {
    fontSize: 12.5,
    color: colors.inkSoft,
    lineHeight: 18,
  },
});
