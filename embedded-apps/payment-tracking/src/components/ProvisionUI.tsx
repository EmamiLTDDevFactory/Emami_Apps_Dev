import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme/tokens';
import { formatValue, type Breakdown } from '../lib/provisionMetrics';
import PaymentTrackingTable from './PaymentTrackingTable';
import type { PaymentTrackingRow } from '../lib/paymentTrackingApi';

const cardShadow = Platform.select({
  web: { boxShadow: '0 1px 3px rgba(31,27,51,0.06)' },
  default: {
    shadowColor: colors.plum,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
});

/** Dark plum banner shared by every Provision Tracking screen (Home, Dashboard, Provision Details)
 * so the app reads as one "command center" rather than a stack of plain white pages — the eyebrow
 * names where you are, the title is the section, and subtitle is a plain-language description that
 * is never truncated (no numberOfLines) per instruction that all wording stay clearly visible. */
export function ProvisionHero({
  eyebrow,
  title,
  subtitle,
  left,
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <View style={heroStyles.hero}>
      {left}
      <View style={heroStyles.flex1}>
        <Text style={heroStyles.eyebrow}>{eyebrow}</Text>
        <Text style={heroStyles.title}>{title}</Text>
        {subtitle ? <Text style={heroStyles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const heroStyles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.plum,
    borderRadius: radii.xl,
    padding: 20,
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(31,27,51,0.2)' },
      default: {
        shadowColor: colors.plum,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 3,
      },
    }),
  },
  flex1: { flex: 1 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.white,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 5,
    lineHeight: 18,
  },
});

/** Round icon button meant to sit inside ProvisionHero's `left`/`right` slots — light overlay tint
 * since it renders on the dark plum banner, unlike buttons elsewhere on a white card. */
export function HeroIconButton({
  icon,
  onPress,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable style={heroButtonStyles.btn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={colors.white} />
    </Pressable>
  );
}

const heroButtonStyles = StyleSheet.create({
  btn: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Solid pill action meant to sit inside ProvisionHero's `right` slot (e.g. "Provision Details"
 * from the Dashboard). */
export function HeroActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={heroButtonStyles2.btn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={heroButtonStyles2.text} numberOfLines={1}>{label}</Text>
      <Ionicons name="arrow-forward" size={14} color={colors.plum} />
    </Pressable>
  );
}

const heroButtonStyles2 = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
  },
  text: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.plum,
  },
});

/** One stat tile — used on Home and Dashboard so both "command center" screens share the exact
 * same KPI look. Label is a full description, never clipped, so what the number means is always
 * legible. Pass `onPress` to make it tappable (Dashboard opens the underlying rows in a pop-up) —
 * a small chevron signals it's interactive; without `onPress` it renders as a plain, inert card
 * (Home's KPIs are informational only). */
export function KpiCard({
  icon,
  label,
  value,
  accent,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent?: string;
  onPress?: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      style={kpiStyles.card}
      {...(onPress ? { onPress, accessibilityRole: 'button' as const, accessibilityLabel: `${label}: ${value}` } : null)}
    >
      <View style={[kpiStyles.iconBox, accent ? { backgroundColor: `${accent}18` } : null]}>
        <Ionicons name={icon} size={17} color={accent || colors.rust} />
      </View>
      <View style={kpiStyles.flex1}>
        <Text style={kpiStyles.value}>{value}</Text>
        <Text style={kpiStyles.label}>{label}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} /> : null}
    </Wrapper>
  );
}

const kpiStyles = StyleSheet.create({
  flex1: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 210,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 16,
    ...cardShadow,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: radii.lg,
    backgroundColor: `${colors.rust}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.ink,
  },
  label: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
  },
});

/** Horizontal bar breakdown (pending value by status / cost center / vendor, etc.) — labels wrap
 * onto a second line instead of being clipped, since cost center and status descriptions can run
 * long and every word needs to stay readable. Pass `onSelect` to make each row tappable (Dashboard
 * opens the rows behind that slice in a pop-up) — a chevron signals it's interactive, same
 * affordance as the clickable KpiCard. */
export function HorizontalBarBreakdown({
  data,
  emptyMessage,
  onSelect,
}: {
  data: Breakdown[];
  emptyMessage: string;
  onSelect?: (item: Breakdown) => void;
}) {
  // Below ~480px, a fixed 170px label column leaves almost nothing for the bar itself (see
  // labelCol) — stack the label above the bar+value instead of squashing them into one row.
  const { width } = useWindowDimensions();
  const isNarrow = width < 480;

  if (data.length === 0) {
    return <Text style={barStyles.emptyText}>{emptyMessage}</Text>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={barStyles.list}>
      {data.map((d) => {
        const RowWrapper = onSelect ? Pressable : View;
        return (
          <RowWrapper
            key={d.key}
            style={[barStyles.row, isNarrow && barStyles.rowNarrow]}
            {...(onSelect
              ? { onPress: () => onSelect(d), accessibilityRole: 'button' as const, accessibilityLabel: `${d.label}: ${formatValue(d.value)}` }
              : null)}
          >
            <View style={[barStyles.labelCol, isNarrow && barStyles.labelColNarrow]}>
              <Text style={barStyles.label}>
                {d.label}{d.sublabel ? ` · ${d.sublabel}` : ''}
              </Text>
            </View>
            <View style={[barStyles.trackRow, !isNarrow && barStyles.trackRowInline]}>
              <View style={barStyles.trackCol}>
                <View style={barStyles.track}>
                  <View style={[barStyles.fill, { width: `${(d.value / max) * 100}%` }]} />
                </View>
              </View>
              <Text style={barStyles.value} numberOfLines={1}>{formatValue(d.value)}</Text>
              {onSelect ? <Ionicons name="chevron-forward" size={14} color={colors.inkSoft} /> : null}
            </View>
          </RowWrapper>
        );
      })}
    </View>
  );
}

const barStyles = StyleSheet.create({
  list: { gap: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowNarrow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
  },
  labelCol: {
    width: 170,
  },
  labelColNarrow: {
    width: '100%',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trackRowInline: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: colors.ink,
    lineHeight: 16,
  },
  trackCol: {
    flex: 1,
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.appBg,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.rust,
    borderRadius: 5,
  },
  value: {
    width: 74,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  emptyText: {
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 8,
  },
});

/** Clickable section-chooser card (Home's quick links, Provision Details' "how to browse" choice)
 * — subtitle always wraps in full since it's the explanatory copy that says what the section does.
 * `accent` colors the icon box, top stripe, and CTA so each choice reads as visually distinct
 * instead of every card looking identical. */
export function OptionCard({
  icon,
  title,
  subtitle,
  onPress,
  accent = colors.rust,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  accent?: string;
}) {
  return (
    <Pressable
      style={[optionStyles.card, { borderTopColor: accent, borderTopWidth: 3 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[optionStyles.iconBox, { backgroundColor: `${accent}18` }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <Text style={optionStyles.title}>{title}</Text>
      <Text style={optionStyles.subtitle}>{subtitle}</Text>
      <View style={optionStyles.cta}>
        <Text style={[optionStyles.ctaText, { color: accent }]}>Open</Text>
        <Ionicons name="arrow-forward" size={14} color={accent} />
      </View>
    </Pressable>
  );
}

const optionStyles = StyleSheet.create({
  card: {
    minWidth: 260,
    flexGrow: 1,
    flexBasis: 260,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 20,
    gap: 8,
    ...cardShadow,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 12.5,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  ctaText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.rust,
  },
});

/** Generic "here are the rows behind that number" pop-up — used by Dashboard's clickable KpiCards
 * so every stat can answer "which POs/lines is this counting?" with the same shared line-item table
 * Upcoming/Missed/Provision Details already use, instead of a bespoke view per stat. */
export function ProvisionDetailModal({
  title,
  subtitle,
  rows,
  onClose,
}: {
  title: string;
  subtitle?: string;
  rows: PaymentTrackingRow[];
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={detailModalStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={detailModalStyles.card}>
          <View style={detailModalStyles.headerRow}>
            <View style={detailModalStyles.flex1}>
              <Text style={detailModalStyles.title}>{title}</Text>
              {subtitle ? <Text style={detailModalStyles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView style={detailModalStyles.scroll} showsVerticalScrollIndicator={false}>
            <PaymentTrackingTable rows={rows} emptyMessage="No items match this stat right now." />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const detailModalStyles = StyleSheet.create({
  flex1: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(31,27,51,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 920,
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: 20,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 3,
    lineHeight: 18,
  },
  scroll: {
    flexGrow: 0,
  },
});
