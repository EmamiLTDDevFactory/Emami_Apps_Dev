import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme/tokens';
import { useMonthYear, MONTH_OPTIONS, YEAR_OPTIONS } from '../context/MonthYearContext';

/** Same raw-&lt;select&gt;-on-web, popover-on-native split Market Rate's own filter selects use. */
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeLabel = options.find((o) => o.value === value)?.label ?? value;

  if (Platform.OS === 'web') {
    return (
      <select
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        aria-label={label}
        style={{
          height: 32,
          padding: '4px 8px',
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.white,
          color: colors.ink,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  return (
    <View>
      <Pressable style={styles.selectBtn} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={styles.selectBtnText} numberOfLines={1}>{activeLabel}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={colors.rust} />
      </Pressable>
      {open && (
        <View style={styles.selectOptions}>
          {options.map((o) => (
            <Pressable
              key={o.value}
              style={styles.selectOption}
              onPress={() => { onChange(o.value); setOpen(false); }}
              accessibilityRole="button"
              accessibilityLabel={o.label}
            >
              <Text style={[styles.selectOptionText, o.value === value && styles.selectOptionTextActive]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** Persistent Month/Year picker shown on every Provision Tracking page (mounted once in
 * _layout.tsx, above the routed Stack) — per instruction it needs to be visible everywhere, not
 * just Dashboard. Currently UI-only: see MonthYearContext.tsx's header comment for why nothing is
 * wired to it yet (no live date field on ZProvisionTrackSet), and the notice line below says so
 * plainly rather than silently doing nothing. */
export default function MonthYearBar() {
  const { month, year, setMonth, setYear } = useMonthYear();

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Ionicons name="calendar-outline" size={14} color={colors.rust} />
        <Text style={styles.label}>Period</Text>
        <Select label="Month" value={month} options={MONTH_OPTIONS} onChange={setMonth} />
        <Select label="Year" value={year} options={YEAR_OPTIONS.map((y) => ({ value: y, label: y }))} onChange={setYear} />
      </View>
      <View style={styles.noticeRow}>
        <Ionicons name="information-circle-outline" size={12} color={colors.inkSoft} />
        <Text style={styles.noticeText}>Not applied to any data yet — SAP doesn't expose a submission/posting date on this data source.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkSoft,
    marginRight: 2,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  noticeText: {
    fontSize: 10.5,
    color: colors.inkSoft,
    flexShrink: 1,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
  },
  selectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  selectOptions: {
    position: 'absolute',
    top: 34,
    left: 0,
    minWidth: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    overflow: 'hidden',
    zIndex: 10,
    maxHeight: 220,
  },
  selectOption: {
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  selectOptionText: {
    fontSize: 12,
    color: colors.ink,
  },
  selectOptionTextActive: {
    fontWeight: '700',
    color: colors.rust,
  },
});
