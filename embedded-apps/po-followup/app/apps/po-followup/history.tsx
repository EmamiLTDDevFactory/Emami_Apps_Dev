import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';

// Placeholder per instruction — no data source has been defined for this screen yet. Wire it up to
// a real SAP call once one is (see poFollowupApi.ts for the pattern the Home tabs already use).
export default function PoFollowupHistory() {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconBox}>
        <Ionicons name="time-outline" size={26} color={colors.rust} />
      </View>
      <Text style={styles.title}>History — coming soon</Text>
      <Text style={styles.subtitle}>This page isn't wired up to a data source yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 10,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: radii.xl,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
  },
});
