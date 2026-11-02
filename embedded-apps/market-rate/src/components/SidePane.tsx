import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme/tokens';

export interface SidePaneItem {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface SidePaneProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: SidePaneItem[];
  activeHref: string;
  onNavigate: (href: string) => void;
  /** Mirrors the hub's own `drawerType: 'permanent'` (DrawerNavigator.tsx) on a wide viewport — the
   * pane becomes an in-flow flex sibling of the page content (see _layout.tsx's row container)
   * instead of an absolutely-positioned overlay, so content is pushed aside rather than hidden
   * underneath it. No backdrop, no slide animation, no close button — it's just always there. */
  permanent?: boolean;
}

// Matches the hub's own drawer width (DrawerNavigator.tsx) so both side panes feel like the same
// component family.
const PANE_WIDTH = 218;

/** Slide-in navigation drawer shared by this app's screens — replaces a top pill nav bar so the
 * per-screen options (Home / Change History / Master Data) live behind a menu button instead of
 * eating horizontal space on every page. Built on core Animated (no reanimated/haptics dep, unlike
 * MoldHealthCheck's SidePane) since this app doesn't otherwise depend on either. */
export default function SidePane({ isOpen, onClose, title, subtitle, items, activeHref, onNavigate, permanent }: SidePaneProps) {
  const translateX = useRef(new Animated.Value(-PANE_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Keep the pane mounted through its close animation instead of unmounting the instant isOpen
  // flips false — otherwise it vanishes mid-slide instead of animating out.
  const [rendered, setRendered] = React.useState(permanent || isOpen);

  useEffect(() => {
    if (permanent) return; // docked mode is always fully visible — nothing to animate
    if (isOpen) {
      setRendered(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -PANE_WIDTH, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setRendered(false));
    }
  }, [isOpen, permanent]);

  if (!permanent && !rendered) return null;

  const paneContent = (
    <>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable
            onPress={() => { if (typeof window !== 'undefined') window.location.href = '/'; }}
            accessibilityRole="link"
            accessibilityLabel="Back to Emami Apps"
          >
            <Image
              source={require('../../assets/images/emami-apps-logo.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </Pressable>
          {!permanent && (
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close menu">
              <Ionicons name="close" size={18} color={colors.ink} />
            </Pressable>
          )}
        </View>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>

      <View style={styles.items}>
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Pressable
              key={item.href}
              onPress={() => onNavigate(item.href)}
              style={[styles.item, active && styles.itemActive]}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={item.icon} size={17} color={active ? colors.rust : colors.inkSoft} />
              <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  if (permanent) {
    return <View style={styles.paneStatic}>{paneContent}</View>;
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} pointerEvents={isOpen ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View style={[styles.pane, { transform: [{ translateX }] }]}>
        {paneContent}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
  },
  backdrop: {
    backgroundColor: 'rgba(31,27,51,0.35)',
  },
  pane: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: PANE_WIDTH,
    backgroundColor: colors.white,
    ...Platform.select({
      web: { boxShadow: '2px 0 16px rgba(31,27,51,0.18)' },
      default: { shadowColor: colors.plum, shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8 },
    }),
  },
  // In-flow docked sidebar for wide viewports — a normal flex sibling (position: 'relative', fixed
  // width) instead of the absolute-positioned `pane` above, so it occupies real space in the row
  // and the content next to it gets pushed over rather than covered.
  paneStatic: {
    position: 'relative',
    width: PANE_WIDTH,
    backgroundColor: colors.white,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  header: {
    // White (not the dark plum this used to be) — the Emami Apps logo is dark artwork meant for a
    // light background, same as the title bar it also appears in; on plum it was unreadable.
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingBottom: 14,
    paddingHorizontal: 14,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Scaled down from the hub sidebar's logo (EmpAppMark size={172} in CustomDrawerContent, same
  // source PNG, ~1.208:1) to fit this pane's compacted 218px width alongside the close button.
  headerLogo: {
    width: 150,
    height: 124.2,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
  },
  items: {
    padding: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radii.lg,
    marginBottom: 4,
  },
  itemActive: {
    backgroundColor: `${colors.rust}14`,
  },
  itemText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  itemTextActive: {
    color: colors.rust,
  },
});
