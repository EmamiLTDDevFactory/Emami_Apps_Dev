import React from 'react';
import { colors, radii } from '../theme/tokens';
import StockTicker from './StockTicker';

/** Sits on Home just under the greeting — a live NSE/BSE share quote scrolling like a
 * stock-news channel footer ticker (see StockTicker.tsx; backend/stockQuote.js proxies the
 * upstream quote, refreshed every minute). */
export default function CompanyPulseCard() {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, backgroundColor: colors.white, marginBottom: 12, overflow: 'hidden' }}>
      <StockTicker />
    </div>
  );
}
