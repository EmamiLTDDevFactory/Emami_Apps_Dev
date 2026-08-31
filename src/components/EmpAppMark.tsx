import React from 'react';
import { Image, StyleSheet } from 'react-native';

interface EmpAppMarkProps {
  /** Rendered width in px — height follows the logo's own aspect ratio. */
  size?: number;
}

// Real aspect ratio of assets/emami-apps-logo.png (2272x1880 ≈ 1.208:1). This is the one
// "Emami Apps" logo used everywhere in the hub (also shown on LoginScreen) — do not swap in a
// different logo asset here, or the app goes back to showing two different logos.
const ASPECT_RATIO = 1.208;

export default function EmpAppMark({ size = 30 }: EmpAppMarkProps) {
  return (
    <Image
      source={require('../../assets/emami-apps-logo.png')}
      style={[styles.mark, { width: size, height: size / ASPECT_RATIO }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: '#FFFFFF',
  },
});
