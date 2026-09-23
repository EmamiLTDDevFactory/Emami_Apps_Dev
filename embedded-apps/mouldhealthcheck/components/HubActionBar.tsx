import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { getHubEmail, hubLogoutUrl, nameFromEmail } from "@/lib/hubEmailLogin";
import { openNavDrawer } from "@/lib/navDrawer";
import { useBreakpoint, SIDEBAR_WIDTH } from "@/utils/responsive";

// Hub palette — same values as the other embedded apps' top bars (market-rate's _layout.tsx).
const HUB = {
  rust: "#4F3FD6",
  plum: "#241E3D",
  ink: "#1F1B33",
  border: "#E6E3F5",
  appBg: "#EEF0F4",
  white: "#FFFFFF",
  danger: "#E23744",
};

function formatDateCompact(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Persistent top bars rendered once at the root layout (app/apps/mouldhealthcheck/_layout.tsx),
 * above every (tabs) and (modals) screen — the same two bars every other embedded app has
 * (market-rate's _layout.tsx): a dark "Back to Emami Apps" strip, then a white title bar with the
 * app name, the signed-in user and today's date. On (tabs) screens the title bar also carries the
 * phone-width menu button for CustomTabs' drawer, and at tablet width and up both bars shift right
 * of the docked side pane.
 *
 * Logout here is a REAL Emami Apps logout (clears the hub's own emami_apps_* session, and for an
 * SSO session ends the Microsoft session too via SAML Single Logout) — see hubLogoutUrl()'s
 * comment. That's deliberately different from every other embedded app's own Logout button today
 * (Non CTC Expense, RC Portal), which only end that one sub-app's session and leave the hub
 * itself signed in.
 */
export default function HubActionBar({ onTabs }: { onTabs: boolean }) {
  const { logout } = useAuth();
  const { isTabletUp } = useBreakpoint();
  const [hubEmail, setHubEmail] = useState<string | null>(null);
  const [today] = useState(() => formatDateCompact(new Date()));

  useEffect(() => {
    setHubEmail(getHubEmail());
  }, []);

  const goHome = () => {
    if (typeof window !== "undefined") window.location.href = "/";
  };

  const doLogout = () => {
    const confirmed = typeof window === "undefined" || window.confirm("Log out of Emami Apps entirely?");
    if (!confirmed) return;
    logout();
    if (typeof window !== "undefined") window.location.href = hubLogoutUrl();
  };

  const besideDockedPane = onTabs && isTabletUp;

  return (
    <View style={besideDockedPane && { marginLeft: SIDEBAR_WIDTH }}>
      <Pressable style={styles.backToHubBar} onPress={goHome} accessibilityRole="button" accessibilityLabel="Back to Emami Apps">
        <Ionicons name="arrow-back" size={14} color={HUB.white} />
        <Text style={styles.backToHubText}>Back to Emami Apps</Text>
      </Pressable>

      <View style={styles.titleBar}>
        {onTabs && !isTabletUp && (
          <Pressable style={styles.menuBtn} onPress={openNavDrawer} accessibilityRole="button" accessibilityLabel="Open menu">
            <Ionicons name="menu" size={22} color={HUB.ink} />
          </Pressable>
        )}
        <Text style={styles.title} numberOfLines={1}>Mould Health Inspection</Text>
        <View style={styles.flex1} />
        {isTabletUp && (
          <>
            <View style={styles.infoItem}>
              <Ionicons name="person-circle-outline" size={13} color={HUB.rust} />
              <Text style={styles.infoText} numberOfLines={1}>{hubEmail ? nameFromEmail(hubEmail) : "Guest"}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="calendar-outline" size={13} color={HUB.rust} />
              <Text style={styles.infoText} numberOfLines={1}>{today}</Text>
            </View>
          </>
        )}
        <Pressable style={styles.logoutBtn} onPress={doLogout} accessibilityRole="button" accessibilityLabel="Logout">
          <Ionicons name="log-out-outline" size={14} color={HUB.danger} />
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  backToHubBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: HUB.plum,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backToHubText: {
    color: HUB.white,
    fontSize: 13,
    fontWeight: "600",
  },
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: HUB.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: HUB.border,
  },
  menuBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: HUB.ink,
    flexShrink: 1,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: HUB.border,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
    backgroundColor: HUB.appBg,
  },
  infoText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: HUB.ink,
    maxWidth: 140,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: HUB.border,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  logoutText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: HUB.danger,
  },
});
