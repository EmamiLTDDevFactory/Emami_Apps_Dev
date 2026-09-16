import { StyleSheet, Text, View } from 'react-native';
import { colors, kpiTint, radius, shadow } from '@/constants/theme';

/**
 * Ported 1:1 from dis_shared_components.py's _kpi(icon, label, val, color, sub).
 *
 * `compact` shrinks padding/fonts/min-height for a row that needs to fit more cards side by
 * side without growing tall — opt-in only, so every existing call site (Dashboard, and the
 * other tabs' 2-per-row layout) keeps its original size untouched.
 */
export function KPICard({
  icon,
  label,
  value,
  color = colors.navy,
  sub,
  compact = false,
}: {
  icon: string;
  label: string;
  value: string;
  color?: string;
  sub?: string;
  compact?: boolean;
}) {
  const tint = kpiTint[color] ?? colors.navyLt;
  return (
    <View style={[styles.card, compact && styles.cardCompact, shadow.sm]}>
      <View style={[styles.accent, { backgroundColor: color }]} />
      <View style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.headerRow}>
          <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1}>
            {label}
          </Text>
          <View style={[styles.iconChip, compact && styles.iconChipCompact, { backgroundColor: tint }]}>
            <Text style={{ fontSize: compact ? 11 : 13 }}>{icon}</Text>
          </View>
        </View>
        <Text style={[styles.value, compact && styles.valueCompact]} numberOfLines={1}>
          {value}
        </Text>
        {sub ? (
          <Text style={[styles.sub, compact && styles.subCompact]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 90,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.g200,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cardCompact: { minHeight: 58 },
  accent: { height: 3, width: '100%' },
  body: { padding: 10, paddingHorizontal: 13, gap: 4 },
  bodyCompact: { padding: 6, paddingHorizontal: 9, gap: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 8.5, fontWeight: '700', color: colors.g400, letterSpacing: 0.7, textTransform: 'uppercase', flex: 1 },
  labelCompact: { fontSize: 7.5, letterSpacing: 0.4 },
  iconChip: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  iconChipCompact: { width: 20, height: 20, borderRadius: 5 },
  value: { fontSize: 20, fontWeight: '900', color: colors.g900, letterSpacing: -0.5 },
  valueCompact: { fontSize: 15, letterSpacing: -0.3 },
  sub: { fontSize: 10, color: colors.g400 },
  subCompact: { fontSize: 8.5 },
});
