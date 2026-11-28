// One place for how a transporter is written and how a picker searches, so the format is identical on every screen and in every export.
// carrier.code is the SAP vendor number (6 digits, e.g. 100200). Label format: '100200 - Elite Roadways Pvt. Ltd.'

/** The SAP vendor number. Older demo data carried a 'V' prefix ('V100200'): it is dropped so old and new data read the same. */
export const vendorCode = (c) => String((c && c.code) || '').trim().replace(/^V(?=\d)/i, '');

/** '100200 - Elite Roadways Pvt. Ltd.' (just the name when the carrier has no code). `short` uses the short name for tight table cells. */
export function carrierLabel(c, opts) {
  if (!c) return '';
  const name = (opts && opts.short && c.shortName) || c.name || '';
  const code = vendorCode(c);
  return code ? `${code} - ${name}` : name;
}

/** Label for a carrier id; falls back to the id itself when the carrier is not in the list (never blank). */
export const carrierLabelOf = (carriers, id, opts) => { const c = (carriers || []).find((x) => x.id === id); return c ? carrierLabel(c, opts) : String(id ?? ''); };

/** The two CSV / Excel columns every export uses for a transporter. */
export const carrierCols = (carriers, id) => { const c = (carriers || []).find((x) => x.id === id); return { 'Carrier code': c ? vendorCode(c) : '', Carrier: c ? c.name : String(id ?? '') }; };

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Filter picker options by a typed query. Every word of the query must appear somewhere in the option's label or keywords (case-insensitive), so
 * '2002', 'elite' and 'elite 1200' all work and the order of the words does not matter. Empty query = everything. Options keep their order.
 * option = { value, label, keywords?, hint? }
 */
export function filterOptions(options, query) {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return options;
  return options.filter((o) => { const hay = norm(`${o.label} ${o.keywords || ''}`); return words.every((w) => hay.includes(w)); });
}

/** Options for a carrier picker: value = carrier id (unchanged), label = 'code - name'; extra search text = short name. */
export const carrierOptions = (carriers, extra) => (carriers || []).map((c) => ({ value: c.id, label: carrierLabel(c), keywords: c.shortName || '', ...(extra ? extra(c) : {}) }));

const CARRIER_KEY = /^(carrier|vendor|transporter|winner|awarded to|allocated to)$/i;
/**
 * Exports: for every Carrier / Vendor / Transporter / Winner column holding a carrier's name (or id), insert the SAP vendor number as its own column just before it
 * ('Carrier code', 'Vendor code' ...). Works on rows from the server too (their reports carry names only). Rows without a match are left as they are.
 */
export function addCarrierCodes(rows, carriers) {
  const byName = new Map(), byId = new Map();
  for (const c of carriers || []) { byName.set(norm(c.name), c); byId.set(String(c.id), c); }
  return (rows || []).map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (CARRIER_KEY.test(k) && typeof v === 'string') { const c = byName.get(norm(v)) || byId.get(v); if (c) out[`${k} code`] = vendorCode(c); }
      out[k] = v;
    }
    return out;
  });
}
