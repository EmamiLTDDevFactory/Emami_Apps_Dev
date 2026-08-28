import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radii } from '../theme/tokens';
import StockTicker from './StockTicker';

/** Sits at the very top of Home, above the greeting — a live NSE/BSE share quote scrolling like a
 * stock-news channel footer ticker (see StockTicker.tsx; backend/stockQuote.js proxies the
 * upstream quote, refreshed every minute). */
export default function CompanyPulseCard() {
  return (
    <View style={styles.wrap}>
      <StockTicker />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    marginBottom: 20,
    overflow: 'hidden',
  },
});
