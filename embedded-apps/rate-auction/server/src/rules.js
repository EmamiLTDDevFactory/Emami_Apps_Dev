// Bid and SAP rules shared by the server (engine.js) and the browser (the Rate Auction frontend
// imports this file directly), so the create-auction form, the SAP document form and the server
// always agree on what is required. Plain data and pure functions only: nothing here may touch
// Node APIs.

export const MATERIAL_TYPES = [
  { code: 'ROH', name: 'Raw materials' },
  { code: 'VERP', name: 'Packaging materials' },
  { code: 'DIEN', name: 'Services (freight, job work)' },
  { code: 'HIBE', name: 'Operating supplies' },
];

const STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
export const r2 = (n) => Math.round(n * 100) / 100;

// Starting suggestion: ceiling about 5% above the last purchase rate, decrement about 0.5% of it.
export function suggestRates(m) {
  if (m.lastRate == null) return { ceiling: '', decrement: '' };
  const dec = STEPS.find((x) => x >= m.lastRate * 0.005) || 1000;
  return { ceiling: r2(Math.ceil((m.lastRate * 1.05) / dec) * dec), decrement: dec };
}

// Minimum information SAP needs before an info record (ME11) or contract (ME31K) can be created.
const isWK = (f) => String(f.contractType || '').startsWith('WK');
const isMK = (f) => String(f.contractType || '').startsWith('MK');
const UOM = ['TRIP', 'KG', 'MT', 'EA', 'L'];
const INCO = ['', 'EXW', 'FCA', 'CPT', 'DAP', 'DDP'];
export const SAP_SPEC = {
  inforecord: {
    title: 'Info record', tcode: 'ME11',
    fields: [
      { key: 'vendorCode', label: 'SAP vendor code', ro: true, req: true },
      { key: 'material', label: 'Material / service number', ro: true, req: true },
      { key: 'infoCategory', label: 'Info record category', type: 'select', options: ['Standard', 'Subcontracting', 'Pipeline', 'Consignment'], req: true },
      { key: 'purchOrg', label: 'Purchasing organization', req: true },
      { key: 'purchGroup', label: 'Purchasing group', req: true },
      { key: 'plant', label: 'Plant', req: true },
      { key: 'netPrice', label: 'Net price (awarded rate)', ro: true, req: true },
      { key: 'currency', label: 'Currency', ro: true, req: true },
      { key: 'priceUnit', label: 'Price unit (per)', type: 'number', req: true },
      { key: 'uom', label: 'Order price unit', type: 'select', options: UOM, req: true },
      { key: 'validFrom', label: 'Valid from', type: 'date', req: true },
      { key: 'validTo', label: 'Valid to', type: 'date', req: true },
      { key: 'plannedDelivDays', label: 'Planned delivery time (days)', type: 'number', req: true },
      { key: 'taxCode', label: 'Tax code', req: true },
      { key: 'incoterms', label: 'Incoterms', type: 'select', options: INCO, req: true },
      { key: 'paymentTerms', label: 'Payment terms', req: true },
      { key: 'minQty', label: 'Minimum order quantity (optional)', type: 'number' },
    ],
  },
  contract: {
    title: 'Contract', tcode: 'ME31K',
    fields: [
      { key: 'contractType', label: 'Contract type', type: 'select', options: ['WK – Quantity contract', 'MK – Value contract'], req: true },
      { key: 'vendorCode', label: 'SAP vendor code', ro: true, req: true },
      { key: 'purchOrg', label: 'Purchasing organization', req: true },
      { key: 'purchGroup', label: 'Purchasing group', req: true },
      { key: 'plant', label: 'Plant', req: true },
      { key: 'material', label: 'Material / service number', ro: true, req: true },
      { key: 'shortText', label: 'Short text', req: true },
      { key: 'validFrom', label: 'Validity start', type: 'date', req: true },
      { key: 'validTo', label: 'Validity end', type: 'date', req: true },
      { key: 'targetQty', label: 'Target quantity (quantity contract)', type: 'number', req: isWK },
      { key: 'targetValue', label: 'Target value (value contract)', type: 'number', req: isMK },
      { key: 'netPrice', label: 'Net price (awarded rate)', ro: true, req: true },
      { key: 'currency', label: 'Currency', ro: true, req: true },
      { key: 'uom', label: 'Order unit', type: 'select', options: UOM, req: true },
      { key: 'incoterms', label: 'Incoterms', type: 'select', options: INCO, req: true },
      { key: 'paymentTerms', label: 'Payment terms', req: true },
      { key: 'taxCode', label: 'Tax code (optional)' },
    ],
  },
};

export function checkSap(kind, form) {
  const missing = [], errors = [];
  let total = 0;
  SAP_SPEC[kind].fields.forEach((f) => {
    const req = typeof f.req === 'function' ? f.req(form) : f.req;
    if (!req) return;
    total++;
    const v = form[f.key];
    if (v === undefined || v === null || String(v).trim() === '') missing.push(f.label);
  });
  if (form.validFrom && form.validTo && form.validTo <= form.validFrom) errors.push('Valid-to date must be after valid-from date.');
  ['priceUnit', 'plannedDelivDays', 'targetQty', 'targetValue', 'minQty'].forEach((k) => {
    if (form[k] !== undefined && String(form[k]).trim() !== '' && !(Number(form[k]) > 0)) errors.push('Enter a number above zero for ' + k + '.');
  });
  return { missing, errors, total, done: total - missing.length };
}

export const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
