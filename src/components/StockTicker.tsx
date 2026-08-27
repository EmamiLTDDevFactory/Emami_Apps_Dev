import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { colors, fonts } from '../theme/tokens';
import { getEmamiStockQuote, type StockQuote } from '../lib/stockApi';

const REFRESH_MS = 60 * 1000;
const PX_PER_SECOND = 55; // scroll speed — tuned to read comfortably at this font size
const MIN_DURATION_MS = 9000;

/** A continuously scrolling news-ticker footer for the live Emami Limited share price — the
 * "stock market channel footer" look, sitting glued to the bottom of CompanyPulseCard. Renders
 * the same content twice back-to-back and animates the pair by exactly one copy's width in a
 * loop, so the seam between the last and first copy is invisible. */
export default function StockTicker() {
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [blockWidth, setBlockWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const q = await getEmamiStockQuote();
      if (!cancelled) setQuote(q);
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!blockWidth) return;
    translateX.setValue(0);
    const duration = Math.max(MIN_DURATION_MS, (blockWidth / PX_PER_SECOND) * 1000);
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: -blockWidth,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [blockWidth, translateX]);

  const hasPrice = quote?.price != null;
  const changePercent = quote?.changePercent ?? 0;
  const isUp = changePercent >= 0;
  const TrendIcon = isUp ? TrendingUp : TrendingDown;
  const trendColor = isUp ? '#4ADE80' : '#F87171';

  const asOfTime = quote?.asOf
    ? new Date(quote.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const renderBlock = (key: string) => (
    <View style={styles.block} key={key}>
      <Text style={styles.symbol}>EMAMILTD</Text>
      <Text style={styles.exchange}>{quote?.exchange || 'NSE'}</Text>
      {hasPrice ? (
        <>
          <Text style={styles.price}>₹{quote!.price!.toFixed(2)}</Text>
          <View style={styles.trendChip}>
            <TrendIcon size={11} color={trendColor} />
            <Text style={[styles.trendText, { color: trendColor }]}>
              {isUp ? '+' : ''}
              {changePercent.toFixed(2)}%
            </Text>
          </View>
          {quote?.yearHigh != null && quote?.yearLow != null && (
            <Text style={styles.meta}>
              52W H ₹{quote.yearHigh.toFixed(2)} · L ₹{quote.yearLow.toFixed(2)}
            </Text>
          )}
          {asOfTime && <Text style={styles.meta}>As of {asOfTime}</Text>}
        </>
      ) : (
        <Text style={styles.meta}>Live price unavailable right now</Text>
      )}
      <Text style={styles.dot}>•</Text>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
      <View style={styles.viewport}>
        <Animated.View style={[styles.track, { transform: [{ translateX }] }]}>
          <View
            onLayout={(e) => setBlockWidth(e.nativeEvent.layout.width)}
            style={styles.blockRow}
          >
            {renderBlock('a')}
          </View>
          <View style={styles.blockRow}>{renderBlock('b')}</View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    backgroundColor: colors.plum,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: '100%',
    paddingHorizontal: 10,
    backgroundColor: '#DC2626',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  liveText: {
    fontSize: 10,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.6,
    color: colors.white,
  },
  viewport: {
    flex: 1,
    height: '100%',
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
    height: '100%',
  },
  blockRow: {
    flexDirection: 'row',
  },
  block: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  symbol: {
    fontSize: 11.5,
    fontFamily: fonts.sansBold,
    color: colors.white,
    marginLeft: 14,
  },
  exchange: {
    fontSize: 10,
    fontFamily: fonts.sansRegular,
    color: '#B9B4E0',
    marginLeft: 5,
  },
  price: {
    fontSize: 11.5,
    fontFamily: fonts.sansBold,
    color: colors.white,
    marginLeft: 14,
  },
  trendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 8,
  },
  trendText: {
    fontSize: 11.5,
    fontFamily: fonts.sansSemiBold,
  },
  meta: {
    fontSize: 10.5,
    fontFamily: fonts.sansRegular,
    color: '#B9B4E0',
    marginLeft: 14,
  },
  dot: {
    fontSize: 12,
    color: '#4F3FD6',
    marginLeft: 14,
  },
});
