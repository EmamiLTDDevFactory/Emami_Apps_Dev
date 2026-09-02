import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radii } from '../theme/tokens';

interface DateFieldProps {
  label: string;
  value: string; // yyyy-mm-dd, or '' when unset
  onChange: (v: string) => void;
}

/** Date picker for the Pending Delivery tab's From/To selection, and the Revise Delivery Date
 * modal's Revised Delivery Date field — same shape as Market Rate's DateCell (raw HTML date input
 * on web, native community picker elsewhere) so date entry behaves consistently across every Emami
 * Apps embedded app. Stores yyyy-mm-dd; the API layer converts to SAP's datetime literal on the way
 * out (see paymentTrackingApi.ts's toSapDateFilter). */
export default function DateField({ label, value, onChange }: DateFieldProps) {
  const [showPicker, setShowPicker] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        {/* @ts-expect-error — raw DOM element, valid under react-native-web */}
        <input
          type="date"
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          aria-label={label}
          style={{
            width: '100%',
            height: 40,
            padding: '8px 10px',
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.white,
            color: colors.ink,
            fontSize: 13,
            boxSizing: 'border-box',
          }}
        />
      </View>
    );
  }

  const dateObj = value ? new Date(`${value}T00:00:00`) : new Date();
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name="calendar-outline" size={14} color={colors.rust} />
        <Text style={styles.dateBtnText}>{value || 'Select date'}</Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display={Platform.OS === 'android' ? 'spinner' : 'default'}
          onChange={(_event: any, selected?: Date) => {
            setShowPicker(Platform.OS === 'ios');
            if (selected) onChange(selected.toISOString().split('T')[0]);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 150,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.inkSoft,
    marginBottom: 6,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
  },
  dateBtnText: {
    fontSize: 13,
    color: colors.ink,
  },
});
