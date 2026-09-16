import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';

/** Shown while a date-range search (LoginSet + entity refetch) is in flight — see
 *  loading.inv in DataContext, driven by the Go button in TopBar. */
export function LoadingOverlay() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })
    );
    spinLoop.start();
    return () => spinLoop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.ringWrap}>
        {/* Single rotating arc — no separate static track ring, so only one ring is ever visible. */}
        <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
        <Text style={styles.truck}>🚚</Text>
      </View>
      <Text style={styles.label}>Depot Details Loading</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  ringWrap: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  ring: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: 'transparent',
    borderTopColor: colors.navy,
    borderRightColor: colors.navy,
  },
  truck: { fontSize: 28 },
  label: { fontSize: 12, fontWeight: '700', color: colors.navy, letterSpacing: 0.4 },
});
