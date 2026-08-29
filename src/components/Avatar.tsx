import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '../theme/tokens';

interface AvatarProps {
  name: string;
  size?: number;
  /** Data URI or URL of the user's uploaded profile photo — falls back to initials when absent. */
  photoUrl?: string | null;
}

export default function Avatar({ name, size = 36, photoUrl }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  return (
    <LinearGradient
      colors={[colors.amber, colors.rust]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={{ color: colors.white, fontFamily: fonts.sansSemiBold, fontSize: size * 0.38 }}>
        {initials}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
