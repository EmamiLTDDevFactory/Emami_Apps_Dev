import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Icons from "phosphor-react-native";
import { colors, font, radius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { hubLogoutUrl } from "@/lib/hubEmailLogin";

/**
 * Persistent bar rendered once at the root layout (app/apps/mouldhealthcheck/_layout.tsx), above
 * every (tabs) and (modals) screen — this app has no per-screen header of its own to hang these
 * on, and modals are siblings of (tabs) under the same root Stack, not children of it, so a
 * (tabs)-only bar would still leave all 13 modal screens uncovered.
 *
 * Logout here is a REAL Emami Apps logout (clears the hub's own emami_apps_* session, and for an
 * SSO session ends the Microsoft session too via SAML Single Logout) — see hubLogoutUrl()'s
 * comment. That's deliberately different from every other embedded app's own Logout button today
 * (Non CTC Expense, RC Portal), which only end that one sub-app's session and leave the hub
 * itself signed in.
 */
export default function HubActionBar() {
  const { logout } = useAuth();

  const goHome = () => {
    if (typeof window !== "undefined") window.location.href = "/";
  };

  const doLogout = () => {
    const confirmed = typeof window === "undefined" || window.confirm("Log out of Emami Apps entirely?");
    if (!confirmed) return;
    logout();
    if (typeof window !== "undefined") window.location.href = hubLogoutUrl();
  };

  return (
    <View style={styles.bar}>
      <Pressable style={styles.btn} onPress={goHome} accessibilityRole="button" accessibilityLabel="Back to Emami Apps">
        <Icons.House size={15} color={colors.brand} weight="bold" />
        <Text style={styles.btnText}>Emami Apps</Text>
      </Pressable>
      <Pressable style={styles.btn} onPress={doLogout} accessibilityRole="button" accessibilityLabel="Logout">
        <Icons.SignOut size={15} color={colors.danger} weight="bold" />
        <Text style={[styles.btnText, { color: colors.danger }]}>Logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  btnText: {
    fontSize: font.caption,
    fontWeight: font.semibold,
    color: colors.brand,
  },
});
