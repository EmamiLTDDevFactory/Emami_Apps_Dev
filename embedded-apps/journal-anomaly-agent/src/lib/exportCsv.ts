import type { WorklistEntry } from '../types';

/** Client-side CSV export (same approach as every sibling embedded app's own CSV export) — "PDF"
 * just triggers the browser's own print dialog, matching the source prototype's own doExport. */
export function doExport(kind: string, items: WorklistEntry[], toast: (m: string) => void): void {
  if (kind === 'PDF') {
    window.print();
    return;
  }
  const rows = items
    .map((x) => [x.document, x.companyCode, x.period ?? '', x.userName, x.glPair, x.amount, x.risk, x.score, x.signal].map((v) => `"${v}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿Document,Company,Period,User,GL Pair,Amount,Risk,Score,Signal\n' + rows], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `JE_GL_Anomaly_${kind}.csv`;
  a.click();
  toast(`${kind} export generated`);
}
