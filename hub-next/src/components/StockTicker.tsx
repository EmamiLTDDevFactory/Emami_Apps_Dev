'use client';

import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { colors, fonts, fontWeights } from '../theme/tokens';
import { getEmamiStockQuote, type StockQuote } from '../lib/stockApi';
import { useIsScrolling } from '../hooks/useScrollActivity';

const REFRESH_MS = 60 * 1000;
const SCROLL_DURATION_S = 22; // tuned to read comfortably at this font size

/** A continuously scrolling news-ticker footer for the live Emami Limited share price — the
 * "stock market channel footer" look, sitting glued to the bottom of CompanyPulseCard. Renders
 * the same content twice back-to-back and animates the pair by exactly one copy's width (a
 * translateX(-50%) on a track that's exactly double the content's width) in a loop, so the seam
 * between the last and first copy is invisible — a pure-CSS version of the original's measured
 * pixel-width Animated loop, since CSS's percentage transform is already relative to the track's
 * own (unmeasured) width. */
export default function StockTicker() {
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const isScrolling = useIsScrolling();

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

  const hasPrice = quote?.price != null;
  const changePercent = quote?.changePercent ?? 0;
  const isUp = changePercent >= 0;
  const TrendIcon = isUp ? TrendingUp : TrendingDown;
  const trendColor = isUp ? '#4ADE80' : '#F87171';

  const asOfTime = quote?.asOf
    ? new Date(quote.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const renderBlock = (key: string) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', height: '100%', flexShrink: 0 }}>
      <span style={{ fontSize: 11.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.white, marginLeft: 14 }}>EMAMILTD</span>
      <span style={{ fontSize: 10, fontFamily: fonts.sansRegular, color: '#B9B4E0', marginLeft: 5 }}>{quote?.exchange || 'NSE'}</span>
      {hasPrice ? (
        <>
          <span style={{ fontSize: 11.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.white, marginLeft: 14 }}>
            ₹{quote!.price!.toFixed(2)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 8 }}>
            <TrendIcon size={11} color={trendColor} />
            <span style={{ fontSize: 11.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: trendColor }}>
              {isUp ? '+' : ''}
              {changePercent.toFixed(2)}%
            </span>
          </span>
          {quote?.yearHigh != null && quote?.yearLow != null && (
            <span style={{ fontSize: 10.5, fontFamily: fonts.sansRegular, color: '#B9B4E0', marginLeft: 14 }}>
              52W H ₹{quote.yearHigh.toFixed(2)} · L ₹{quote.yearLow.toFixed(2)}
            </span>
          )}
          {asOfTime && <span style={{ fontSize: 10.5, fontFamily: fonts.sansRegular, color: '#B9B4E0', marginLeft: 14 }}>As of {asOfTime}</span>}
        </>
      ) : (
        <span style={{ fontSize: 10.5, fontFamily: fonts.sansRegular, color: '#B9B4E0', marginLeft: 14 }}>Live price unavailable right now</span>
      )}
      <span style={{ fontSize: 12, color: '#4F3FD6', marginLeft: 14 }}>•</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 34, backgroundColor: colors.plum, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: '100%', padding: '0 10px', backgroundColor: '#DC2626', flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white }} />
        <span style={{ fontSize: 10, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.6, color: colors.white }}>LIVE</span>
      </div>
      <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
        <div
          className="stock-ticker-track"
          style={{
            display: 'flex',
            height: '100%',
            width: 'max-content',
            animationPlayState: isScrolling ? 'paused' : 'running',
          }}
        >
          {renderBlock('a')}
          {renderBlock('b')}
        </div>
      </div>
      <style jsx>{`
        .stock-ticker-track {
          animation: stock-ticker-scroll ${SCROLL_DURATION_S}s linear infinite;
        }
        @keyframes stock-ticker-scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
