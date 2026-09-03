import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { fetchMarketRates, type MarketRateRow } from '../../../src/lib/marketRateApi';
import { useMarketRateAuth } from '../../../src/context/MarketRateAuthContext';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR - i));

type DisplayField = 'materialCode' | 'materialDesc' | 'marketRate' | 'ratePer';

const DISPLAY_COLUMNS: { field: DisplayField; label: string; width: number }[] = [
  { field: 'materialCode', label: 'Material Code', width: 120 },
  { field: 'materialDesc', label: 'Material Description', width: 220 },
  { field: 'marketRate', label: 'Market Rate', width: 100 },
  { field: 'ratePer', label: 'Rate UOM', width: 90 },
];

const DATE_COL_WIDTH = 140;

const TABLE_WIDTH = DISPLAY_COLUMNS.reduce((sum, c) => sum + c.width, 0) + DATE_COL_WIDTH;

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08-31" -> "31 Aug 2026" — the raw yyyy-mm-dd the API uses isn't a friendly read. */
function formatDateFriendly(iso: string): string {
  const [y, m, d] = iso.split('-');
  const monthIdx = Number(m) - 1;
  if (!y || !d || monthIdx < 0 || monthIdx > 11) return iso;
  return `${Number(d)} ${MONTH_ABBR[monthIdx]} ${y}`;
}

/** Year picker — a raw <select> on web (simplest, most robust option for a plain string list; no
 * picker dependency is installed in this app), a small inline popover on native. */
function YearSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);

  if (Platform.OS === 'web') {
    return (
      // @ts-expect-error — raw DOM element, valid under react-native-web
      <select
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        aria-label="Select year"
        style={{
          height: 38,
          padding: '6px 12px',
          borderRadius: 10,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.white,
          color: colors.ink,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {YEAR_OPTIONS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    );
  }

  return (
    <View>
      <Pressable style={styles.yearBtn} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel="Select year">
        <Text style={styles.yearBtnText}>{value}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.rust} />
      </Pressable>
      {open && (
        <View style={styles.yearOptions}>
          {YEAR_OPTIONS.map((y) => (
            <Pressable
              key={y}
              style={styles.yearOption}
              onPress={() => {
                onChange(y);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Year ${y}`}
            >
              <Text style={[styles.yearOptionText, y === value && styles.yearOptionTextActive]}>{y}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

type SaveStatus = { type: 'success' | 'error'; message: string } | null;

export default function DashboardScreen() {
  const { email, role, roleLoading } = useMarketRateAuth();
  const [year, setYear] = useState<string>(String(CURRENT_YEAR));
  const [rows, setRows] = useState<MarketRateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  const loadYear = async (y: string) => {
    setLoading(true);
    setStatus(null);
    try {
      // Admin sees every submitter's rows for the year (no Email filter); anyone else only sees
      // their own — matches "if the login email is Admin then based on only Year it should show
      // all the rates."
      const opts = role === 'Admin' ? {} : email ? { email } : {};
      const data = await fetchMarketRates(y, opts);
      setRows(data);
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Could not load rates for this year.' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!roleLoading) loadYear(year);
    // Re-run once role resolves (Admin vs. everyone-else changes which filter is applied), and
    // whenever the selected year changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, year]);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View style={styles.flex1}>
          <Text style={styles.sectionTitle}>History</Text>
          <Text style={styles.sectionSubtitle}>
            {role === 'Admin' ? 'Showing every submitted rate for the selected year' : 'Showing your submitted rates for the selected year'}
          </Text>
        </View>
        <YearSelect value={year} onChange={setYear} />
      </View>

      {loading || roleLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.rust} />
          <Text style={styles.loadingText}>Loading rates…</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="file-tray-outline" size={22} color={colors.inkSoft} />
          <Text style={styles.emptyText}>No rates found for {year}.</Text>
        </View>
      ) : (
        <>
          {status && (
            <View style={[styles.statusBanner, styles.statusError]}>
              <Ionicons name="alert-circle" size={16} color={colors.red} />
              <Text style={[styles.statusText, { color: colors.red }]}>{status.message}</Text>
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
            <View style={[styles.card, { width: TABLE_WIDTH }]}>
              <View style={styles.tableHeaderRow}>
                {DISPLAY_COLUMNS.map((col) => (
                  <Text key={col.field} style={[styles.headerCell, { width: col.width }]}>{col.label}</Text>
                ))}
                <Text style={[styles.headerCell, { width: DATE_COL_WIDTH }]}>Valid From</Text>
              </View>

              {rows.map((row, i) => (
                <View key={row.key} style={styles.tableRow}>
                  {DISPLAY_COLUMNS.map((col) => (
                    <Text key={col.field} style={[styles.readonlyCell, { width: col.width }]} numberOfLines={1}>
                      {row[col.field]}
                    </Text>
                  ))}
                  <Text style={[styles.readonlyCell, { width: DATE_COL_WIDTH }]} numberOfLines={1}>
                    {formatDateFriendly(row.validFrom)}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
  flex1: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
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
  yearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
  },
  yearBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  yearOptions: {
    position: 'absolute',
    top: 42,
    right: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    overflow: 'hidden',
    zIndex: 10,
  },
  yearOption: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  yearOptionText: {
    fontSize: 13,
    color: colors.ink,
  },
  yearOptionTextActive: {
    fontWeight: '700',
    color: colors.rust,
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
  tableScroll: {
    flexGrow: 0,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    overflow: 'hidden',
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
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.rust,
    borderBottomWidth: 1,
    borderBottomColor: colors.rust,
  },
  headerCell: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.white,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  readonlyCell: {
    fontSize: 12.5,
    color: colors.inkSoft,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 16,
    maxWidth: 900,
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
