import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme/tokens';

export const MONTHS = [
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
export const ALL_MONTH_VALUES = MONTHS.map((m) => m.value);

/** "Oct", "Jan, Feb, Mar", "5 months" or "All months" for a set of month values ('01'..'12'). */
export function formatMonthSelection(values: string[]): string {
  if (values.length === MONTHS.length) return 'All months';
  const labels = MONTHS.filter((m) => values.includes(m.value)).map((m) => m.label);
  return labels.length > 3 ? `${labels.length} months` : labels.join(', ');
}

type Option = { value: string; label: string };

/** A single-choice filter that's one 34px control with its label inside it (e.g. "YEAR 2026 ▾"),
 * so a filter bar fits on one line next to the screen title instead of stacking a label row above
 * every field. A real <select> on web; a small popover list on native. */
export function CompactSelect({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const activeLabel = options.find((o) => o.value === value)?.label ?? value;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.control}>
        <Text style={styles.controlLabel}>{label}</Text>
        {/* @ts-expect-error — raw DOM element, valid under react-native-web */}
        <select
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          aria-label={label}
          style={{ height: 32, border: 'none', outline: 'none', background: 'transparent', color: colors.ink, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', paddingRight: 4 }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </View>
    );
  }

  return (
    <View style={styles.anchor}>
      <Pressable style={styles.control} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={styles.controlLabel}>{label}</Text>
        <Text style={styles.controlValue} numberOfLines={1}>{activeLabel}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={colors.rust} />
      </Pressable>
      {open && (
        <View style={styles.popover}>
          {options.map((o) => (
            <Pressable key={o.value} style={styles.listOption} onPress={() => { onChange(o.value); setOpen(false); }} accessibilityRole="button" accessibilityLabel={o.label}>
              <Text style={[styles.listOptionText, o.value === value && styles.listOptionTextActive]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** Pick any number of months (at least one): a compact "MONTH Jan, Feb ▾" control that opens a
 * 3×4 grid of month toggles with All / Clear shortcuts. Clearing leaves the earliest selected
 * month on, since an empty month filter would only ever show an empty screen. */
export function MonthMultiSelect({ label = 'Month', selected, onChange }: { label?: string; selected: string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      if (selected.length === 1) return;
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange(ALL_MONTH_VALUES.filter((v) => v === value || selected.includes(v)));
    }
  };

  return (
    <View style={styles.anchor}>
      <Pressable style={styles.control} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={`${label}: ${formatMonthSelection(selected)}`}>
        <Text style={styles.controlLabel}>{label}</Text>
        <Text style={styles.controlValue} numberOfLines={1}>{formatMonthSelection(selected)}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={colors.rust} />
      </Pressable>
      {open && (
        <View style={[styles.popover, styles.monthPopover]}>
          <View style={styles.monthPopoverHeader}>
            <Pressable onPress={() => onChange(ALL_MONTH_VALUES)} hitSlop={6} accessibilityRole="button">
              <Text style={styles.linkText}>All</Text>
            </Pressable>
            <Pressable onPress={() => onChange([selected[0] ?? ALL_MONTH_VALUES[0]])} hitSlop={6} accessibilityRole="button">
              <Text style={styles.linkText}>Clear</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setOpen(false)} hitSlop={6} accessibilityRole="button">
              <Text style={[styles.linkText, { color: colors.ink }]}>Done</Text>
            </Pressable>
          </View>
          <View style={styles.monthGrid}>
            {MONTHS.map((m) => {
              const on = selected.includes(m.value);
              return (
                <Pressable
                  key={m.value}
                  style={[styles.monthChip, on && styles.monthChipOn]}
                  onPress={() => toggle(m.value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={m.label}
                >
                  <Text style={[styles.monthChipText, on && styles.monthChipTextOn]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingLeft: 10,
    paddingRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  controlLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  controlValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
    maxWidth: 140,
  },
  popover: {
    position: 'absolute',
    top: 38,
    left: 0,
    minWidth: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    zIndex: 30,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(31,27,51,0.14)' },
      default: { shadowColor: colors.plum, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 6 },
    }),
  },
  listOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  listOptionText: {
    fontSize: 12.5,
    color: colors.ink,
  },
  listOptionTextActive: {
    fontWeight: '700',
    color: colors.rust,
  },
  monthPopover: {
    width: 224,
    padding: 10,
    gap: 8,
  },
  monthPopoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.rust,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  monthChip: {
    width: 62,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  monthChipOn: {
    backgroundColor: colors.rust,
    borderColor: colors.rust,
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  monthChipTextOn: {
    color: colors.white,
  },
});
