import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme/tokens';
import { getHubEmail, nameFromEmail } from '../lib/hubEmailLogin';

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface StatProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

function Stat({ icon, label, value }: StatProps) {
  return (
    <View style={styles.stat}>
      <View style={styles.statIconBox}>
        <Ionicons name={icon} size={14} color={colors.rust} />
      </View>
      <View style={styles.statTextWrap}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

/** Basic-details strip at the top of the app — who's signed in, and when. Same "label above value"
 * chip shape as Market Rate's InfoHeader, minus the weather/location stats (not relevant here, and
 * skips the expo-location dependency that comes with them). */
export default function InfoHeader() {
  const [now, setNow] = useState(() => new Date());
  const [hubEmail, setHubEmail] = useState<string | null>(null);

  useEffect(() => {
    setHubEmail(getHubEmail());
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  return (
    <View style={styles.wrap}>
      <Stat icon="person-circle-outline" label="Login Name" value={hubEmail ? nameFromEmail(hubEmail) : 'Guest'} />
      <Stat icon="calendar-outline" label="Date" value={formatDate(now)} />
      <Stat icon="time-outline" label="Time" value={formatTime(now)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.appBg,
    minWidth: 130,
  },
  statIconBox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    backgroundColor: `${colors.rust}1a`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTextWrap: {
    flexShrink: 1,
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 1,
  },
});
