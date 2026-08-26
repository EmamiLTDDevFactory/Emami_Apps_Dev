import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, AccessibilityInfo, Platform } from 'react-native';
import { Star, Lock } from 'lucide-react-native';
import type { AppItem } from '../types';
import { colors, fonts, radii, appColor, motion, focusRingWeb } from '../theme/tokens';

interface AppCardProps {
  app: AppItem;
  isFavorite: boolean;
  isTopUsed: boolean;
  onPress: (app: AppItem) => void;
  onToggleFavorite: (id: string) => void;
  /** Not granted to this user (see useUnlockedAppIds) — renders dimmed with a lock badge and
   * ignores taps instead of opening the app. */
  locked?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AppCard({ app, isFavorite, isTopUsed, onPress, onToggleFavorite, locked }: AppCardProps) {
  const Icon = app.icon;
  const accent = appColor(app.id);

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
      onPress={() => { if (!locked) onPress(app); }}
      onPressIn={() => !locked && animate(motion.pressScale, 0.18)}
      onPressOut={() => !locked && animate(hovered ? motion.hoverScale : 1, hovered ? 0.14 : 0.1)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...(locked ? {} : webHoverProps)}
      style={[
        styles.card,
        { shadowColor: accent, shadowOpacity, transform: [{ scale }] },
        focused && !locked && focusRingWeb,
        locked && styles.cardLocked,
      ]}
      android_ripple={locked ? undefined : { color: `${accent}14` }}
      // "link" (not "button") — react-native-web renders accessibilityRole="button"
      // as a literal <button>, and this card wraps another real <button> (the
      // favorite-star toggle below); nesting <button> inside <button> is invalid
      // HTML and was throwing a hydration/nesting error on every app card.
      accessibilityRole="link"
      accessibilityLabel={locked ? `${app.name} — locked. Contact your admin for access.` : `Open ${app.name}`}
      accessibilityState={{ disabled: !!locked }}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconBox, { backgroundColor: locked ? colors.border : `${accent}1f` }]}>
          <Icon size={19} color={locked ? colors.inkSoft : accent} strokeWidth={2.1} />
        </View>
        {locked ? (
          <View style={styles.lockBadge}>
            <Lock size={13} color={colors.inkSoft} strokeWidth={2} />
          </View>
        ) : (
          <Pressable
            hitSlop={10}
            onPress={() => onToggleFavorite(app.id)}
            style={styles.favBtn}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? `Remove ${app.name} from favorites` : `Add ${app.name} to favorites`}
          >
            <Star size={16} color={isFavorite ? colors.amber : colors.border} fill={isFavorite ? colors.amber : 'transparent'} strokeWidth={1.8} />
          </Pressable>
        )}
      </View>

      <Text style={[styles.title, locked && styles.textLocked]} numberOfLines={1}>{app.name}</Text>

      {isTopUsed && !locked && (
        <View style={[styles.miniBadge, { backgroundColor: `${accent}14` }]}>
          <Text style={[styles.miniBadgeText, { color: accent }]}>Most used</Text>
        </View>
      )}
      {locked && (
        <View style={styles.miniBadge}>
          <Text style={styles.lockedBadgeText}>Locked</Text>
        </View>
      )}

      <Text style={[styles.desc, locked && styles.textLocked]} numberOfLines={2}>{app.desc}</Text>
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
  cardLocked: {
    backgroundColor: colors.appBg,
    opacity: 0.65,
  },
  lockBadge: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    backgroundColor: colors.appBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textLocked: {
    color: colors.inkSoft,
  },
  lockedBadgeText: {
    fontSize: 9,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.inkSoft,
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
  favBtn: {
    padding: 4,
  },
  title: {
    fontSize: 14.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
    marginTop: 14,
  },
  miniBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
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
