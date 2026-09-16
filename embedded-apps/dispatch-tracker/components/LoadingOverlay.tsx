import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';

/** Shown while a date-range search (LoginSet + entity refetch) is in flight — see
 *  loading.inv in DataContext, driven by the Go button in TopBar. */
export function LoadingOverlay() {
  const spin = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })
    );
    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 450, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    );
    spinLoop.start();
    bounceLoop.start();
    return () => {
      spinLoop.stop();
      bounceLoop.stop();
    };
  }, [spin, bounce]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const translateX = bounce.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] });

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.ringWrap}>
        <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
        <Animated.Text style={[styles.truck, { transform: [{ translateX }] }]}>🚚</Animated.Text>
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
  ringWrap: { width: 74, height: 74, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  ring: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 5,
    borderColor: colors.navyLt,
    borderTopColor: colors.navy,
  },
  truck: { fontSize: 26 },
  label: { fontSize: 12, fontWeight: '700', color: colors.navy, letterSpacing: 0.4 },
});
