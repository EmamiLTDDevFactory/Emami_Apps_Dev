import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Building2, TrendingUp, TrendingDown } from 'lucide-react-native';
import { colors, fonts, radii } from '../theme/tokens';
import { getEmamiStockQuote, type StockQuote } from '../lib/stockApi';

const REFRESH_MS = 60 * 1000;

const ABOUT_EMAMI =
  "Emami Limited is one of India's leading FMCG companies and part of the Emami Group, with a " +
  'trusted portfolio of personal care, health care, and beauty brands sold across India and ' +
  'internationally.';

/** Sits right below the "Good morning" greeting on Home — a short company blurb plus a live
 * NSE/BSE share quote (backend/stockQuote.js proxies IndianAPI, refreshed every minute here). */
export default function CompanyPulseCard() {
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const q = await getEmamiStockQuote();
      if (cancelled) return;
      setLoading(false);
      setQuote(q);
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const hasPrice = quote?.price != null;
  const changePercent = quote?.changePercent ?? 0;
  const isUp = changePercent >= 0;
  const TrendIcon = isUp ? TrendingUp : TrendingDown;
  const trendColor = isUp ? colors.green : '#DC2626';

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

      <View style={styles.divider} />

      <View style={styles.stockCol}>
        <Text style={styles.stockLabel}>EMAMILTD · {quote?.exchange || 'NSE'}</Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.rust} style={styles.stockLoader} />
        ) : !hasPrice ? (
          <Text style={styles.unavailable}>Live price unavailable right now.</Text>
        ) : (
          <>
            <Text style={styles.price}>₹{quote!.price!.toFixed(2)}</Text>
            <View style={styles.trendRow}>
              <TrendIcon size={13} color={trendColor} />
              <Text style={[styles.trendText, { color: trendColor }]}>
                {isUp ? '+' : ''}
                {changePercent.toFixed(2)}%
              </Text>
              <Text style={styles.trendPeriod}>today</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    marginBottom: 20,
    overflow: 'hidden',
  },
  aboutCol: {
    flex: 2,
    minWidth: 220,
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
  divider: {
    width: 1,
    backgroundColor: colors.border,
  },
  stockCol: {
    flex: 1,
    minWidth: 160,
    padding: 16,
    justifyContent: 'center',
    backgroundColor: colors.appBg,
  },
  stockLabel: {
    fontSize: 10,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.5,
    color: colors.inkSoft,
    marginBottom: 6,
  },
  stockLoader: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  unavailable: {
    fontSize: 11.5,
    fontFamily: fonts.sansMedium,
    color: colors.inkSoft,
  },
  price: {
    fontSize: 20,
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  trendText: {
    fontSize: 12.5,
    fontFamily: fonts.sansSemiBold,
  },
  trendPeriod: {
    fontSize: 11,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    marginLeft: 2,
  },
});
