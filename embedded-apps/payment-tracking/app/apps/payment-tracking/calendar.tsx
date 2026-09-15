import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../../src/lib/paymentTrackingApi';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';
import { useMonthYear, fiscalYearLabel } from '../../../src/context/MonthYearContext';
import { ProvisionHero, ProvisionDetailModal } from '../../../src/components/ProvisionUI';

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
        <Text style={styles.deniedText}>Calendar is only available to Admins.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <ProvisionHero
        eyebrow="Admin · Cross-org"
        title="Calendar"
        subtitle="Vendor · PO · month detail for every open service PO — tap a green tick to see that line's full detail."
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.rust} />
          <Text style={styles.loadingText}>Loading provision data…</Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.flex1}>
              <Text style={styles.cardTitle}>Vendor · PO · month detail — {fiscalYearLabel(Number(year))}</Text>
              <Text style={styles.cardSubtitle}>
                {filteredRows.length} row{filteredRows.length === 1 ? '' : 's'} match the current search. A green tick marks the month a line's Service Entry Sheet was created and accepted.
              </Text>
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={14} color={colors.inkSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search this table — vendor, PO, service text or creator"
              placeholderTextColor={colors.inkSoft}
              style={styles.searchInput}
              accessibilityLabel="Search vendor, PO, service text or creator in this table"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
              </Pressable>
            ) : null}
          </View>

          {filteredRows.length === 0 ? (
            <Text style={styles.emptyText}>No open POs match this search.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
              <View style={{ width: MATRIX_TABLE_WIDTH }}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.headerCell, { width: COL.vendorCode }]}>Vendor Code</Text>
                  <Text style={[styles.headerCell, { width: COL.vendorName }]}>Vendor Name</Text>
                  <Text style={[styles.headerCell, { width: COL.poNumber }]}>PO Number</Text>
                  <Text style={[styles.headerCell, { width: COL.serviceText }]}>Service Text</Text>
                  <Text style={[styles.headerCell, { width: COL.poCreator }]}>PO Creator</Text>
                  {FISCAL_MONTHS.map((m) => (
                    <Text key={m.value} style={[styles.headerCell, styles.centerCell, { width: COL.month }]}>{m.label}</Text>
                  ))}
                  <Text style={[styles.headerCell, styles.centerCell, { width: COL.total }]}>Total</Text>
                </View>
                {/* Body scrolls on its own, bounded to tableBody's maxHeight, so the header row above
                    stays put (visually "fixed") instead of scrolling away with the rows. */}
                <ScrollView style={styles.tableBody} nestedScrollEnabled showsVerticalScrollIndicator>
                  {filteredRows.map((r) => {
                    const acceptedCount = r.monthStatus.filter(Boolean).length;
                    return (
                      <View key={r.key} style={styles.tableRow}>
                        <Text style={[styles.readonlyCell, { width: COL.vendorCode }]} numberOfLines={1}>{r.vendorCode || '—'}</Text>
                        <Text style={[styles.readonlyCell, { width: COL.vendorName }]} numberOfLines={1}>{r.vendorName || '—'}</Text>
                        <Text style={[styles.readonlyCell, { width: COL.poNumber }]} numberOfLines={1}>{r.poNumber || '—'}</Text>
                        <Text style={[styles.readonlyCell, { width: COL.serviceText }]} numberOfLines={1}>{r.serviceText || '—'}</Text>
                        <Text style={[styles.readonlyCell, { width: COL.poCreator }]} numberOfLines={1}>{r.poCreator || '—'}</Text>
                        {r.monthStatus.map((accepted, i) =>
                          accepted ? (
                            <Pressable
                              key={FISCAL_MONTHS[i].value}
                              style={[styles.monthCell, { width: COL.month }]}
                              onPress={() => setActiveRow(r)}
                              accessibilityRole="button"
                              accessibilityLabel={`View ${FISCAL_MONTHS[i].label} detail for PO ${r.poNumber}`}
                              hitSlop={4}
                            >
                              <Ionicons name="checkmark-circle" size={15} color={colors.green} />
                            </Pressable>
                          ) : (
                            <View key={FISCAL_MONTHS[i].value} style={[styles.monthCell, { width: COL.month }]}>
                              <Ionicons name="close-circle-outline" size={15} color={colors.red} />
                            </View>
                          )
                        )}
                        <Text style={[styles.readonlyCell, styles.centerCell, { width: COL.total, fontWeight: '700', color: colors.ink }]}>
                          {acceptedCount}/12
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {activeRow && (
        <ProvisionDetailModal
          title={`PO ${activeRow.poNumber} — ${activeRow.vendorName || activeRow.vendorCode}`}
          subtitle={activeRow.serviceText}
          rows={[activeRow.row]}
          onClose={() => setActiveRow(null)}
        />
      )}
    </ScrollView>
  );
}

const COL = {
  vendorCode: 90,
  vendorName: 150,
  poNumber: 110,
  serviceText: 220,
  poCreator: 120,
  month: 40,
  total: 60,
};
const MATRIX_TABLE_WIDTH =
  COL.vendorCode + COL.vendorName + COL.poNumber + COL.serviceText + COL.poCreator + COL.month * FISCAL_MONTHS.length + COL.total;

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
  errorText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.red,
  },
  emptyText: {
    fontSize: 13,
    color: colors.inkSoft,
    paddingVertical: 30,
    textAlign: 'center',
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    lineHeight: 17,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    height: 38,
    backgroundColor: colors.white,
    marginTop: 12,
    marginBottom: 4,
    maxWidth: 420,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: colors.ink,
  },
  tableScroll: {
    flexGrow: 0,
    marginTop: 8,
  },
  // Bounded height so the header row above it never scrolls out of view — the body scrolls on its
  // own within this box instead of the whole table scrolling with the page.
  tableBody: {
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
});
