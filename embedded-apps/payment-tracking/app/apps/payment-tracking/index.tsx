import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../../../src/theme/tokens';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';

/** Home ('/apps/payment-tracking/') — no longer a real screen for any role (per instruction, none
 * of the three needs a Home tab any more — see _layout.tsx's nav lists, which dropped it
 * entirely). This route still has to exist (it's the app's root), so it's now just a redirect:
 * Admin lands on Dashboard, Finance on Pending Approval, User on Upcoming Provision — each role's
 * own first nav item in _layout.tsx. */
export default function ProvisionHome() {
  const router = useRouter();
  const { role, roleLoading } = usePaymentTrackingAuth();

  useEffect(() => {
    if (roleLoading) return;
    const dest = role === 'Admin'
      ? '/apps/payment-tracking/dashboard'
      : role === 'Finance'
        ? '/apps/payment-tracking/pending-approval'
        : '/apps/payment-tracking/upcoming';
    router.replace(dest as any);
  }, [role, roleLoading, router]);

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
