// Demo service: realistic sample workpapers in the browser (sessionStorage of the tab: a reload keeps changes, a new tab starts
// fresh). It applies the same rules as the hub backend + SAP (contract "as built") so the screens behave the same in both modes:
// respond only while "Send to Auditee"; each assignee submits their own responses (every one of mine must have text); the
// workpaper moves to "Management Responded" only when the last assignee has submitted; drafts live in the browser; delete only
// own files. Two tracks: audit and MIS.
import { ALLOWED_EXTENSIONS, MAX_RESPONSE, STATUS, obsKey, type Attachment, type Observation, type ResponseInput, type Track, type Workpaper } from './types';

export class DemoError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const DEMO_EMAIL = 'ravi.kumar@emamigroup.com';
export const DEMO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // files are kept in the tab's storage

interface StoredFile extends Attachment { base64: string }
/** The other assignees of a workpaper (SAP knows them; the app only sees the "waiting for" names). */
interface Other { name: string; submitted: boolean }
interface DemoWorkpaper extends Workpaper { others: Other[] }
interface Store { workpapers: DemoWorkpaper[]; files: Record<string, StoredFile[]> }

const KEY = 'aud_demo_v2';
const STATUS_TEXT: Record<string, string> = { [STATUS.toAuditee]: 'Awaiting response', [STATUS.responded]: 'Management responded', [STATUS.closed]: 'Closed' };

function obs(p: Partial<Observation> & Pick<Observation, 'lineItem' | 'title' | 'observation'>): Observation {
  return {
    ownerLineItem: '1', myRole: 'PERSON_RESPONSIBLE', rootCause: '', businessImplication: '', recommendation: '', managementResponse: '', financialImpact: '',
    risk: 'Medium', residualRisk: 'Low', timeline: '', categories: ['Process'], myResponse: '', attachmentsCount: 0, ...p,
  };
}

type Seed = Omit<Workpaper, 'statusText' | 'canRespond' | 'canSubmit' | 'legalEntity' | 'track' | 'mySubmitted' | 'waitingFor' | 'draftStorage'> & { legalEntity?: string; track?: Track; others?: Other[] };
function wp(p: Seed): DemoWorkpaper {
  const base = { legalEntity: 'Emami Limited', track: 'audit' as Track, others: [], ...p };
  return { ...base, statusText: '', canRespond: false, canSubmit: false, mySubmitted: false, waitingFor: [], draftStorage: 'browser' };
}

/** Status text, flags and "waiting for", worked out the way the backend does (a side is submitted when its text is non-empty). */
export function derive(w: DemoWorkpaper): Workpaper {
  const { others, ...rest } = w;
  const canRespond = w.status === STATUS.toAuditee;
  const mySubmitted = w.observations.length > 0 && w.observations.every((o) => o.myResponse.trim() !== '');
  return {
    ...rest, statusText: STATUS_TEXT[w.status] ?? w.status, canRespond, canSubmit: mySubmitted && canRespond, mySubmitted,
    waitingFor: canRespond ? [...(mySubmitted ? [] : ['Ravi Kumar']), ...others.filter((o) => !o.submitted).map((o) => o.name)] : [], // like SAP's MailText: every pending assignee, me included
    draftStorage: 'browser',
  };
}

function seed(): Store {
  const workpapers: DemoWorkpaper[] = [
    wp({
      guid: 'DEMO-WP-1001', fy: '2025', scheduling: 'Q2', period: 'Jul 2025 - Sep 2025', location: 'Kolkata HO', city: 'Kolkata', process: 'Procure to Pay', subProcess: 'Vendor master maintenance',
      status: STATUS.toAuditee, performer: 'Asha Sen', reviewer: 'Rahul Das', attachmentsCount: 2, others: [{ name: 'Anil Mehta', submitted: false }],
      observations: [
        obs({ lineItem: '1', title: 'Duplicate vendor codes for the same PAN', observation: '14 vendors exist twice in SAP with the same PAN and bank account; 3 of them received payments under both codes in FY 2024-25.', rootCause: 'No duplicate check on PAN or bank account when a vendor is created.', businessImplication: 'Risk of double payment and of fictitious vendors.', recommendation: 'Block the duplicates, add a PAN / bank account duplicate check to vendor creation and review the list quarterly.', risk: 'High', residualRisk: 'Medium', timeline: '2025-12-31', categories: ['Process', 'P1'], financialImpact: '3.2' }),
        obs({ lineItem: '2', ownerLineItem: '2', myRole: 'OWNER', title: 'Vendor bank changes without a second approval', observation: 'Bank details of 9 vendors were changed by one user without a dual control check.', rootCause: 'Sensitive field confirmation (FK08) is not active for bank fields.', businessImplication: 'Payments can be diverted to a wrong account.', recommendation: 'Activate sensitive field confirmation for bank data and keep the confirmations on file.', risk: 'High', residualRisk: 'Low', timeline: '2025-11-30', categories: ['Regulatory compliance'] }),
      ],
    }),
    wp({
      guid: 'DEMO-WP-1002', fy: '2025', scheduling: 'Q2', period: 'Jul 2025 - Sep 2025', location: 'Kolkata HO', city: 'Kolkata', process: 'Procure to Pay', subProcess: 'Goods receipt and invoice matching',
      status: STATUS.toAuditee, performer: 'Asha Sen', reviewer: 'Rahul Das', others: [{ name: 'Anil Mehta', submitted: false }, { name: 'Neha Jain', submitted: true }],
      observations: [
        obs({ lineItem: '1', title: 'Goods receipts posted after the invoice', observation: 'In 62 of 250 sampled POs the goods receipt was posted after the invoice was booked.', rootCause: 'Stores post goods receipts in batches at month end.', businessImplication: 'Payables and inventory are misstated at period end.', recommendation: 'Post goods receipts within 2 days of arrival and monitor the GR/IR ageing monthly.', risk: 'Medium', residualRisk: 'Low', timeline: '2026-01-31', categories: ['Process', 'P2'], myResponse: 'Stores will post receipts daily; a weekly GR/IR ageing report is being set up.' }),
        obs({ lineItem: '2', title: 'Price variance tolerance set too high', observation: 'The invoice price tolerance is 10 % for all vendors, so variances up to 10 % are paid without a check.', rootCause: 'Tolerance key PP was never reviewed after go-live.', businessImplication: 'Overpayments are not detected.', recommendation: 'Reduce the tolerance to 2 % and review blocked invoices daily.', risk: 'Medium', residualRisk: 'Low', timeline: '2026-02-28', categories: ['Cost savings'], myResponse: 'The tolerance will be reduced to 2 % after the finance controller signs off.' }),
      ],
    }),
    wp({
      guid: 'DEMO-WP-1003', fy: '2025', scheduling: 'Q3', period: 'Oct 2025 - Dec 2025', location: 'Guwahati Plant', city: 'Guwahati', process: 'Inventory management', subProcess: 'Physical verification',
      status: STATUS.toAuditee, performer: 'Sumit Paul', reviewer: 'Rahul Das',
      observations: [
        obs({ lineItem: '1', title: 'Physical stock differences not adjusted', observation: 'Differences found in the September count (value INR 4.6 lakh) were not posted in SAP.', rootCause: 'No owner for posting count differences.', businessImplication: 'Book stock does not match the warehouse.', recommendation: 'Post the differences after an approval and assign the task to the plant controller.', risk: 'Medium', residualRisk: 'Medium', timeline: '2026-01-15', categories: ['Process'], financialImpact: '4.6' }),
      ],
    }),
    wp({
      guid: 'DEMO-WP-0907', fy: '2025', scheduling: 'Q1', period: 'Apr 2025 - Jun 2025', location: 'Kolkata HO', city: 'Kolkata', process: 'Order to Cash', subProcess: 'Credit limit management',
      status: STATUS.responded, performer: 'Asha Sen', reviewer: 'Priya Ghosh',
      observations: [
        obs({ lineItem: '1', title: 'Credit limits overridden without approval', observation: '27 sales orders were released above the credit limit by the sales team.', rootCause: 'Release authorisation is given to every sales user.', businessImplication: 'Higher bad debt risk.', recommendation: 'Restrict credit release (VKM3) to the credit control team.', risk: 'High', residualRisk: 'Low', timeline: '2025-09-30', categories: ['Process', 'P1'], myResponse: 'Authorisation for VKM3 has been removed from the sales roles; only credit control can release blocked orders now.' }),
      ],
    }),
    wp({
      guid: 'DEMO-WP-0512', fy: '2024', scheduling: 'Q4', period: 'Jan 2025 - Mar 2025', location: 'Pantnagar Plant', city: 'Pantnagar', process: 'Fixed assets', subProcess: 'Asset capitalisation',
      status: STATUS.closed, performer: 'Sumit Paul', reviewer: 'Priya Ghosh',
      observations: [
        obs({ lineItem: '1', title: 'Assets under construction not capitalised on time', observation: 'Three projects completed in 2024 were still in AuC at year end.', rootCause: 'Engineering did not inform finance of completion.', businessImplication: 'Depreciation is understated.', recommendation: 'Monthly AuC review with engineering.', risk: 'Low', residualRisk: 'Low', timeline: '2025-03-31', categories: ['Regulatory compliance'], myResponse: 'Capitalised in March 2025; a monthly AuC review is in place.' }),
      ],
    }),
    wp({
      guid: 'DEMO-MIS-3101', track: 'mis', fy: '2025', scheduling: 'Monthly', period: 'Oct 2025', location: 'Kolkata HO', city: 'Kolkata', process: 'Record to Report', subProcess: 'Month-end provisions',
      status: STATUS.toAuditee, performer: 'Sumit Paul', reviewer: 'Priya Ghosh',
      observations: [
        obs({ lineItem: '1', title: 'Provision for expenses booked without working', observation: 'October provisions of INR 18 lakh were booked as a lump sum without a supporting working.', rootCause: 'No template for month-end provisions.', businessImplication: 'Expenses may be misstated in the monthly MIS.', recommendation: 'Use a standard provision working with the PO or contract reference.', risk: 'Medium', residualRisk: 'Low', timeline: '2025-12-15', categories: ['Process'], financialImpact: '18' }),
      ],
    }),
    wp({
      guid: 'DEMO-MIS-2907', track: 'mis', fy: '2025', scheduling: 'Monthly', period: 'Sep 2025', location: 'Guwahati Plant', city: 'Guwahati', process: 'Inventory management', subProcess: 'Slow-moving stock',
      status: STATUS.responded, performer: 'Sumit Paul', reviewer: 'Priya Ghosh',
      observations: [
        obs({ lineItem: '1', title: 'Slow-moving stock not reviewed', observation: 'Items without movement for more than 180 days (INR 7 lakh) were not reviewed in September.', recommendation: 'Monthly review with the plant head.', risk: 'Low', residualRisk: 'Low', timeline: '2025-10-31', categories: ['Others'], myResponse: 'Reviewed with the plant head; disposal of the listed items is approved.' }),
      ],
    }),
  ];
  const pdf = btoa('%PDF-1.4\n% demo file\n');
  return {
    workpapers,
    files: {
      'DEMO-WP-1001': [
        { name: 'Vendor duplicates list.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', annexure: true, byAuditee: false, uploadedBy: 'asha.sen@emamigroup.com', mine: false, base64: btoa('demo') },
        { name: 'FK08 change request.pdf', mimeType: 'application/pdf', annexure: false, byAuditee: true, uploadedBy: DEMO_EMAIL, mine: true, base64: pdf },
      ],
      'DEMO-WP-0907': [{ name: 'Role change approval.pdf', mimeType: 'application/pdf', annexure: false, byAuditee: true, uploadedBy: DEMO_EMAIL, mine: true, base64: pdf }],
    },
  };
}

let store: Store | undefined;
function load(): Store {
  if (store) return store;
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY) : null;
    store = raw ? (JSON.parse(raw) as Store) : seed();
  } catch { store = seed(); }
  return store;
}
function persist(): void {
  try { if (store && typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage full or blocked: changes last for this page */ }
}
/** For unit tests. */
export function resetDemo(): void { store = seed(); }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const pause = () => new Promise((r) => setTimeout(r, 150)); // a short wait so loading states are visible like in live mode

function find(guid: string): DemoWorkpaper {
  const w = load().workpapers.find((x) => x.guid === guid);
  if (!w) throw new DemoError(404, 'This workpaper was not found, or it is not assigned to you.');
  return w;
}
const withCount = (w: DemoWorkpaper): Workpaper => derive({ ...w, attachmentsCount: (load().files[w.guid] ?? []).length });

function apply(w: Workpaper, responses: ResponseInput[]): void {
  const mine = new Map(w.observations.map((o) => [obsKey(o), o]));
  for (const r of responses) {
    const o = mine.get(obsKey(r));
    if (!o) throw new DemoError(400, `Observation ${r.lineItem} is not one of your observations in this workpaper.`);
    const text = r.text.replace(/\r\n/g, '\n').trim();
    if (text.length > MAX_RESPONSE) throw new DemoError(400, `The response to observation ${r.lineItem} is longer than ${MAX_RESPONSE} characters.`);
  }
  for (const r of responses) mine.get(obsKey(r))!.myResponse = r.text.replace(/\r\n/g, '\n').trim();
}

export const demoService = {
  async list(track: Track, fy: string): Promise<Workpaper[]> {
    await pause();
    return clone(load().workpapers.filter((w) => w.track === track && (!fy || w.fy === fy)).map(withCount));
  },
  async get(guid: string): Promise<Workpaper> {
    await pause();
    return clone(withCount(find(guid)));
  },
  async submit(guid: string, responses: ResponseInput[]): Promise<Workpaper> {
    await pause();
    const w = find(guid);
    if (w.status !== STATUS.toAuditee) throw new DemoError(409, `This workpaper is "${derive(w).statusText}": it can only be submitted while it is awaiting your response.`);
    const copy = clone(w);
    apply(copy, responses);
    const missing = copy.observations.filter((o) => !o.myResponse.trim()).map((o) => o.lineItem);
    if (missing.length) throw new DemoError(400, `Please write a response to every observation before submitting. Missing: observation ${missing.join(', ')}.`);
    // SAP moves the workpaper only when the last assignee has submitted; until then it stays "Send to Auditee".
    Object.assign(w, copy, { status: w.others.every((o) => o.submitted) ? STATUS.responded : STATUS.toAuditee });
    persist();
    return clone(withCount(w));
  },
  async attachments(guid: string): Promise<Attachment[]> {
    await pause();
    find(guid);
    return (load().files[guid] ?? []).map(({ base64: _b, ...a }) => a);
  },
  async download(guid: string, name: string): Promise<{ base64: string; mimeType: string }> {
    find(guid);
    const f = (load().files[guid] ?? []).find((x) => x.name === name);
    if (!f) throw new DemoError(404, 'Attachment not found.');
    return { base64: f.base64, mimeType: f.mimeType };
  },
  async upload(guid: string, file: { name: string; mimeType: string; base64: string; size: number }): Promise<Attachment[]> {
    await pause();
    const w = find(guid);
    if (w.status !== STATUS.toAuditee) throw new DemoError(409, `This workpaper is "${derive(w).statusText}": files can no longer be added.`);
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) throw new DemoError(415, `This file type is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`);
    if (!file.size) throw new DemoError(400, 'The file is empty.');
    if (file.size > DEMO_MAX_UPLOAD_BYTES) throw new DemoError(413, 'The file is larger than 2 MB (the demo keeps files in your browser).');
    const list = (load().files[guid] ??= []);
    if (list.some((a) => a.name.toLowerCase() === file.name.toLowerCase())) throw new DemoError(409, 'A file with this name is already attached. Rename the file and try again.');
    list.push({ name: file.name, mimeType: file.mimeType || 'application/octet-stream', annexure: false, byAuditee: true, uploadedBy: DEMO_EMAIL, mine: true, base64: file.base64 });
    persist();
    return this.attachments(guid);
  },
  async remove(guid: string, name: string): Promise<Attachment[]> {
    await pause();
    const w = find(guid);
    if (w.status !== STATUS.toAuditee) throw new DemoError(409, `This workpaper is "${derive(w).statusText}": files can no longer be removed.`);
    const list = load().files[guid] ?? [];
    const f = list.find((a) => a.name === name);
    if (!f) throw new DemoError(404, 'Attachment not found.');
    if (!f.mine) throw new DemoError(403, 'You can only delete files you uploaded.');
    load().files[guid] = list.filter((a) => a !== f);
    persist();
    return this.attachments(guid);
  },
};
