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
}

const PANE_WIDTH = 280;

/** Slide-in navigation drawer (Home / History) — identical copy of Market Rate's own
 * src/components/SidePane.tsx. Built on core Animated (no reanimated/haptics dep) since neither
 * app otherwise depends on either. */
export default function SidePane({ isOpen, onClose, title, subtitle, items, activeHref, onNavigate }: SidePaneProps) {
  const translateX = useRef(new Animated.Value(-PANE_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = React.useState(isOpen);

  useEffect(() => {
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
  }, [isOpen]);

  if (!rendered) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} pointerEvents={isOpen ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View style={[styles.pane, { transform: [{ translateX }] }]}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Image
              source={require('../../assets/images/emami-apps-logo.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close menu">
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
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
    backgroundColor: 'rgba(31,27,51,0.55)',
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
  header: {
    // White (not the dark plum this used to be) — the Emami Apps logo is dark artwork meant for a
    // light background, same as the title bar it also appears in; on plum it was unreadable.
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: Platform.OS === 'ios' ? 54 : 32,
    paddingBottom: 18,
    paddingHorizontal: 18,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogo: {
    width: 100,
    height: 30,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 16,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  items: {
    padding: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    marginBottom: 4,
  },
  itemActive: {
    backgroundColor: `${colors.rust}14`,
  },
  itemText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  itemTextActive: {
    color: colors.rust,
  },
});
