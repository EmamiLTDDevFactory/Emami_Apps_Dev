import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../../src/lib/paymentTrackingApi';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';
import { num, formatValue, formatDeliveryDate } from '../../../src/lib/provisionMetrics';
import { ProvisionHero, ProvisionDetailModal } from '../../../src/components/ProvisionUI';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Financial year starts April (matches ZPROVISIONTRACKS_GET_ENTITYSET's lc_fy_start = 4, and
// MonthYearContext.tsx's own FY_START_MONTH) — whichever calendar month is being browsed, this
// picks the Gjahr that covers it so navigating across a Mar/Apr boundary still fetches correctly.
function fyStartYearFor(calendarYear: number, calendarMonthIdx0: number): number {
  return calendarMonthIdx0 + 1 >= 4 ? calendarYear : calendarYear - 1;
}

/** Admin's Calendar — a month grid of every open PO's delivery date (Eindt), independent of the
 * app-wide Month/Year picker in _layout.tsx (that one narrows every *other* screen's data; this
 * page instead browses month-to-month with its own prev/next controls, per instruction). Tapping a
 * date with items opens the same ProvisionDetailModal Dashboard's KPI cards use. */
export default function ProvisionCalendar() {
  const { email, isAdmin, roleLoading } = usePaymentTrackingAuth();
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<{ dateLabel: string; rows: PaymentTrackingRow[] } | null>(null);

  const gjahr = useMemo(() => String(fyStartYearFor(viewYear, viewMonth)), [viewYear, viewMonth]);

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin || !email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchProvisionPOs(email, { gjahr })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load provision data.'))
      .finally(() => setLoading(false));
  }, [email, isAdmin, roleLoading, gjahr]);

  const rowsByDay = useMemo(() => {
    const map = new Map<number, PaymentTrackingRow[]>();
    const monthStr = String(viewMonth + 1).padStart(2, '0');
    const yearStr = String(viewYear);
    for (const r of rows) {
      if (!r.deliveryDate || r.deliveryDate.slice(0, 4) !== yearStr || r.deliveryDate.slice(5, 7) !== monthStr) continue;
      const day = Number(r.deliveryDate.slice(8, 10));
      const list = map.get(day) ?? [];
      list.push(r);
      map.set(day, list);
    }
    return map;
  }, [rows, viewYear, viewMonth]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };
  const goToday = () => {
    setViewMonth(today.getMonth());
    setViewYear(today.getFullYear());
  };

  if (roleLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  // Defense in depth — the nav bar already hides this link from non-Admins, but the route is
  // still reachable by a typed URL.
  if (!isAdmin) {
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
        subtitle="Every open PO's delivery date, laid out month by month — tap a date for its line-item detail."
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
          <View style={styles.toolbar}>
            <Pressable style={styles.navBtn} onPress={goPrevMonth} accessibilityRole="button" accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={16} color={colors.rust} />
            </Pressable>
            <Text style={styles.monthLabel}>{MONTH_LABELS[viewMonth]} {viewYear}</Text>
            <Pressable style={styles.navBtn} onPress={goNextMonth} accessibilityRole="button" accessibilityLabel="Next month">
              <Ionicons name="chevron-forward" size={16} color={colors.rust} />
            </Pressable>
            <View style={styles.flex1} />
            <Pressable style={styles.todayBtn} onPress={goToday} accessibilityRole="button" accessibilityLabel="Jump to today">
              <Text style={styles.todayBtnText}>Today</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((d) => (
              <Text key={d} style={styles.weekdayLabel}>{d}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={`blank-${i}`} style={styles.cell} />;
              const dayRows = rowsByDay.get(day) ?? [];
              const hasItems = dayRows.length > 0;
              // '02' = GR/MIGO posted but no Service Entry Sheet yet — the main provision exposure
              // bucket, so a day carrying one gets the stronger (red) badge instead of the neutral one.
              const hasExposure = dayRows.some((r) => r.status === '02');
              const isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

              return (
                <Pressable
                  key={day}
                  style={[styles.cell, hasItems && styles.cellActive, isToday && styles.cellToday]}
                  disabled={!hasItems}
                  onPress={() => setActiveDay({ dateLabel: formatDeliveryDate(dateStr), rows: dayRows })}
                  accessibilityRole={hasItems ? 'button' : undefined}
                  accessibilityLabel={hasItems ? `${dayRows.length} item(s) due ${formatDeliveryDate(dateStr)}` : undefined}
                >
                  <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{day}</Text>
                  {hasItems ? (
                    <View style={[styles.dayBadge, hasExposure && styles.dayBadgeExposure]}>
                      <Text style={styles.dayBadgeText}>{dayRows.length}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.rust }]} />
              <Text style={styles.legendText}>Items due</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.red }]} />
              <Text style={styles.legendText}>Includes main exposure (GR posted, no SES)</Text>
            </View>
          </View>
        </View>
      )}

      {activeDay && (
        <ProvisionDetailModal
          title={`Deliveries due — ${activeDay.dateLabel}`}
          subtitle={`${activeDay.rows.length} line item(s), ${formatValue(activeDay.rows.reduce((sum, r) => sum + num(r.pendingValue), 0))} pending.`}
          rows={activeDay.rows}
          onClose={() => setActiveDay(null)}
        />
      )}
    </ScrollView>
  );
}

const CELL_SIZE = '14.28%';

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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  navBtn: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  monthLabel: {
    fontSize: 14.5,
    fontWeight: '800',
    color: colors.ink,
  },
  todayBtn: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.appBg,
  },
  todayBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.ink,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.inkSoft,
    paddingBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: CELL_SIZE,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: colors.border,
    gap: 3,
  },
  cellActive: {
    backgroundColor: `${colors.rust}0A`,
  },
  cellToday: {
    backgroundColor: `${colors.rust}18`,
  },
  dayNumber: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.ink,
  },
  dayNumberToday: {
    color: colors.rust,
    fontWeight: '800',
  },
  dayBadge: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.rust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeExposure: {
    backgroundColor: colors.red,
  },
  dayBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11.5,
    color: colors.inkSoft,
  },
});
