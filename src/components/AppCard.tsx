import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, AccessibilityInfo, Platform } from 'react-native';
import { Star, Lock } from 'lucide-react-native';
import type { AppItem } from '../types';
import { colors, fonts, radii, appColor, motion, focusRingWeb } from '../theme/tokens';
import { useIsMobile } from '../hooks/useColumnCount';

interface AppCardProps {
  app: AppItem;
  isFavorite: boolean;
  isTopUsed: boolean;
  /** True when the signed-in user has no grant for this app (see useUnlockedAppIds) — the tile
   * still renders (every app is now always visible), just dimmed with a "Locked" badge instead of
   * the accent color/most-used badge. Still tappable: the caller's onPress is expected to route to
   * a "you don't have access" message (see AppDetailScreen's own locked state) rather than opening
   * the real app. */
  locked?: boolean;
  onPress: (app: AppItem) => void;
  onToggleFavorite: (id: string) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AppCard({ app, isFavorite, isTopUsed, locked = false, onPress, onToggleFavorite }: AppCardProps) {
  const Icon = app.icon;
  const accent = locked ? colors.inkSoft : appColor(app.id);
  const isMobile = useIsMobile();

  const [reduceMotion, setReduceMotion] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const shadowOpacity = useRef(new Animated.Value(0.1)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduceMotion(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const animate = (toScale: number, toShadow: number) => {
    if (reduceMotion) {
      scale.setValue(toScale);
      shadowOpacity.setValue(toShadow);
      return;
    }
    Animated.parallel([
      Animated.timing(scale, { toValue: toScale, duration: motion.duration.fast, easing: motion.easing.standard, useNativeDriver: true }),
      Animated.timing(shadowOpacity, { toValue: toShadow, duration: motion.duration.fast, easing: motion.easing.standard, useNativeDriver: false }),
    ]).start();
  };

  // react-native-web-only hover feedback; no-op props on native.
  const webHoverProps =
    Platform.OS === 'web'
      ? ({
          onHoverIn: () => {
            setHovered(true);
            animate(motion.hoverScale, 0.14);
          },
          onHoverOut: () => {
            setHovered(false);
            animate(1, 0.1);
          },
        } as any)
      : {};

  return (
    <AnimatedPressable
      onPress={() => onPress(app)}
      onPressIn={() => animate(motion.pressScale, 0.18)}
      onPressOut={() => animate(hovered ? motion.hoverScale : 1, hovered ? 0.14 : 0.1)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...webHoverProps}
      style={[
        styles.card,
        isMobile && styles.cardMobile,
        locked && styles.cardLocked,
        { shadowColor: accent, shadowOpacity, transform: [{ scale }] },
        focused && focusRingWeb,
      ]}
      android_ripple={{ color: `${accent}14` }}
      // "link" (not "button") — react-native-web renders accessibilityRole="button"
      // as a literal <button>, and this card wraps another real <button> (the
      // favorite-star toggle below); nesting <button> inside <button> is invalid
      // HTML and was throwing a hydration/nesting error on every app card.
      accessibilityRole="link"
      accessibilityLabel={locked ? `${app.name}, locked — you don't have access` : `Open ${app.name}`}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconBox, isMobile && styles.iconBoxMobile, { backgroundColor: `${accent}1f` }]}>
          {locked ? <Lock size={isMobile ? 14 : 17} color={accent} strokeWidth={2.1} /> : <Icon size={isMobile ? 16 : 19} color={accent} strokeWidth={2.1} />}
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => onToggleFavorite(app.id)}
          style={styles.favBtn}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? `Remove ${app.name} from favorites` : `Add ${app.name} to favorites`}
        >
          <Star size={16} color={isFavorite ? colors.amber : colors.border} fill={isFavorite ? colors.amber : 'transparent'} strokeWidth={1.8} />
        </Pressable>
      </View>

      {/* Mobile shows the full app name (no truncation) per instruction — desktop/tablet keeps
          the single-line-with-ellipsis it already had, since card width there is generous enough
          that a long name truncating was never actually a problem there. */}
      <Text style={[styles.title, locked && styles.titleLocked, isMobile && styles.titleMobile]} numberOfLines={isMobile ? undefined : 1}>
        {app.name}
      </Text>

      {locked ? (
        <View style={[styles.miniBadge, styles.lockedBadge]}>
          <Lock size={8} color={colors.inkSoft} strokeWidth={2.4} />
          <Text style={[styles.miniBadgeText, { color: colors.inkSoft }]}>Locked</Text>
        </View>
      ) : (
        isTopUsed && (
          <View style={[styles.miniBadge, { backgroundColor: `${accent}14` }]}>
            <Text style={[styles.miniBadgeText, { color: accent }]}>Most used</Text>
          </View>
        )
      )}

      {!isMobile && <Text style={styles.desc} numberOfLines={2}>{app.desc}</Text>}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 16,
    minHeight: 150,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  // Compact mobile-only variant: smaller padding/min-height (the description is hidden on mobile
  // instead, see the render above) so a card holds a full, unclipped app name without growing
  // tall — a phone-width grid has less room per tile than desktop/tablet, so this trims the
  // chrome around the name rather than shrinking the name itself.
  cardMobile: {
    padding: 10,
    minHeight: 92,
    borderRadius: radii.lg,
  },
  // Dims the whole tile (icon/badge already turn gray via the `accent` swap above) so a locked
  // app reads as unavailable at a glance, without hiding it from the grid entirely.
  cardLocked: {
    opacity: 0.6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxMobile: {
    width: 30,
    height: 30,
  },
  favBtn: {
    padding: 4,
  },
  title: {
    fontSize: 14.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
    marginTop: 14,
  },
  titleMobile: {
    fontSize: 12.5,
    marginTop: 8,
    lineHeight: 16,
  },
  titleLocked: {
    color: colors.inkSoft,
  },
  miniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  lockedBadge: {
    backgroundColor: colors.appBg,
  },
  miniBadgeText: {
    fontSize: 9,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  desc: {
    fontSize: 12.5,
    color: colors.inkSoft,
    fontFamily: fonts.sansRegular,
    lineHeight: 18,
    marginTop: 8,
  },
});
