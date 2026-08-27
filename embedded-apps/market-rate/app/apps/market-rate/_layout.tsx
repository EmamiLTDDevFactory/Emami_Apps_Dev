import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getHubEmail } from '../../../src/lib/hubEmailLogin';
import { colors } from '../../../src/theme/tokens';

// No login screen here at all — unlike non-ctc-expense, this app has no per-user auth gate of
// its own. Anyone who reached /apps/market-rate/ already signed in through the hub; getHubEmail()
// is only used to label who's entering rates (and to send as SAP's "created by" field once wired
// up — see src/lib/marketRateApi.ts).
export default function MarketRateLayout() {
  const [hubEmail, setHubEmail] = useState<string | null>(null);

  useEffect(() => {
    setHubEmail(getHubEmail());
  }, []);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <TouchableOpacity
          style={styles.backToHubBar}
          onPress={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/';
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Back to Emami Apps"
        >
          <Text style={styles.backToHubText}>{'←'} Back to Emami Apps</Text>
        </TouchableOpacity>

        <View style={styles.titleBar}>
          <View style={styles.flex1}>
            <Text style={styles.title}>Market Rate</Text>
            <Text style={styles.subtitle}>Enter material market rates for SAP</Text>
          </View>
          {hubEmail && (
            <View style={styles.userChip}>
              <Text style={styles.userChipLabel}>Signed in as</Text>
              <Text style={styles.userChipEmail} numberOfLines={1}>{hubEmail}</Text>
            </View>
          )}
        </View>

        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
        </Stack>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.plum,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.appBg,
  },
  flex1: {
    flex: 1,
  },
  backToHubBar: {
    backgroundColor: colors.plum,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backToHubText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  userChip: {
    alignItems: 'flex-end',
    maxWidth: 200,
  },
  userChipLabel: {
    fontSize: 10.5,
    color: colors.inkSoft,
  },
  userChipEmail: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 1,
  },
});
