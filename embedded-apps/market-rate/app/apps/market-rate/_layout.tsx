import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import InfoHeader from '../../../src/components/InfoHeader';
import { colors, radii } from '../../../src/theme/tokens';

// No login screen here at all — unlike non-ctc-expense, this app has no per-user auth gate of
// its own. Anyone who reached /apps/market-rate/ already signed in through the hub; InfoHeader's
// login name is only a label, not a gate.
export default function MarketRateLayout() {
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
