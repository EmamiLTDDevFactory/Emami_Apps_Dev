const TZ = 'Asia/Kolkata';

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });

/** "just now", "3 hours ago", "4 days ago", or the date for anything older than a month */
export function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} day${d > 1 ? 's' : ''} ago`;
  return fmtDate(iso);
}

export const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: TZ });

export const fmtMoney = (value: string, currency: string) =>
  value ? `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${currency}` : '—';
