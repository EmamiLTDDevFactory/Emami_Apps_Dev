import React from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/contexts/AuthContext";
import { InspectionProvider } from "@/lib/inspectionStore";
import { colors } from "@/constants/theme";
import Head from 'expo-router/head';

// Browser tab title — without this the tab showed the bare URL (Expo Router's static HTML ships an
// empty <title>).
export default function RootLayout() {
  return (
    <>
      <Head>
        <title>Mould Health Inspection</title>
      </Head>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <InspectionProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="index" />
          </Stack>
          </InspectionProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </>
  );
}
