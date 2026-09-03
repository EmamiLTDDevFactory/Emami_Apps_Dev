import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../../src/lib/paymentTrackingApi';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';
import PaymentTrackingTable from '../../../src/components/PaymentTrackingTable';

type Mode = 'choose' | 'costcenter' | 'costcenter-po' | 'report-po';

interface PoGroup {
  poNumber: string;
  poCreator: string;
  vendor: string;
  vendorName: string;
  costCenter: string;
  costCenterText: string;
  glAccount: string;
  glAccountText: string;
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

function OptionCard({ icon, title, subtitle, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={styles.optionCard} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <View style={styles.optionIconBox}>
        <Ionicons name={icon} size={22} color={colors.rust} />
      </View>
      <Text style={styles.optionTitle}>{title}</Text>
      <Text style={styles.optionSubtitle}>{subtitle}</Text>
      <View style={styles.optionCta}>
        <Text style={styles.optionCtaText}>Open</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.rust} />
      </View>
    </Pressable>
  );
}

function Tile({
  title,
  subtitle,
  kpis,
  onPress,
}: {
  title: string;
  subtitle?: string;
  kpis: { label: string; value: string }[];
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tile} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <View style={styles.tileHeaderRow}>
        <Text style={styles.tileTitle} numberOfLines={1}>{title}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
      </View>
      {subtitle ? <Text style={styles.tileSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      <View style={styles.tileKpiRow}>
        {kpis.map((k) => (
          <View key={k.label} style={styles.tileKpi}>
            <Text style={styles.tileKpiValue} numberOfLines={1}>{k.value}</Text>
            <Text style={styles.tileKpiLabel}>{k.label}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/** The pop-up per instruction — full PO header context plus every line item, reusing
 * PaymentTrackingTable (same approved column set) so the line-item detail matches Upcoming/
 * Missed's own table instead of a second, divergent one. */
function PoDetailModal({ group, onClose }: { group: PoGroup; onClose: () => void }) {
  return (
    <View style={styles.modalOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={styles.modalCard}>
        <View style={styles.modalHeaderRow}>
          <View style={styles.flex1}>
            <Text style={styles.modalTitle}>PO {group.poNumber}</Text>
            <Text style={styles.modalSubtitle} numberOfLines={1}>
              {group.vendor}{group.vendorName ? ` · ${group.vendorName}` : ''}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.modalMetaGrid}>
            <View style={styles.modalMetaItem}>
              <Text style={styles.modalMetaLabel}>PO Creator</Text>
              <Text style={styles.modalMetaValue}>{group.poCreator || '—'}</Text>
            </View>
            <View style={styles.modalMetaItem}>
              <Text style={styles.modalMetaLabel}>Cost Center</Text>
              <Text style={styles.modalMetaValue}>
                {group.costCenter || '—'}{group.costCenterText ? ` · ${group.costCenterText}` : ''}
              </Text>
            </View>
            <View style={styles.modalMetaItem}>
              <Text style={styles.modalMetaLabel}>GL Code</Text>
              <Text style={styles.modalMetaValue}>
                {group.glAccount || '—'}{group.glAccountText ? ` · ${group.glAccountText}` : ''}
              </Text>
            </View>
            <View style={styles.modalMetaItem}>
              <Text style={styles.modalMetaLabel}>Pending Bill Value</Text>
              <Text style={[styles.modalMetaValue, styles.modalMetaValueStrong]}>{formatValue(group.totalOpenValue)}</Text>
            </View>
          </View>

          <Text style={styles.modalLinesTitle}>Line items ({group.lineCount})</Text>
          <PaymentTrackingTable rows={group.lines} emptyMessage="No line items." />
        </ScrollView>
      </View>
    </View>
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
  const { email, isAdmin, roleLoading } = usePaymentTrackingAuth();
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('choose');
  const [selectedCostCenter, setSelectedCostCenter] = useState<string | null>(null);
  const [selectedPo, setSelectedPo] = useState<PoGroup | null>(null);

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin || !email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchProvisionPOs(email)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load provision data.'))
      .finally(() => setLoading(false));
  }, [email, isAdmin, roleLoading]);

  const poGroups = useMemo(() => groupByPo(rows), [rows]);
  const costCenterGroups = useMemo(() => groupByCostCenter(rows), [rows]);
  const posForSelectedCostCenter = useMemo(
    () => poGroups.filter((g) => (g.costCenter || 'Unassigned') === selectedCostCenter),
    [poGroups, selectedCostCenter]
  );

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
        <Text style={styles.deniedText}>Provision Details is only available to Admins.</Text>
      </View>
    );
  }

  const onBack = () => {
    if (mode === 'costcenter-po') {
      setMode('costcenter');
      setSelectedCostCenter(null);
      return;
    }
    setMode('choose');
  };

  const breadcrumb =
    mode === 'choose'
      ? 'Provision Details'
      : mode === 'costcenter'
        ? 'Provision Details / Cost Center Wise Details'
        : mode === 'costcenter-po'
          ? `Provision Details / Cost Center Wise Details / ${selectedCostCenter}`
          : 'Provision Details / Detailed Report';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          {mode !== 'choose' && (
            <Pressable style={styles.backBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={16} color={colors.rust} />
            </Pressable>
          )}
          <View style={styles.flex1}>
            <Text style={styles.breadcrumb} numberOfLines={1}>{breadcrumb}</Text>
            {mode === 'choose' && <Text style={styles.sectionSubtitle}>Choose how to browse open provisions</Text>}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.rust} />
            <Text style={styles.loadingText}>Loading provision data…</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <>
            {mode === 'choose' && (
              <View style={styles.optionsRow}>
                <OptionCard
                  icon="business-outline"
                  title="Cost Center Wise Details"
                  subtitle="Browse by cost center first, then drill into each PO under it."
                  onPress={() => setMode('costcenter')}
                />
                <OptionCard
                  icon="list-outline"
                  title="Detailed Report"
                  subtitle="Every open PO at once, with cost center & GL shown up front."
                  onPress={() => setMode('report-po')}
                />
              </View>
            )}

            {mode === 'costcenter' && (
              costCenterGroups.length === 0 ? (
                <Text style={styles.emptyText}>No open provisions found.</Text>
              ) : (
                <View style={styles.tileGrid}>
                  {costCenterGroups.map((g) => (
                    <Tile
                      key={g.costCenter}
                      title={g.costCenter}
                      subtitle={g.costCenterText}
                      kpis={[
                        { label: 'POs', value: String(g.poCount) },
                        { label: 'Lines', value: String(g.lineCount) },
                        { label: 'Pending Value', value: formatValue(g.totalOpenValue) },
                      ]}
                      onPress={() => { setSelectedCostCenter(g.costCenter); setMode('costcenter-po'); }}
                    />
                  ))}
                </View>
              )
            )}

            {mode === 'costcenter-po' && (
              posForSelectedCostCenter.length === 0 ? (
                <Text style={styles.emptyText}>No open POs under this cost center.</Text>
              ) : (
                <View style={styles.tileGrid}>
                  {posForSelectedCostCenter.map((g) => (
                    <Tile
                      key={g.poNumber}
                      title={g.poNumber}
                      subtitle={`GL ${g.glAccount || '—'} · CC ${g.costCenter || '—'}`}
                      kpis={[
                        { label: 'Lines', value: String(g.lineCount) },
                        { label: 'Pending Value', value: formatValue(g.totalOpenValue) },
                      ]}
                      onPress={() => setSelectedPo(g)}
                    />
                  ))}
                </View>
              )
            )}

            {mode === 'report-po' && (
              poGroups.length === 0 ? (
                <Text style={styles.emptyText}>No open POs found.</Text>
              ) : (
                <View style={styles.tileGrid}>
                  {poGroups.map((g) => (
                    <Tile
                      key={g.poNumber}
                      title={g.poNumber}
                      subtitle={`GL ${g.glAccount || '—'} · CC ${g.costCenter || '—'}`}
                      kpis={[
                        { label: 'Lines', value: String(g.lineCount) },
                        { label: 'Pending Value', value: formatValue(g.totalOpenValue) },
                      ]}
                      onPress={() => setSelectedPo(g)}
                    />
                  ))}
                </View>
              )
            )}
          </>
        )}
      </ScrollView>

      {selectedPo && <PoDetailModal group={selectedPo} onClose={() => setSelectedPo(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  breadcrumb: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 1,
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
    paddingVertical: 40,
    textAlign: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  optionCard: {
    minWidth: 260,
    flexGrow: 1,
    flexBasis: 260,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 20,
    gap: 8,
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
  optionIconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  optionSubtitle: {
    fontSize: 12.5,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  optionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  optionCtaText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.rust,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  tile: {
    minWidth: 220,
    flexGrow: 1,
    flexBasis: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 16,
    gap: 8,
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
  tileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tileTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
    flexShrink: 1,
  },
  tileSubtitle: {
    fontSize: 11.5,
    color: colors.inkSoft,
  },
  tileKpiRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 4,
  },
  tileKpi: {
    gap: 1,
  },
  tileKpiValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  tileKpiLabel: {
    fontSize: 10,
    color: colors.inkSoft,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(31,27,51,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 50,
  },
  modalCard: {
    width: '100%',
    maxWidth: 920,
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: 20,
    gap: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 2,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  modalMetaItem: {
    minWidth: 160,
    gap: 2,
  },
  modalMetaLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  modalMetaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  modalMetaValueStrong: {
    color: colors.red,
    fontWeight: '800',
  },
  modalLinesTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 8,
  },
});
