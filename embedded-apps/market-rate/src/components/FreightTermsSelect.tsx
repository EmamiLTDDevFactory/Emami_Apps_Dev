import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme/tokens';

/** The two Freight Terms a rate can be quoted on — sent to SAP as-is in each line item's
 * FreightTerms field (see marketRateApi.ts toSapLineItem). */
export const FREIGHT_TERMS = ['EXW', 'FOR'] as const;
export type FreightTerms = (typeof FREIGHT_TERMS)[number];

/** Mandatory Freight Terms picker for one rate row — a real dropdown on web (starting on an
 * unselectable "Select" so nothing is pre-chosen for the vendor), an EXW / FOR toggle on native.
 * `invalid` outlines it in red when a save was attempted without a choice. */
export function FreightTermsSelect({
  value,
  onChange,
  label,
  width,
  invalid,
}: {
  value: string;
  onChange: (v: FreightTerms) => void;
  label: string;
  width: number;
  invalid?: boolean;
}) {
  if (Platform.OS === 'web') {
    return (
      // @ts-expect-error — raw DOM element, valid under react-native-web
      <select
        value={value}
        onChange={(e: any) => onChange(e.target.value as FreightTerms)}
        aria-label={label}
        aria-required="true"
        style={{
          width,
          height: 36,
          padding: '6px 8px',
          borderRadius: 8,
          border: `1px solid ${invalid ? colors.red : colors.border}`,
          backgroundColor: invalid ? '#C0392B0A' : colors.white,
          color: value ? colors.ink : colors.inkSoft,
          fontSize: 13,
          fontWeight: value ? 700 : 400,
          cursor: 'pointer',
          boxSizing: 'border-box',
        }}
      >
        <option value="" disabled>
          Select
        </option>
        {FREIGHT_TERMS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    );
  }

  return (
    <View style={[styles.toggle, { width }, invalid && styles.toggleInvalid]} accessibilityLabel={label}>
      {FREIGHT_TERMS.map((t) => (
        <Pressable
          key={t}
          onPress={() => onChange(t)}
          style={[styles.toggleBtn, value === t && styles.toggleBtnOn]}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === t }}
          accessibilityLabel={t}
        >
          <Text style={[styles.toggleText, value === t && styles.toggleTextOn]}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  toggleInvalid: {
    borderColor: colors.red,
  },
  toggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: radii.sm,
  },
  toggleBtnOn: {
    backgroundColor: colors.rust,
  },
  toggleText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
  },
  toggleTextOn: {
    color: colors.white,
  },
});
