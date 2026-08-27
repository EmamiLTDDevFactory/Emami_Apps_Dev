import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Building2 } from 'lucide-react-native';
import { colors, fonts, radii } from '../theme/tokens';
import StockTicker from './StockTicker';

const ABOUT_EMAMI =
  "Emami Limited is one of India's leading FMCG companies and part of the Emami Group, with a " +
  'trusted portfolio of personal care, health care, and beauty brands sold across India and ' +
  'internationally.';

/** Sits right below the "Good morning" greeting on Home — a short company blurb, with a live
 * NSE/BSE share quote scrolling along the bottom like a stock-news channel footer ticker
 * (see StockTicker.tsx; backend/stockQuote.js proxies the upstream quote, refreshed every minute). */
export default function CompanyPulseCard() {
  return (
    <View style={styles.wrap}>
      <View style={styles.aboutCol}>
        <View style={styles.aboutHeaderRow}>
          <View style={styles.aboutIconBox}>
            <Building2 size={13} color={colors.rust} />
          </View>
          <Text style={styles.aboutLabel}>About Emami Limited</Text>
        </View>
        <Text style={styles.aboutText}>{ABOUT_EMAMI}</Text>
      </View>

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
  aboutCol: {
    padding: 16,
  },
  aboutHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  aboutIconBox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutLabel: {
    fontSize: 11,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  aboutText: {
    fontSize: 12.5,
    fontFamily: fonts.sansRegular,
    color: colors.ink,
    lineHeight: 18,
  },
});
