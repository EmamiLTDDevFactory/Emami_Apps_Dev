'use client';

import React from 'react';
import { Inbox } from 'lucide-react';
import type { PaymentTrackingRow } from '../lib/paymentTrackingApi';
import { formatDeliveryDate } from '../lib/provisionMetrics';
import { TableWrap, cx } from './ui';

interface Field {
  label: string;
  strong?: boolean;
  /** Web-only presentation hints: right-align amounts, mono for document numbers. */
  align?: 'right';
  mono?: boolean;
  get: (row: PaymentTrackingRow) => string;
}

// Exactly the fields Provision Tracking needs, per instruction — every other field
// paymentTrackingApi.ts maps stays available on the row (e.g. for a future export) but isn't
// shown here. PO No / Line No lead the row, and Status is a badge column.
const FIELDS: Field[] = [
  { label: 'Delivery Date', get: (r) => formatDeliveryDate(r.deliveryDate) },
  { label: 'PO Creater', get: (r) => r.poCreator },
  { label: 'Vendor', get: (r) => [r.vendor, r.vendorName].filter(Boolean).join(' · ') },
  { label: 'Service Txt', get: (r) => r.serviceText },
  { label: 'Activity Value', align: 'right', get: (r) => r.grossValue },
  { label: 'Liability Create (Y/N)', get: (r) => r.liabilityCreated },
  { label: 'Entry Sheet No', mono: true, get: (r) => r.entrySheetNo },
  { label: 'Pending Bill Value', strong: true, align: 'right', get: (r) => r.pendingValue },
  { label: 'GR Value', align: 'right', get: (r) => [r.grValue, r.grCurrency].filter(Boolean).join(' ') },
  { label: 'SES Value', align: 'right', get: (r) => [r.sesValue, r.sesCurrency].filter(Boolean).join(' ') },
  { label: 'Cost Center', get: (r) => [r.costCenter, r.costCenterText].filter(Boolean).join(' · ') },
  { label: 'GL Code', get: (r) => [r.glAccount, r.glAccountText].filter(Boolean).join(' · ') },
  { label: 'Country', get: (r) => r.country },
];

// Row accent by the SAP-derived Status code — '02' (GR/MIGO posted, no SES) is the main provision
// exposure bucket per instruction, so it gets the strongest tint; '01' (nothing at all yet) is
// next; '03' (SES created then reversed) is informational; '04' (acceptance pending) is a mild
// amber; '05' (accepted) gets no tint — it's resolved. Same hex+alpha values as the original.
const STATUS_ROW_TINT: Record<string, string> = {
  '02': '#C0392B14',
  '01': '#C0392B0A',
  '03': '#6B728012',
  '04': '#FFFBEB',
};

interface PaymentTrackingTableProps {
  rows: PaymentTrackingRow[];
  emptyMessage: string;
}

/** Read-only provision-status list shared across Provision Tracking's screens (Upcoming/Missed
 * Provision, and the Provision Details pop-up's line-item list) — one dense table row per PO item.
 * Row tint follows SAP's own computed Status field rather than a client-side answer, unlike
 * Delivery Confirmation's table. */
export default function PaymentTrackingTable({ rows, emptyMessage }: PaymentTrackingTableProps) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-white/60 px-4 py-8 text-center">
        <Inbox size={20} className="text-inkFaint" />
        <p className="text-sm text-inkSoft">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <TableWrap>
      <table className="tbl">
        <thead>
          <tr>
            <th className="whitespace-nowrap">PO · Line</th>
            <th>Status</th>
            {FIELDS.map((f) => (
              <th key={f.label} className={cx('whitespace-nowrap', f.align === 'right' && 'text-right')}>{f.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tint = STATUS_ROW_TINT[row.status];
            return (
              <tr key={row.key} style={tint ? { backgroundColor: tint } : undefined}>
                <td className="whitespace-nowrap">
                  <span className="code text-ink">{row.poNumber || '—'}</span>
                  <span className="ml-1 text-xs text-inkSoft">/ {row.poItemNo || '—'}</span>
                </td>
                <td>
                  {row.statusText ? (
                    <span className="inline-block max-w-[180px] truncate rounded-full border border-border bg-white px-2 py-[1px] text-2xs font-bold text-inkSoft" title={row.statusText}>
                      {row.statusText}
                    </span>
                  ) : null}
                </td>
                {FIELDS.map((f) => {
                  const v = f.get(row) || '—';
                  return (
                    <td
                      key={f.label}
                      className={cx(
                        f.align === 'right' ? 'num whitespace-nowrap text-right' : 'max-w-[220px]',
                        f.mono && 'code',
                        f.strong && 'font-extrabold text-red'
                      )}
                    >
                      {f.align === 'right' ? v : <span className="line-clamp-2" title={v}>{v}</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
