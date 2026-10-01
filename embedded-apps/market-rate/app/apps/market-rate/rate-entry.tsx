import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { useMarketRateAuth } from '../../../src/context/MarketRateAuthContext';
import { fetchRateEntryRecords, saveMarketRates, type MarketRateRow, type RateEntryRecord } from '../../../src/lib/marketRateApi';
import { CompactSelect } from '../../../src/components/CompactFilters';
import { FreightTermsSelect } from '../../../src/components/FreightTermsSelect';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => ({ value: String(CURRENT_YEAR - i), label: String(CURRENT_YEAR - i) }));
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_OPTIONS = MONTH_LABELS.map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }));
const CURRENT_MONTH = String(new Date().getMonth() + 1).padStart(2, '0');

type StatusFilter = 'all' | 'pending' | 'submitted';
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Not submitted' },
  { value: 'submitted', label: 'Submitted' },
];

/** One editable line: a vendor × material pair for the selected month. */
interface EntryRow {
  key: string;
  vendorCode: string;
  vendorName: string;
  materialCode: string;
  materialDesc: string;
  /** Whether the vendor themselves submitted a rate for this material in the selected month. */
  submitted: boolean;
  rate: string;
  date: string;
  /** 'EXW' / 'FOR' — mandatory on every row that gets saved. '' until chosen. */
  freightTerms: string;
  /** Values as loaded — a row is only saved when rate, date or freight terms differ from these. */
  originalRate: string;
  originalDate: string;
  originalFreightTerms: string;
  /** Carried through unchanged into the save payload (see toSaveRow). */
  materialType: string;
  ratePer: string;
  marketName: string;
  igst: string;
  sgst: string;
  cgst: string;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

const isValidIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());

/** Builds one row per vendor × material pair seen anywhere in the year's ZmarketRateSet data (the
 * same pairs Submission History lists), filled from that pair's record for the selected month when
 * there is one — preferring the vendor's own submitted record (SubDone 'X'), latest date first.
 * Pairs with nothing submitted for the month start with a blank rate and a default date. */
function buildRows(records: RateEntryRecord[], year: string, month: string): EntryRow[] {
  const byPair = new Map<string, RateEntryRecord[]>();
  for (const r of records) {
    if (!r.vendorCode && !r.materialCode) continue;
    const k = `${r.vendorCode}|${r.materialCode}`;
    const list = byPair.get(k);
    if (list) list.push(r);
    else byPair.set(k, [r]);
  }

  const latestFirst = (a: RateEntryRecord, b: RateEntryRecord) =>
    (b.validFrom || b.submittedOn).localeCompare(a.validFrom || a.submittedOn);
  const defaultDate = year === String(CURRENT_YEAR) && month === CURRENT_MONTH ? todayIso() : `${year}-${month}-01`;

  const rows: EntryRow[] = [];
  for (const [k, list] of byPair) {
    const inMonth = list.filter((r) => r.zmonth === month).sort(latestFirst);
    const monthRecord = inMonth.find((r) => r.submitted) ?? inMonth[0];
    // Reference fields (type/UOM/market/GST) from this month's record, else the pair's latest one.
    const ref = monthRecord ?? [...list].sort(latestFirst)[0];
    const submitted = !!monthRecord?.submitted;
    const rate = monthRecord?.rate && Number(monthRecord.rate) !== 0 ? monthRecord.rate : '';
    const date = monthRecord?.validFrom || defaultDate;
    const freightTerms = monthRecord?.freightTerms || '';
    rows.push({
      key: k,
      vendorCode: ref.vendorCode,
      vendorName: list.find((r) => r.vendorName)?.vendorName ?? '',
      materialCode: ref.materialCode,
      materialDesc: list.find((r) => r.materialDesc)?.materialDesc ?? '',
      submitted,
      rate,
      date,
      freightTerms,
      originalRate: rate,
      originalDate: date,
      originalFreightTerms: freightTerms,
      materialType: ref.materialType,
      ratePer: ref.ratePer,
      marketName: ref.marketName,
      igst: ref.igst,
      sgst: ref.sgst,
      cgst: ref.cgst,
    });
  }
  return rows.sort(
    (a, b) => a.vendorName.localeCompare(b.vendorName) || a.vendorCode.localeCompare(b.vendorCode) || a.materialDesc.localeCompare(b.materialDesc)
  );
}

const isRateInvalid = (r: EntryRow) => !r.rate.trim() || Number.isNaN(Number(r.rate)) || Number(r.rate) < 0;

const isDirty = (r: EntryRow) => r.rate !== r.originalRate || r.date !== r.originalDate || r.freightTerms !== r.originalFreightTerms;

function toSaveRow(r: EntryRow): MarketRateRow {
  return {
    key: r.key,
    vendorCode: r.vendorCode,
    materialCode: r.materialCode,
    materialDesc: r.materialDesc,
    materialType: r.materialType,
    marketName: r.marketName,
    marketRate: r.rate.trim(),
    ratePer: r.ratePer,
    igst: r.igst,
    sgst: r.sgst,
    cgst: r.cgst,
    validFrom: r.date,
    freightTerms: r.freightTerms,
  };
}

function DateInput({ value, onChange, label, invalid }: { value: string; onChange: (v: string) => void; label: string; invalid: boolean }) {
  if (Platform.OS === 'web') {
    return (
      // @ts-expect-error — raw DOM element, valid under react-native-web
      <input
        type="date"
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        aria-label={label}
        style={{
          width: COLS.date - 16,
          height: 36,
          padding: '6px 10px',
          borderRadius: 8,
          border: `1px solid ${invalid ? colors.red : colors.border}`,
          backgroundColor: colors.white,
          color: colors.ink,
          fontSize: 13,
          boxSizing: 'border-box',
        }}
      />
    );
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      accessibilityLabel={label}
      style={[styles.input, { width: COLS.date - 16 }, invalid && styles.inputInvalid]}
    />
  );
}

const COLS = { vendor: 100, vendorName: 200, material: 110, desc: 240, status: 130, rate: 130, uom: 70, freight: 130, date: 170 };
const TABLE_WIDTH = Object.values(COLS).reduce((a, b) => a + b, 0);

export default function RateEntryScreen() {
  const { email, role, roleLoading } = useMarketRateAuth();
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<RateEntryRecord[]>([]);
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showInvalid, setShowInvalid] = useState(false);

  const load = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    setLoadError(null);
    try {
      setRecords(await fetchRateEntryRecords(year, email));
    } catch (err) {
      setRecords([]);
      setLoadError(err instanceof Error ? err.message : 'Could not load rates.');
    } finally {
      setLoading(false);
    }
  }, [email, year]);

  useEffect(() => {
    if (!roleLoading && role === 'Admin') load();
  }, [load, roleLoading, role]);

  // Rebuilt from the loaded records whenever the month changes (or after a reload) — this also
  // discards unsaved edits, so switching month warns first (see changeMonth).
  useEffect(() => {
    setRows(buildRows(records, year, month));
    setShowInvalid(false);
  }, [records, year, month]);

  const dirtyRows = useMemo(() => rows.filter(isDirty), [rows]);
  const invalidKeys = useMemo(() => {
    const bad = new Set<string>();
    for (const r of dirtyRows) {
      if (isRateInvalid(r) || !isValidIsoDate(r.date) || !r.freightTerms) bad.add(r.key);
    }
    return bad;
  }, [dirtyRows]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === 'pending' && r.submitted) return false;
      if (statusFilter === 'submitted' && !r.submitted) return false;
      if (!q) return true;
      return [r.vendorCode, r.vendorName, r.materialCode, r.materialDesc].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, statusFilter, query]);

  const counts = useMemo(() => {
    const vendors = new Set(rows.map((r) => r.vendorCode)).size;
    const pending = rows.filter((r) => !r.submitted).length;
    return { vendors, pairs: rows.length, pending };
  }, [rows]);

  const confirmDiscard = () =>
    dirtyRows.length === 0 ||
    typeof window === 'undefined' ||
    window.confirm(`You have ${dirtyRows.length} unsaved change${dirtyRows.length === 1 ? '' : 's'}. Discard them?`);

  const changeMonth = (m: string) => {
    if (m === month || !confirmDiscard()) return;
    setBanner(null);
    setMonth(m);
  };
  const changeYear = (y: string) => {
    if (y === year || !confirmDiscard()) return;
    setBanner(null);
    setYear(y);
  };

  const updateRow = (key: string, field: 'rate' | 'date' | 'freightTerms', value: string) => {
    setBanner(null);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const discard = () => {
    setBanner(null);
    setShowInvalid(false);
    setRows((prev) => prev.map((r) => ({ ...r, rate: r.originalRate, date: r.originalDate, freightTerms: r.originalFreightTerms })));
  };

  const onSave = async () => {
    if (dirtyRows.length === 0) return;
    if (invalidKeys.size > 0) {
      setShowInvalid(true);
      setBanner({ type: 'error', message: `Fix ${invalidKeys.size} row${invalidKeys.size === 1 ? '' : 's'} — the fields outlined in red. Each changed row needs a numeric rate, a valid date and Freight Terms (EXW or FOR).` });
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      await saveMarketRates(dirtyRows.map(toSaveRow), email || '');
      const n = dirtyRows.length;
      await load();
      setBanner({ type: 'success', message: `Saved ${n} rate${n === 1 ? '' : 's'} to SAP.` });
    } catch (err) {
      setBanner({ type: 'error', message: err instanceof Error ? err.message : 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (roleLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  // Defense in depth — the side pane already hides this link from non-Admins, but the route is
  // still reachable by a typed URL.
  if (role !== 'Admin') {
    return (
      <View style={styles.centerWrap}>
        <Ionicons name="lock-closed-outline" size={22} color={colors.inkSoft} />
        <Text style={styles.mutedText}>Market Rate Entry is only available to Admins.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* One compact bar: title + counts on the left, Year / Month / search / status on the
            right, wrapping only on narrow screens. */}
        <View style={styles.headerBar}>
          <View style={styles.titleWrap}>
            <Text style={styles.heading}>Market Rate Entry</Text>
            <Text style={styles.subheading} numberOfLines={1}>
              {!loading && !loadError
                ? `${counts.vendors} vendors · ${counts.pairs} materials · ${counts.pending} not submitted for ${MONTH_LABELS[Number(month) - 1]} ${year} — only changed rows are saved`
                : 'Fill in or correct vendor rates — only changed rows are saved to SAP'}
            </Text>
          </View>
          <View style={styles.filters}>
            <CompactSelect label="Year" value={year} options={YEAR_OPTIONS} onChange={changeYear} />
            <CompactSelect label="Month" value={month} options={MONTH_OPTIONS} onChange={changeMonth} />
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={14} color={colors.inkSoft} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Vendor or material" placeholderTextColor={colors.inkSoft} style={styles.searchInput} accessibilityLabel="Search vendor or material" />
            </View>
            <View style={styles.segment}>
              {STATUS_FILTERS.map((st) => (
                <Pressable key={st.value} onPress={() => setStatusFilter(st.value)} style={[styles.segmentBtn, statusFilter === st.value && styles.chipActive]} accessibilityRole="button">
                  <Text style={[styles.chipText, statusFilter === st.value && styles.chipTextActive]}>{st.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {banner && (
          <View style={[styles.banner, banner.type === 'success' ? styles.bannerSuccess : styles.bannerError]}>
            <Ionicons name={banner.type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={16} color={banner.type === 'success' ? colors.green : colors.red} />
            <Text style={[styles.bannerText, { color: banner.type === 'success' ? colors.green : colors.red }]}>{banner.message}</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color={colors.rust} />
            <Text style={styles.mutedText}>Loading vendor rates…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.centerBlock}>
            <Ionicons name="cloud-offline-outline" size={22} color={colors.red} />
            <Text style={styles.mutedText}>{loadError}</Text>
            <Pressable style={styles.secondaryBtn} onPress={load}>
              <Text style={styles.secondaryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.centerBlock}>
            <Ionicons name="file-tray-outline" size={22} color={colors.inkSoft} />
            <Text style={styles.mutedText}>No vendor materials found for {year}.</Text>
          </View>
        ) : (
          <ScrollView horizontal style={styles.tableScroll}>
            <View style={{ width: TABLE_WIDTH }}>
              <View style={[styles.tr, styles.thead]}>
                <Text style={[styles.th, { width: COLS.vendor }]}>Vendor</Text>
                <Text style={[styles.th, { width: COLS.vendorName }]}>Vendor Name</Text>
                <Text style={[styles.th, { width: COLS.material }]}>Material</Text>
                <Text style={[styles.th, { width: COLS.desc }]}>Material Description</Text>
                <Text style={[styles.th, { width: COLS.status }]}>Status</Text>
                <Text style={[styles.th, { width: COLS.rate }]}>Rate</Text>
                <Text style={[styles.th, { width: COLS.uom }]}>UOM</Text>
                <Text style={[styles.th, { width: COLS.freight }]}>Freight Terms *</Text>
                <Text style={[styles.th, { width: COLS.date }]}>Date</Text>
              </View>
              {visibleRows.length === 0 ? (
                <Text style={[styles.mutedText, { padding: 16 }]}>No rows match these filters.</Text>
              ) : (
                visibleRows.map((r) => {
                  const dirty = isDirty(r);
                  const invalid = showInvalid && invalidKeys.has(r.key);
                  return (
                    <View key={r.key} style={[styles.tr, dirty && styles.trDirty]}>
                      <Text style={[styles.td, styles.mono, { width: COLS.vendor }]}>{r.vendorCode}</Text>
                      <Text style={[styles.td, { width: COLS.vendorName }]} numberOfLines={2}>{r.vendorName || '—'}</Text>
                      <Text style={[styles.td, styles.mono, { width: COLS.material }]}>{r.materialCode}</Text>
                      <Text style={[styles.td, { width: COLS.desc }]} numberOfLines={2}>{r.materialDesc || '—'}</Text>
                      <View style={[styles.tdBox, { width: COLS.status }]}>
                        {dirty ? (
                          <View style={[styles.pill, styles.pillEdited]}><Text style={[styles.pillText, { color: colors.rust }]}>Edited</Text></View>
                        ) : r.submitted ? (
                          <View style={[styles.pill, styles.pillOk]}><Text style={[styles.pillText, { color: colors.green }]}>Submitted</Text></View>
                        ) : (
                          <View style={[styles.pill, styles.pillPending]}><Text style={[styles.pillText, { color: '#B45309' }]}>Not submitted</Text></View>
                        )}
                      </View>
                      <View style={[styles.tdBox, { width: COLS.rate }]}>
                        <TextInput
                          value={r.rate}
                          onChangeText={(v) => updateRow(r.key, 'rate', v)}
                          placeholder="Enter rate"
                          placeholderTextColor={colors.inkSoft}
                          keyboardType="decimal-pad"
                          accessibilityLabel={`Rate for ${r.materialDesc || r.materialCode}, vendor ${r.vendorName || r.vendorCode}`}
                          style={[styles.input, { width: COLS.rate - 16 }, invalid && isRateInvalid(r) && styles.inputInvalid]}
                        />
                      </View>
                      <Text style={[styles.td, { width: COLS.uom }]}>{r.ratePer || '—'}</Text>
                      <View style={[styles.tdBox, { width: COLS.freight }]}>
                        <FreightTermsSelect
                          value={r.freightTerms}
                          onChange={(v) => updateRow(r.key, 'freightTerms', v)}
                          label={`Freight terms for ${r.materialDesc || r.materialCode}, vendor ${r.vendorName || r.vendorCode}`}
                          width={COLS.freight - 16}
                          invalid={invalid && !r.freightTerms}
                        />
                      </View>
                      <View style={[styles.tdBox, { width: COLS.date }]}>
                        <DateInput value={r.date} onChange={(v) => updateRow(r.key, 'date', v)} label={`Date for ${r.materialDesc || r.materialCode}`} invalid={invalid && !isValidIsoDate(r.date)} />
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}
      </ScrollView>

      {dirtyRows.length > 0 && (
        <View style={styles.saveBar}>
          <Text style={styles.saveBarText}>
            {dirtyRows.length} unsaved change{dirtyRows.length === 1 ? '' : 's'}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable style={styles.secondaryBtn} onPress={discard} disabled={saving}>
            <Text style={styles.secondaryBtnText}>Discard</Text>
          </Pressable>
          <Pressable style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="save-outline" size={15} color={colors.white} />}
            <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.appBg },
  content: { padding: 18, paddingBottom: 100 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.appBg },
  centerBlock: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 48 },
  mutedText: { fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  headerBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12, position: 'relative', zIndex: 20 },
  titleWrap: { flexShrink: 1, minWidth: 220 },
  heading: { fontSize: 16, fontWeight: '800', color: colors.ink },
  subheading: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, width: 200, paddingHorizontal: 10, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  searchInput: { flex: 1, fontSize: 12.5, color: colors.ink, height: 32 },
  segment: { flexDirection: 'row', gap: 2, padding: 2, height: 34, alignItems: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  segmentBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: radii.sm },
  chipActive: { backgroundColor: colors.rust, borderColor: colors.rust },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  chipTextActive: { color: colors.white },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radii.md, borderWidth: 1, marginBottom: 12 },
  bannerSuccess: { backgroundColor: '#1F7A4D12', borderColor: '#1F7A4D33' },
  bannerError: { backgroundColor: '#C0392B12', borderColor: '#C0392B33' },
  bannerText: { fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  tableScroll: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: 52 },
  thead: { backgroundColor: '#F6F4FD', minHeight: 40 },
  trDirty: { backgroundColor: '#4F3FD60A' },
  th: { fontSize: 11, fontWeight: '800', color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4, paddingHorizontal: 8 },
  td: { fontSize: 12.5, color: colors.ink, paddingHorizontal: 8 },
  tdBox: { paddingHorizontal: 8, justifyContent: 'center' },
  mono: { fontFamily: Platform.select({ web: 'IBM Plex Mono, ui-monospace, monospace', default: undefined }), fontSize: 12 },
  pill: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: radii.pill },
  pillOk: { backgroundColor: '#1F7A4D17' },
  pillPending: { backgroundColor: '#F59E0B1F' },
  pillEdited: { backgroundColor: '#4F3FD614' },
  pillText: { fontSize: 11, fontWeight: '800' },
  input: { height: 36, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, fontSize: 13, color: colors.ink },
  inputInvalid: { borderColor: colors.red, backgroundColor: '#C0392B0A' },
  saveBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 12, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border,
  },
  saveBarText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 16, borderRadius: radii.md, backgroundColor: colors.rust },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },
  secondaryBtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: colors.ink },
});
