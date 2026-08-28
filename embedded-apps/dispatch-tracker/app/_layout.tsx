import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
import { colors } from '@/constants/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <DataProvider>
        <RootNavigator />
      </DataProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, bootstrapping } = useAuth();

  useEffect(() => {
    if (bootstrapping) return;
    // No login screen of its own anymore — a visitor with no real hub session has nothing to sign
    // into here, so bounce straight back to the hub instead of showing this app's own error state.
    if (!session && typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }, [session, bootstrapping]);

  if (bootstrapping || !session) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.teal} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
