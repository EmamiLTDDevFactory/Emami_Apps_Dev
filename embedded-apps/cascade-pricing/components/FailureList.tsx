'use client';
import type { FailureItem } from '@/lib/types';

/** Rows CREATE_COND / SAVE_RATES could not process; shown only when there are any. */
export default function FailureList({ items, onClose }: { items: FailureItem[]; onClose: () => void }) {
  if (!items.length) return null;
  const th = 'sticky top-0 border-b border-red-200 bg-red-50 px-2 py-1 text-left text-2xs font-semibold uppercase tracking-wide text-red-800';
  const td = 'border-b border-red-100 px-2 py-1 align-top';
  return (
    <section className="glass mt-2 overflow-hidden rounded-2xl !border-red-200/80" aria-labelledby="failed-title">
      <div className="flex items-center justify-between border-b border-red-200/70 bg-red-50/80 px-4 py-2">
        <h3 id="failed-title" className="text-xs font-semibold text-red-800">Failed items <span className="font-normal">· {items.length}</span></h3>
        <button type="button" onClick={onClose} className="rounded px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-white" aria-label="Close failed items">Close</button>
      </div>
      <div className="max-h-52 overflow-auto">
        <table className="min-w-full text-xs" aria-label="Failed items">
          <thead><tr><th className={th}>Sales Org.</th><th className={th}>Customer</th><th className={th}>Material</th><th className={th}>Condition</th><th className={th}>Message</th></tr></thead>
          <tbody>
            {items.map((f, i) => (
              <tr key={`${f.KUNNR}|${f.MATNR}|${f.KSCHL}|${i}`}>
                <td className={td}>{f.VKORG}</td><td className={td}>{f.KUNNR}</td><td className={`${td} font-mono`}>{f.MATNR}</td><td className={td}>{f.KSCHL}</td><td className={`${td} text-red-700`}>{f.MESSAGE}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
