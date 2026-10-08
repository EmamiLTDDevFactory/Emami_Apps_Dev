import { getEntry, getPdf } from '@/lib/gate';
import { fmtDate, fmtQty, fmtTime } from '@/lib/format';
import { GateError } from '@/lib/sap';
import type { EntryDetail } from '@/lib/types';

/**
 * Opens the gate pass PDF from SAP in a new tab (the browser's viewer prints it). The Azure gateway does not pass
 * GateRequestPdfSet(..)/$value on to SAP yet; until it does, the same tab gets a printable gate pass built from the
 * entry's own data instead of SAP's Smartform.
 */
export async function openPdf(reqNo: string) {
  const tab = window.open('', '_blank'); // open synchronously so pop-up blockers allow it
  try {
    const url = URL.createObjectURL(await getPdf(reqNo));
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    if (!(e instanceof GateError && e.code === 'GATEWAY_UNSUPPORTED') || !tab) {
      tab?.close();
      throw e;
    }
    try {
      const d = await getEntry(reqNo);
      if (!d.entries.length) throw new GateError(404, 'NOT_FOUND', `Gate entry ${reqNo} not found`);
      tab.document.open();
      tab.document.write(gatePassHtml(d));
      tab.document.close();
      tab.focus();
      tab.print();
    } catch (e2) {
      tab.close();
      throw e2;
    }
  }
}

const esc = (v: string | null | undefined) =>
  (v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function gatePassHtml(d: EntryDetail): string {
  const h = d.entries[0];
  const cell = (label: string, value: string) => `<div class="c"><span>${esc(label)}</span><b>${esc(value) || '-'}</b></div>`;
  const pos = d.entries
    .map(
      (e) => `<h2>PO ${esc(e.poNo) || '-'} &middot; ${esc(e.poVendrName)} (${esc(e.poVendr)})</h2>
<table><thead><tr><th>Item</th><th>Material</th><th>Description</th><th class="r">Received</th><th>Unit</th></tr></thead><tbody>
${e.items.map((i) => `<tr><td>${esc(i.ebelp)}</td><td>${esc(i.matnr)}</td><td>${esc(i.txz01)}</td><td class="r">${esc(fmtQty(i.qntRecievd))}</td><td>${esc(i.meins)}</td></tr>`).join('')}
</tbody></table>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Gate pass ${esc(d.reqNo)}</title><style>
body{font:13px/1.4 system-ui,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}
.g{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}.c{border:1px solid #ccc;border-radius:6px;padding:6px 8px}
.c span{display:block;font-size:10px;text-transform:uppercase;color:#666}table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f2f2f2;font-size:11px}.r{text-align:right}
.n{margin-top:16px;font-size:11px;color:#666}</style></head><body>
<h1>Gate pass ${esc(d.reqNo)}</h1><div>Emami Ltd &middot; Plant ${esc(h.items[0]?.werks ?? '')}</div>
<div class="g">${[
    cell('Requested', `${fmtDate(h.reqDate)} ${fmtTime(h.reqTime)}`),
    cell('By', h.reqBy),
    cell('Vehicle', h.truckNo),
    cell('Truck in', `${fmtDate(h.truckDate)} ${fmtTime(h.truckTim)}`),
    cell('LR', `${h.lrno}${h.lrdt ? ` / ${fmtDate(h.lrdt)}` : ''}`),
    cell('Freight vendor', h.vehVendrName || h.vehVendrNo),
    cell('Invoice', `${h.invNo}${h.invDate ? ` / ${fmtDate(h.invDate)}` : ''}`),
    cell('ASN', h.asnNo),
  ].join('')}</div>${pos}
<p class="n">Printed from Emami Apps (Gate Entry) - SAP's own gate pass form is not reachable through the gateway yet.</p>
</body></html>`;
}
