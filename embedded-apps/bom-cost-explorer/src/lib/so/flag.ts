/** Sales price (latest sales order) page and the "Compare with cost (SAP)" button. Off by default. */
export const COGM_SO_ENABLED = String(process.env.NEXT_PUBLIC_COGM_SO_ENABLED ?? 'false').toLowerCase() === 'true';
/** A selected order older than this many days is flagged stale. */
export const SO_STALE_DAYS = (() => {
  const n = Number(process.env.NEXT_PUBLIC_SO_STALE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 60;
})();
