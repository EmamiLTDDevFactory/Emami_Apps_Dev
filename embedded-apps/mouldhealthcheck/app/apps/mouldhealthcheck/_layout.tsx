import React from "react";
import { Stack, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/contexts/AuthContext";
import { InspectionProvider } from "@/lib/inspectionStore";
import { colors } from "@/constants/theme";
import HubActionBar from "@/components/HubActionBar";

function RootLayoutNav() {
  const segments = useSegments();
  // "index" is the transient role-resolving entry gate (app/apps/mouldhealthcheck/index.tsx) —
  // it has its own centered loading/error UI and unmounts the instant role resolution succeeds,
  // so the persistent bar has no useful "back"/"logout" action to offer there yet.
  const onEntryGate = segments[segments.length - 1] === "mouldhealthcheck";

  return (
    <>
      {!onEntryGate && <HubActionBar />}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <InspectionProvider>
            <RootLayoutNav />
          </InspectionProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
