// Live Emami Limited share quote (Home page's stock ticker) — proxied through the
// Postgres-reachable backend's /stock/emami route (backend/stockQuote.js), never called directly
// from the browser: the upstream provider (IndianAPI) needs a secret API key that can't safely
// live in client-side code. Same backend Manage Access already uses (NEXT_PUBLIC_ACCESS_API_URL).
const ACCESS_API_URL =
  process.env.NEXT_PUBLIC_ACCESS_API_URL || process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:4000/api';

export interface StockQuote {
  companyName: string;
  exchange: string;
  price: number | null;
  changePercent: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  asOf: string;
}

export async function getEmamiStockQuote(): Promise<StockQuote | null> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/stock/emami`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return null;
    const { success: _success, ...quote } = data;
    return quote as StockQuote;
  } catch {
    return null;
  }
}
