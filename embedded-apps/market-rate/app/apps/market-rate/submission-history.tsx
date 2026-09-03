import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import {
  fetchAllVendorMaterialAssignments,
  fetchSubmissionRecords,
  type SubmissionRecord,
  type VendorMaterialAssignment,
} from '../../../src/lib/marketRateApi';
import { useMarketRateAuth } from '../../../src/context/MarketRateAuthContext';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR - i));

const MONTHS = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' },
  { value: '05', label: 'May' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
];
const CURRENT_MONTH_VALUE = String(new Date().getMonth() + 1).padStart(2, '0');

const STATUS_OPTIONS: { value: 'all' | 'submitted' | 'pending'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'submitted', label: 'Submitted (selected month)' },
  { value: 'pending', label: 'Pending (selected month)' },
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

/** Cross-references the "expected" universe (every vendor-material this app knows an email is
 * responsible for, from Master Data) against the "actual" side (SubDone per material/month) to
 * build one row per vendor-material combo with a submitted/not-submitted flag for every month.
 * Matched on email + material code — assignments carry the vendor that owns that combo, actual
 * submissions carry SubDone per instruction ('X' = submitted, blank = not). */
function buildMatrixRows(assignments: VendorMaterialAssignment[], submissions: SubmissionRecord[]): MatrixRow[] {
  const submittedMonthsByKey = new Map<string, Set<string>>();
  for (const s of submissions) {
    if (!s.submitted) continue;
    const key = `${s.email.toLowerCase()}|${s.materialCode}`;
    if (!submittedMonthsByKey.has(key)) submittedMonthsByKey.set(key, new Set());
    submittedMonthsByKey.get(key)!.add(s.zmonth);
  }

  const seen = new Set<string>();
  const rows: MatrixRow[] = [];
  for (const a of assignments) {
    const dedupeKey = `${a.email.toLowerCase()}|${a.vendorCode}|${a.materialCode}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const submittedMonths = submittedMonthsByKey.get(`${a.email.toLowerCase()}|${a.materialCode}`) ?? new Set<string>();
    rows.push({
      key: dedupeKey,
      email: a.email,
      vendorCode: a.vendorCode,
      vendorName: a.vendorName,
      materialCode: a.materialCode,
      materialDesc: a.materialDesc,
      monthStatus: MONTHS.map((m) => submittedMonths.has(m.value)),
    });
  }
  return rows;
}

function buildVendorSummary(rows: MatrixRow[], monthIdx: number): VendorSummary[] {
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
    if (r.monthStatus[monthIdx]) cur.submitted += 1;
    else cur.pending += 1;
    byVendor.set(key, cur);
  }
  return Array.from(byVendor.values())
    .map((v) => ({ ...v, compliancePct: v.materials ? (v.submitted / v.materials) * 100 : 0 }))
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

/** Web/native select — same raw-<select>-on-web, popover-on-native split used by Dashboard's
 * YearSelect, generalized here since this screen needs several (Year, Month, Status). */
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <View style={styles.filterField}>
      <Text style={styles.filterLabel}>{label}</Text>
      {Platform.OS === 'web' ? (
        // @ts-expect-error — raw DOM element, valid under react-native-web
        <select
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          aria-label={label}
          style={{
            height: 38,
            padding: '6px 10px',
            borderRadius: 10,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.white,
            color: colors.ink,
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <View>
          <Pressable style={styles.filterBtn} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={label}>
            <Text style={styles.filterBtnText} numberOfLines={1}>{activeLabel}</Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.rust} />
          </Pressable>
          {open && (
            <View style={styles.filterOptions}>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  style={styles.filterOption}
                  onPress={() => { onChange(o.value); setOpen(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={o.label}
                >
                  <Text style={[styles.filterOptionText, o.value === value && styles.filterOptionTextActive]}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
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
      <Text style={styles.ringFallbackLabel}>submitted this month</Text>
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

function PendingVendorsChart({ data }: { data: { vendorCode: string; vendorName: string; pending: number }[] }) {
  if (data.length === 0) {
    return <Text style={styles.chartEmptyText}>No pending vendors for the selected month — everyone's caught up.</Text>;
  }
  const max = Math.max(1, ...data.map((d) => d.pending));
  return (
    <View style={{ gap: 12 }}>
      {data.map((d) => (
        <View key={d.vendorCode} style={styles.hbarRow}>
          <Text style={styles.hbarLabel} numberOfLines={1}>
            {d.vendorCode}{d.vendorName ? ` · ${d.vendorName}` : ''}
          </Text>
          <View style={styles.hbarTrack}>
            <View style={[styles.hbarFill, { width: `${(d.pending / max) * 100}%` }]} />
          </View>
          <Text style={styles.hbarCount}>{d.pending}</Text>
        </View>
      ))}
    </View>
  );
}

export default function SubmissionHistoryScreen() {
  const { role, roleLoading } = useMarketRateAuth();
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [month, setMonth] = useState(CURRENT_MONTH_VALUE);
  const [status, setStatus] = useState<'all' | 'submitted' | 'pending'>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<VendorMaterialAssignment[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);

  const load = async (y: string) => {
    setLoading(true);
    setError(null);
    try {
      const [a, s] = await Promise.all([fetchAllVendorMaterialAssignments(), fetchSubmissionRecords(y)]);
      setAssignments(a);
      setSubmissions(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load submission history.');
      setAssignments([]);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!roleLoading && role === 'Admin') load(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, role, year]);

  const allRows = useMemo(() => buildMatrixRows(assignments, submissions), [assignments, submissions]);
  const monthIdx = MONTHS.findIndex((m) => m.value === month);

  const searchRows = useMemo(() => allRows.filter((r) => matchesQuery(r, query)), [allRows, query]);
  const displayedRows = useMemo(
    () =>
      searchRows.filter((r) => {
        if (status === 'all') return true;
        const isSubmitted = r.monthStatus[monthIdx];
        return status === 'submitted' ? isSubmitted : !isSubmitted;
      }),
    [searchRows, status, monthIdx]
  );

  const totalExpected = searchRows.length;
  const totalSubmitted = searchRows.filter((r) => r.monthStatus[monthIdx]).length;
  const totalPending = totalExpected - totalSubmitted;
  const compliancePct = totalExpected ? (totalSubmitted / totalExpected) * 100 : 0;

  const vendorSummary = useMemo(() => buildVendorSummary(searchRows, monthIdx), [searchRows, monthIdx]);
  const vendorsTracked = vendorSummary.length;
  const materialsTracked = new Set(searchRows.map((r) => r.materialCode)).size;
  const fullyCompliantVendors = vendorSummary.filter((v) => v.materials > 0 && v.pending === 0).length;

  const trendData = useMemo(
    () =>
      MONTHS.map((m, i) => {
        const total = searchRows.length;
        const submitted = searchRows.filter((r) => r.monthStatus[i]).length;
        return { label: m.label, pct: total ? (submitted / total) * 100 : 0, highlighted: i === monthIdx };
      }),
    [searchRows, monthIdx]
  );
  const ytdAvgCompliancePct =
    trendData.slice(0, monthIdx + 1).reduce((sum, d) => sum + d.pct, 0) / Math.max(1, monthIdx + 1);

  const pendingVendors = vendorSummary
    .filter((v) => v.pending > 0)
    .sort((a, b) => b.pending - a.pending)
    .slice(0, 6)
    .map((v) => ({ vendorCode: v.vendorCode, vendorName: v.vendorName, pending: v.pending }));

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
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionIconBox}>
          <Ionicons name="bar-chart-outline" size={14} color={colors.rust} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.sectionTitle}>Submission History</Text>
          <Text style={styles.sectionSubtitle}>Vendor · material submission compliance, month by month</Text>
        </View>
      </View>

      <View style={styles.filterBar}>
        <FilterSelect label="Year" value={year} onChange={setYear} options={YEAR_OPTIONS.map((y) => ({ value: y, label: y }))} />
        <FilterSelect label="Month" value={month} onChange={setMonth} options={MONTHS} />
        <FilterSelect label="Status" value={status} onChange={(v) => setStatus(v as typeof status)} options={STATUS_OPTIONS} />
        <View style={[styles.filterField, styles.searchField]}>
          <Text style={styles.filterLabel}>Search</Text>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search-outline" size={14} color={colors.inkSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Vendor, material or email"
              placeholderTextColor={colors.inkSoft}
              style={styles.searchInput}
              accessibilityLabel="Search vendor, material or email"
            />
          </View>
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
      ) : totalExpected === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="file-tray-outline" size={22} color={colors.inkSoft} />
          <Text style={styles.emptyText}>No vendor-material assignments found for this search.</Text>
        </View>
      ) : (
        <>
          <View style={styles.kpiGrid}>
            <KpiCard icon="people-outline" label="Vendors tracked" value={String(vendorsTracked)} />
            <KpiCard icon="cube-outline" label="Materials tracked" value={String(materialsTracked)} />
            <KpiCard icon="list-outline" label="Expected this month" value={String(totalExpected)} />
            <KpiCard icon="checkmark-done-outline" label="Submitted this month" value={String(totalSubmitted)} accent={colors.green} />
            <KpiCard icon="time-outline" label="Pending this month" value={String(totalPending)} accent={colors.red} />
            <KpiCard icon="speedometer-outline" label="Compliance this month" value={`${Math.round(compliancePct)}%`} />
            <KpiCard icon="ribbon-outline" label="Fully compliant vendors" value={`${fullyCompliantVendors}/${vendorsTracked}`} accent={colors.green} />
            <KpiCard icon="trending-up-outline" label="YTD avg compliance" value={`${Math.round(ytdAvgCompliancePct)}%`} />
          </View>

          <View style={styles.chartsRow}>
            <View style={[styles.card, styles.chartCard]}>
              <Text style={styles.cardTitle}>{MONTHS[monthIdx].label} {year} compliance</Text>
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

          <View style={[styles.card, styles.chartCard]}>
            <Text style={styles.cardTitle}>Vendors with pending submissions — {MONTHS[monthIdx].label} {year}</Text>
            <PendingVendorsChart data={pendingVendors} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Vendor-wise summary — {MONTHS[monthIdx].label} {year}</Text>
            <Text style={styles.cardSubtitle}>Worst compliance first, so the vendors most behind surface at the top.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
              <View style={{ width: VENDOR_TABLE_WIDTH }}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.headerCell, { width: COL.vendorCode }]}>Vendor Code</Text>
                  <Text style={[styles.headerCell, { width: COL.vendorName }]}>Vendor Name</Text>
                  <Text style={[styles.headerCell, { width: COL.count }]}>Materials</Text>
                  <Text style={[styles.headerCell, { width: COL.count }]}>Submitted</Text>
                  <Text style={[styles.headerCell, { width: COL.count }]}>Pending</Text>
                  <Text style={[styles.headerCell, { width: COL.compliance }]}>Compliance</Text>
                </View>
                {vendorSummary.map((v) => (
                  <View key={v.vendorCode} style={styles.tableRow}>
                    <Text style={[styles.readonlyCell, { width: COL.vendorCode }]} numberOfLines={1}>{v.vendorCode}</Text>
                    <Text style={[styles.readonlyCell, { width: COL.vendorName }]} numberOfLines={1}>{v.vendorName}</Text>
                    <Text style={[styles.readonlyCell, styles.centerCell, { width: COL.count }]}>{v.materials}</Text>
                    <Text style={[styles.readonlyCell, styles.centerCell, { width: COL.count, color: colors.green }]}>{v.submitted}</Text>
                    <Text style={[styles.readonlyCell, styles.centerCell, { width: COL.count, color: v.pending > 0 ? colors.red : colors.inkSoft }]}>{v.pending}</Text>
                    <View style={{ width: COL.compliance, paddingHorizontal: 10, paddingVertical: 12 }}>
                      <View style={styles.complianceBarRow}>
                        <View style={styles.complianceBarTrack}>
                          <View style={[styles.complianceBarFill, { width: `${Math.round(v.compliancePct)}%` }]} />
                        </View>
                        <Text style={styles.complianceBarText}>{Math.round(v.compliancePct)}%</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Vendor · material · month detail — {year}</Text>
            <Text style={styles.cardSubtitle}>
              {displayedRows.length} of {searchRows.length} row{searchRows.length === 1 ? '' : 's'} shown
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
              <View style={{ width: MATRIX_TABLE_WIDTH }}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.headerCell, { width: COL.vendorCode }]}>Vendor Code</Text>
                  <Text style={[styles.headerCell, { width: COL.vendorName }]}>Vendor Name</Text>
                  <Text style={[styles.headerCell, { width: COL.materialCode }]}>Material Code</Text>
                  <Text style={[styles.headerCell, { width: COL.materialDesc }]}>Material Description</Text>
                  <Text style={[styles.headerCell, { width: COL.email }]}>Submitted By</Text>
                  {MONTHS.map((m) => (
                    <Text key={m.value} style={[styles.headerCell, styles.centerCell, { width: COL.month }]}>{m.label}</Text>
                  ))}
                  <Text style={[styles.headerCell, styles.centerCell, { width: COL.total }]}>Total</Text>
                </View>
                {displayedRows.map((row) => {
                  const submittedCount = row.monthStatus.filter(Boolean).length;
                  return (
                    <View key={row.key} style={styles.tableRow}>
                      <Text style={[styles.readonlyCell, { width: COL.vendorCode }]} numberOfLines={1}>{row.vendorCode}</Text>
                      <Text style={[styles.readonlyCell, { width: COL.vendorName }]} numberOfLines={1}>{row.vendorName}</Text>
                      <Text style={[styles.readonlyCell, { width: COL.materialCode }]} numberOfLines={1}>{row.materialCode}</Text>
                      <Text style={[styles.readonlyCell, { width: COL.materialDesc }]} numberOfLines={1}>{row.materialDesc}</Text>
                      <Text style={[styles.readonlyCell, { width: COL.email }]} numberOfLines={1}>{row.email}</Text>
                      {row.monthStatus.map((submitted, i) => (
                        <View key={MONTHS[i].value} style={[styles.monthCell, { width: COL.month }]}>
                          <Ionicons
                            name={submitted ? 'checkmark-circle' : 'close-circle-outline'}
                            size={15}
                            color={submitted ? colors.green : colors.red}
                          />
                        </View>
                      ))}
                      <Text style={[styles.readonlyCell, styles.centerCell, { width: COL.total, fontWeight: '700', color: colors.ink }]}>
                        {submittedCount}/12
                      </Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </>
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
  count: 84,
  compliance: 180,
};
const MATRIX_TABLE_WIDTH =
  COL.vendorCode + COL.vendorName + COL.materialCode + COL.materialDesc + COL.email + COL.month * MONTHS.length + COL.total;
const VENDOR_TABLE_WIDTH = COL.vendorCode + COL.vendorName + COL.count * 3 + COL.compliance;

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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
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
  sectionSubtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 1,
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  filterField: {
    gap: 5,
  },
  searchField: {
    flexGrow: 1,
    minWidth: 220,
  },
  filterLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
  },
  filterBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
  },
  filterOptions: {
    position: 'absolute',
    top: 42,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    overflow: 'hidden',
    zIndex: 10,
  },
  filterOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  filterOptionText: {
    fontSize: 12.5,
    color: colors.ink,
  },
  filterOptionTextActive: {
    fontWeight: '700',
    color: colors.rust,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    height: 38,
    backgroundColor: colors.white,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: colors.ink,
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
  chartEmptyText: {
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 8,
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
  hbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hbarLabel: {
    width: 160,
    fontSize: 12,
    color: colors.ink,
  },
  hbarTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.appBg,
    overflow: 'hidden',
  },
  hbarFill: {
    height: '100%',
    backgroundColor: colors.red,
    borderRadius: 5,
  },
  hbarCount: {
    width: 24,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  tableScroll: {
    flexGrow: 0,
    marginTop: 8,
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
  complianceBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  complianceBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.appBg,
    overflow: 'hidden',
  },
  complianceBarFill: {
    height: '100%',
    backgroundColor: colors.rust,
    borderRadius: 4,
  },
  complianceBarText: {
    width: 34,
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.ink,
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
});
