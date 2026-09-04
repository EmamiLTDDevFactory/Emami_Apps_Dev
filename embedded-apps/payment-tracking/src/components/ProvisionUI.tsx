import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme/tokens';
import { formatValue, type Breakdown } from '../lib/provisionMetrics';

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
 * legible. */
export function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={kpiStyles.card}>
      <View style={[kpiStyles.iconBox, accent ? { backgroundColor: `${accent}18` } : null]}>
        <Ionicons name={icon} size={17} color={accent || colors.rust} />
      </View>
      <View style={kpiStyles.flex1}>
        <Text style={kpiStyles.value}>{value}</Text>
        <Text style={kpiStyles.label}>{label}</Text>
      </View>
    </View>
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
 * long and every word needs to stay readable. */
export function HorizontalBarBreakdown({ data, emptyMessage }: { data: Breakdown[]; emptyMessage: string }) {
  if (data.length === 0) {
    return <Text style={barStyles.emptyText}>{emptyMessage}</Text>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={barStyles.list}>
      {data.map((d) => (
        <View key={d.key} style={barStyles.row}>
          <View style={barStyles.labelCol}>
            <Text style={barStyles.label}>
              {d.label}{d.sublabel ? ` · ${d.sublabel}` : ''}
            </Text>
          </View>
          <View style={barStyles.trackCol}>
            <View style={barStyles.track}>
              <View style={[barStyles.fill, { width: `${(d.value / max) * 100}%` }]} />
            </View>
          </View>
          <Text style={barStyles.value} numberOfLines={1}>{formatValue(d.value)}</Text>
        </View>
      ))}
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
  labelCol: {
    width: 170,
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
 * — subtitle always wraps in full since it's the explanatory copy that says what the section does. */
export function OptionCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={optionStyles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <View style={optionStyles.iconBox}>
        <Ionicons name={icon} size={22} color={colors.rust} />
      </View>
      <Text style={optionStyles.title}>{title}</Text>
      <Text style={optionStyles.subtitle}>{subtitle}</Text>
      <View style={optionStyles.cta}>
        <Text style={optionStyles.ctaText}>Open</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.rust} />
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
