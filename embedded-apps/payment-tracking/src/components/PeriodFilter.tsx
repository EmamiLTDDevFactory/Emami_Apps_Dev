import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme/tokens';

export type Period = 7 | 15;

interface PeriodFilterProps {
  value: Period;
  onChange: (p: Period) => void;
  /** e.g. "Delivery in next" / "Overdue up to" / "PO date within last" — the fixed leading phrase,
   * since what the day count actually filters differs per section. */
  label: string;
}

const OPTIONS: Period[] = [7, 15];

/** Two-option pill selector (7 Days / 15 Days) — every section (Upcoming/Missed/Pending) gets one
 * of these instead of a manual date-range picker. */
export default function PeriodFilter({ value, onChange, label }: PeriodFilterProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.pillRow}>
        {OPTIONS.map((opt) => {
          const active = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[styles.pill, active && styles.pillActive]}
              accessibilityRole="button"
              accessibilityLabel={`${opt} Days`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt} Days</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
  },
  pillActive: {
    backgroundColor: colors.rust,
    borderColor: colors.rust,
  },
  pillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  pillTextActive: {
    color: colors.white,
  },
});
