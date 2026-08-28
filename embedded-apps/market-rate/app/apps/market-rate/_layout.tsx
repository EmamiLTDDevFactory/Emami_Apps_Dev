import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import InfoHeader from '../../../src/components/InfoHeader';
import { colors, radii } from '../../../src/theme/tokens';
import { hasHubSession } from '../../../src/lib/hubEmailLogin';

// No login screen here at all — unlike non-ctc-expense, this app has no per-user auth gate of
// its own. Anyone who reached /apps/market-rate/ is only meant to be here because the hub already
// signed them in — so on mount, check for a real hub session (not just a stray email left over in
// localStorage) and bounce straight back to the hub to sign in if there isn't one, rather than
// ever rendering the form for an unauthenticated visitor who typed the URL directly.
export default function MarketRateLayout() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (hasHubSession()) {
      setAuthorized(true);
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }, []);

  if (authorized !== true) {
    return (
      <View style={styles.checkingWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

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
          <Ionicons name="arrow-back" size={14} color={colors.white} />
          <Text style={styles.backToHubText}>Back to Emami Apps</Text>
        </TouchableOpacity>

        <View style={styles.titleBar}>
          <View style={styles.titleIconBox}>
            <Ionicons name="pricetags-outline" size={18} color={colors.rust} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.title}>Market Rate</Text>
            <Text style={styles.subtitle}>Enter material market rates for SAP</Text>
          </View>
        </View>

        <InfoHeader />

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
  checkingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.appBg,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.appBg,
  },
  flex1: {
    flex: 1,
  },
  backToHubBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    gap: 12,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  titleIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
});
