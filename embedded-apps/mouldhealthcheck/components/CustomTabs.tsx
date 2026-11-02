import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { useBreakpoint, SIDEBAR_WIDTH } from "@/utils/responsive";
import { closeNavDrawer, useNavDrawerOpen } from "@/lib/navDrawer";

// The Emami Apps hub palette (hub-next/src/theme/tokens.ts) — the same values every other embedded
// app's side pane uses (e.g. market-rate/src/theme/tokens.ts), so this pane matches them exactly
// rather than this app's own slightly different indigo.
const HUB = {
  rust: "#4F3FD6",
  ink: "#1F1B33",
  inkSoft: "#6B7280",
  border: "#E6E3F5",
  white: "#FFFFFF",
};

type TabMeta = { label: string; icon: keyof typeof Ionicons.glyphMap };

/**
 * This app's navigation, rendered as the (tabs) navigator's tabBar but laid out as the same side
 * pane every other embedded app has (market-rate/src/components/SidePane.tsx): white panel, Emami
 * Apps logo, app name, then the nav rows with an indigo-tinted active row.
 *  - Tablet width and up: docked on the left, full height. Every (tabs) screen already pads itself
 *    by SIDEBAR_WIDTH; HubActionBar shifts the top bars over by the same amount.
 *  - Phone width: a slide-in drawer opened from HubActionBar's menu button (replacing the old
 *    bottom tab bar), with a backdrop and close button.
 */
export default function CustomTabs({ state, navigation }: BottomTabBarProps) {
  const { user } = useAuth();
  const { isTabletUp } = useBreakpoint();
  const drawerOpen = useNavDrawerOpen();

  // "Insights" reads as "Submission History" for the vendor who submitted the inspections, and
  // "Approval History" for the admin reviewing/approving them — same screen, role-specific label.
  const TABS: Record<string, TabMeta> = {
    index: { label: "Home", icon: "home-outline" },
    statistics: { label: user?.Role === "Admin" ? "Approval History" : "Submission History", icon: "bar-chart-outline" },
    admindashboard: { label: "Dashboard", icon: "grid-outline" },
  };

  const visibleRoutes = state.routes
    .map((route, index) => ({ route, index, meta: TABS[route.name] }))
    .filter(({ route, meta }) => !!meta && !(route.name === "admindashboard" && user?.Role !== "Admin"));

  const navigateTo = (route: (typeof visibleRoutes)[number]["route"], focused: boolean) => {
    closeNavDrawer();
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  // Leaving phone width with the drawer open would otherwise leave it "open" for next time.
  useEffect(() => {
    if (isTabletUp) closeNavDrawer();
  }, [isTabletUp]);

  const paneContent = (showClose: boolean) => (
    <>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable
            onPress={() => { if (typeof window !== "undefined") window.location.href = "/"; }}
            accessibilityRole="link"
            accessibilityLabel="Back to Emami Apps"
          >
            <Image source={require("../assets/images/emami-apps-logo.png")} style={styles.headerLogo} resizeMode="contain" />
          </Pressable>
          {showClose && (
            <Pressable onPress={closeNavDrawer} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close menu">
              <Ionicons name="close" size={18} color={HUB.ink} />
            </Pressable>
          )}
        </View>
        <Text style={styles.headerTitle}>Mould Health Inspection</Text>
      </View>

      <View style={styles.items}>
        {visibleRoutes.map(({ route, index, meta }) => {
          const active = state.index === index;
          return (
            <Pressable
              key={route.key}
              onPress={() => navigateTo(route, active)}
              style={[styles.item, active && styles.itemActive]}
              accessibilityRole="button"
              accessibilityLabel={meta!.label}
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={meta!.icon} size={17} color={active ? HUB.rust : HUB.inkSoft} />
              <Text style={[styles.itemText, active && styles.itemTextActive]}>{meta!.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  if (isTabletUp) {
    return <View style={styles.paneDocked}>{paneContent(false)}</View>;
  }

  return <PhoneDrawer isOpen={drawerOpen}>{paneContent(true)}</PhoneDrawer>;
}

/** Same slide/fade timings as the other apps' SidePane overlay mode. Stays mounted through its
 * close animation instead of vanishing mid-slide. */
function PhoneDrawer({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -SIDEBAR_WIDTH, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setRendered(false));
    }
  }, [isOpen]);

  if (!rendered) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} pointerEvents={isOpen ? "auto" : "none"}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeNavDrawer} accessibilityRole="button" accessibilityLabel="Close menu" />
      </Animated.View>
      <Animated.View style={[styles.paneDrawer, { transform: [{ translateX }] }]}>{children}</Animated.View>
    </View>
  );
}

// The tab bar is rendered inside the (tabs) navigator, below the root layout's top bars — `fixed`
// (web) lets the docked pane span the full window height and the drawer cover the whole screen,
// the same way the other apps' pane sits beside their top bars rather than under them.
const FIXED = (Platform.OS === "web" ? "fixed" : "absolute") as "absolute";

const styles = StyleSheet.create({
  paneDocked: {
    position: FIXED,
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: HUB.white,
    borderRightWidth: 1,
    borderRightColor: HUB.border,
    zIndex: 20,
  },
  overlay: {
    position: FIXED,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    elevation: 999,
  },
  backdrop: {
    backgroundColor: "rgba(31,27,51,0.35)",
  },
  paneDrawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: HUB.white,
    ...Platform.select({
      web: { boxShadow: "2px 0 16px rgba(31,27,51,0.18)" } as object,
      default: { shadowColor: "#241E3D", shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8 },
    }),
  },
  header: {
    backgroundColor: HUB.white,
    borderBottomWidth: 1,
    borderBottomColor: HUB.border,
    paddingTop: Platform.OS === "ios" ? 54 : 24,
    paddingBottom: 14,
    paddingHorizontal: 14,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLogo: {
    width: 150,
    height: 124.2,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: HUB.ink,
    marginTop: 12,
  },
  items: {
    padding: 10,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  itemActive: {
    backgroundColor: `${HUB.rust}14`,
  },
  itemText: {
    fontSize: 13,
    fontWeight: "600",
    color: HUB.inkSoft,
  },
  itemTextActive: {
    color: HUB.rust,
  },
});
