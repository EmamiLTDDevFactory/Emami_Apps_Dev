import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../../../src/theme/tokens';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';

/** Home ('/apps/payment-tracking/') — no longer a real screen for either role (per instruction,
 * neither Admin nor User needs a Home tab any more — see _layout.tsx's ADMIN_NAV_ITEMS, which
 * dropped it entirely). This route still has to exist (it's the app's root), so it's now just a
 * redirect: Admin lands on Dashboard, User on Upcoming Provision, matching each role's own first
 * nav item in _layout.tsx. */
export default function ProvisionHome() {
  const router = useRouter();
  const { isAdmin, roleLoading } = usePaymentTrackingAuth();

  useEffect(() => {
    if (roleLoading) return;
    router.replace((isAdmin ? '/apps/payment-tracking/dashboard' : '/apps/payment-tracking/upcoming') as any);
  }, [isAdmin, roleLoading, router]);

  return (
    <View style={styles.centerWrap}>
      <ActivityIndicator size="large" color={colors.rust} />
    </View>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
});
