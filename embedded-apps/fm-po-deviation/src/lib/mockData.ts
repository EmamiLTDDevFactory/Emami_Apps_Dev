// Mock data for UI testing only — lets someone see every screen/state (pending, released-pending,
// approved, rejected, history log, PDF preview) without waiting on SAP Basis to add the Email
// field to PoSet (see src/types/po.ts's header comment). Controlled by NEXT_PUBLIC_MOCK_DATA in
// sapClient.ts — defaults ON (so this app shows something useful right away); set
// NEXT_PUBLIC_MOCK_DATA=false once real SAP data is confirmed flowing, to switch back to live
// calls with no other code change needed.
//
// Shaped as raw OData-wire objects (PascalCase fields, "/Date(ms)/" dates, "PTnnHnnMnnS" times) so
// sapClient.ts's own toPoRow() parses these exactly the same way it parses a real response —
// one mapping path, not a separate mock-shaped type to keep in sync.

function d(dateStr: string): string {
  return `/Date(${new Date(dateStr).getTime()})/`;
}

function t(hh: number, mm: number): string {
  return `PT${String(hh).padStart(2, '0')}H${String(mm).padStart(2, '0')}M00S`;
}

interface MockPo {
  ebeln: string;
  lifnr: string;
  name1: string;
  zname: string;
  status: 'A' | 'R' | '';
  zpoInd: string; // 'R' released, else unreleased
  erdat: string;
  uzeit: [number, number];
  addInfo: string;
  items: { stxt: string; netwr: string; waers: string; delDate: string; ccenter: string; gl: string; menge: string; meins: string; order: string; loekz?: boolean }[];
  log: { erdat: string; uzeit: [number, number]; addInfo: string; initRem: string }[];
}

const MOCK_POS: MockPo[] = [
  {
    ebeln: '4500001001', lifnr: '100234', name1: 'Bharat Engineering Works', zname: 'Rakesh Sharma',
    status: '', zpoInd: '', erdat: '2026-09-08', uzeit: [9, 42], addInfo: '',
    items: [
      { stxt: 'Structural steel fabrication — Unit 3', netwr: '85000.00', waers: 'INR', delDate: '2026-09-20', ccenter: 'CC-1001', gl: '400100', menge: '12', meins: 'EA', order: 'ORD-88213' },
      { stxt: 'On-site welding services', netwr: '40000.00', waers: 'INR', delDate: '2026-09-22', ccenter: 'CC-1001', gl: '400105', menge: '1', meins: 'AU', order: 'ORD-88213' },
    ],
    log: [
      { erdat: '2026-09-08', uzeit: [9, 40], addInfo: 'Rakesh Sharma', initRem: 'PO created and routed for deviation approval.' },
    ],
  },
  {
    ebeln: '4500001002', lifnr: '100567', name1: 'Silverline Traders', zname: 'Priya Menon',
    status: '', zpoInd: 'R', erdat: '2026-09-05', uzeit: [14, 15], addInfo: '',
    items: [
      { stxt: 'Packaging material — corrugated boxes', netwr: '68000.00', waers: 'INR', delDate: '2026-09-18', ccenter: 'CC-2004', gl: '400220', menge: '5000', meins: 'EA', order: 'ORD-77120' },
      { stxt: 'Freight and handling', netwr: '21000.00', waers: 'INR', delDate: '2026-09-18', ccenter: 'CC-2004', gl: '400221', menge: '1', meins: 'AU', order: 'ORD-77120' },
    ],
    log: [
      { erdat: '2026-09-05', uzeit: [14, 10], addInfo: 'Priya Menon', initRem: 'PO created and routed for deviation approval.' },
      { erdat: '2026-09-06', uzeit: [10, 5], addInfo: 'System', initRem: 'Released by finance controller — awaiting final approval.' },
    ],
  },
  {
    ebeln: '4500001003', lifnr: '100891', name1: 'Nova Industrial Supplies', zname: 'Arjun Verma',
    status: '', zpoInd: '', erdat: '2026-09-10', uzeit: [11, 5], addInfo: '',
    items: [
      { stxt: 'Hydraulic pump assembly', netwr: '312000.00', waers: 'INR', delDate: '2026-09-25', ccenter: 'CC-3010', gl: '400310', menge: '2', meins: 'EA', order: 'ORD-99042' },
      { stxt: 'Installation and commissioning', netwr: '138000.00', waers: 'INR', delDate: '2026-09-28', ccenter: 'CC-3010', gl: '400312', menge: '1', meins: 'AU', order: 'ORD-99042', loekz: true },
    ],
    log: [
      { erdat: '2026-09-10', uzeit: [11, 0], addInfo: 'Arjun Verma', initRem: 'PO created and routed for deviation approval.' },
    ],
  },
  {
    ebeln: '4500000954', lifnr: '100234', name1: 'Bharat Engineering Works', zname: 'Rakesh Sharma',
    status: 'A', zpoInd: 'R', erdat: '2026-08-28', uzeit: [16, 20], addInfo: 'Approved — within delegated authority',
    items: [
      { stxt: 'Conveyor belt replacement', netwr: '94000.00', waers: 'INR', delDate: '2026-09-05', ccenter: 'CC-1002', gl: '400104', menge: '1', meins: 'AU', order: 'ORD-65310' },
    ],
    log: [
      { erdat: '2026-08-28', uzeit: [16, 15], addInfo: 'Rakesh Sharma', initRem: 'PO created and routed for deviation approval.' },
      { erdat: '2026-08-29', uzeit: [9, 30], addInfo: 'Demo Approver', initRem: 'Approved — within delegated authority.' },
    ],
  },
  {
    ebeln: '4500000961', lifnr: '100778', name1: 'Kaveri Chemicals', zname: 'Sana Iyer',
    status: 'A', zpoInd: 'R', erdat: '2026-08-30', uzeit: [10, 0], addInfo: 'Approved by procurement head',
    items: [
      { stxt: 'Industrial solvent — bulk order', netwr: '156000.00', waers: 'INR', delDate: '2026-09-12', ccenter: 'CC-4001', gl: '400401', menge: '200', meins: 'LTR', order: 'ORD-71890' },
    ],
    log: [
      { erdat: '2026-08-30', uzeit: [9, 55], addInfo: 'Sana Iyer', initRem: 'PO created and routed for deviation approval.' },
      { erdat: '2026-08-31', uzeit: [11, 40], addInfo: 'Demo Approver', initRem: 'Approved by procurement head.' },
    ],
  },
  {
    ebeln: '4500000933', lifnr: '100112', name1: 'Everest Logistics', zname: 'Vikram Nair',
    status: 'R', zpoInd: 'R', erdat: '2026-08-20', uzeit: [13, 45], addInfo: 'Budget exceeded for this quarter',
    items: [
      { stxt: 'Warehouse racking — additional bays', netwr: '212000.00', waers: 'INR', delDate: '2026-09-01', ccenter: 'CC-5002', gl: '400502', menge: '18', meins: 'EA', order: 'ORD-58732' },
    ],
    log: [
      { erdat: '2026-08-20', uzeit: [13, 40], addInfo: 'Vikram Nair', initRem: 'PO created and routed for deviation approval.' },
      { erdat: '2026-08-21', uzeit: [15, 10], addInfo: 'Demo Approver', initRem: 'Budget exceeded for this quarter.' },
    ],
  },
  {
    ebeln: '4500000940', lifnr: '100445', name1: 'Ganges Textiles', zname: 'Rahul Deshpande',
    status: 'R', zpoInd: 'R', erdat: '2026-08-22', uzeit: [9, 15], addInfo: 'Vendor pricing not competitive — reverting for renegotiation',
    items: [
      { stxt: 'Uniform fabric — annual contract', netwr: '78000.00', waers: 'INR', delDate: '2026-09-03', ccenter: 'CC-6001', gl: '400601', menge: '2000', meins: 'MTR', order: 'ORD-60214' },
    ],
    log: [
      { erdat: '2026-08-22', uzeit: [9, 10], addInfo: 'Rahul Deshpande', initRem: 'PO created and routed for deviation approval.' },
      { erdat: '2026-08-23', uzeit: [10, 25], addInfo: 'Demo Approver', initRem: 'Vendor pricing not competitive — reverting for renegotiation.' },
    ],
  },
];

function headerRaw(po: MockPo): Record<string, any> {
  return {
    Ebeln: po.ebeln, Ebelp: '00000', Lifnr: po.lifnr, Name1: po.name1, Zname: po.zname,
    Stxt: '', Netwr: '0.00', Waers: po.items[0]?.waers || 'INR',
    Status: po.status, ZpoInd: po.zpoInd, Erdat: d(po.erdat), Uzeit: t(...po.uzeit), AddInfo: po.addInfo,
  };
}

function itemRaw(po: MockPo, index: number): Record<string, any> {
  const item = po.items[index];
  return {
    Ebeln: po.ebeln, Ebelp: String((index + 1) * 10).padStart(5, '0'),
    Lifnr: po.lifnr, Name1: po.name1, Stxt: item.stxt, Netwr: item.netwr, Waers: item.waers,
    Status: po.status, ZpoInd: po.zpoInd, Erdat: d(po.erdat), Uzeit: t(...po.uzeit),
    DelDate: d(item.delDate), Ccenter: item.ccenter, Gl: item.gl, Menge: item.menge, Meins: item.meins,
    Order: item.order, Loekz: item.loekz || false,
  };
}

function logRaw(po: MockPo, index: number): Record<string, any> {
  const entry = po.log[index];
  return {
    Ebeln: po.ebeln, Ebelp: '00000', Status: 'L',
    Erdat: d(entry.erdat), Uzeit: t(...entry.uzeit), AddInfo: entry.addInfo, InitRem: entry.initRem,
  };
}

// Mutable so submitPoActionMock can reflect an approve/reject/unrelease back into subsequent reads
// within the same browser session — resets on reload, same as any other client-only mock store.
let store = MOCK_POS.map((po) => ({ ...po, items: [...po.items], log: [...po.log] }));

export function mockPending(): Record<string, any>[] {
  return store.filter((po) => po.status === '').flatMap((po) => [headerRaw(po), ...po.items.map((_, i) => itemRaw(po, i))]);
}

export function mockApproved(): Record<string, any>[] {
  return store.filter((po) => po.status === 'A').flatMap((po) => [headerRaw(po), ...po.items.map((_, i) => itemRaw(po, i))]);
}

export function mockRejected(): Record<string, any>[] {
  return store.filter((po) => po.status === 'R').flatMap((po) => [headerRaw(po), ...po.items.map((_, i) => itemRaw(po, i))]);
}

export function mockPoByNumber(ebeln: string): Record<string, any>[] {
  const po = store.find((p) => p.ebeln === ebeln);
  if (!po) return [];
  return [headerRaw(po), ...po.items.map((_, i) => itemRaw(po, i))];
}

export function mockHistoryLog(ebeln: string): Record<string, any>[] {
  const po = store.find((p) => p.ebeln === ebeln);
  if (!po) return [];
  return po.log.map((_, i) => logRaw(po, i));
}

const ACTOR_NAME = 'Demo Approver';

export function mockSubmitAction(ebeln: string, action: 'A' | 'R' | 'U', reason?: string): void {
  const po = store.find((p) => p.ebeln === ebeln);
  if (!po) return;
  const now = new Date();
  const entry = { erdat: now.toISOString().slice(0, 10), uzeit: [now.getHours(), now.getMinutes()] as [number, number], addInfo: ACTOR_NAME, initRem: '' };
  if (action === 'A') {
    po.status = 'A';
    po.addInfo = 'Approved';
    entry.initRem = 'Approved.';
  } else if (action === 'R') {
    po.status = 'R';
    po.addInfo = reason || 'Rejected';
    entry.initRem = reason || 'Rejected.';
  } else if (action === 'U') {
    po.zpoInd = '';
    entry.initRem = 'Unreleased — sent back for approval.';
  }
  po.log.push(entry);
}

// Shortest well-formed one-page PDF ("Mock PDF — PO Deviation Approval") — real bytes, not a
// placeholder string, so the PDF preview modal genuinely opens a viewable file.
const MOCK_PDF_BASE64 =
  'JVBERi0xLjEKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAzMDAgMTQ0XSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNzAgPj4Kc3RyZWFtCkJUCi9GMSAxOCBUZgoyMCAxMDAgVGQKKE1vY2sgUERGIC0gUE8gRGV2aWF0aW9uIEFwcHJvdmFsKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgowCiUlRU9G';

export function mockPrintformPdf(): Blob {
  const binary = atob(MOCK_PDF_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}
