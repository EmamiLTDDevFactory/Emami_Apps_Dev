// One interface, two backends.
//  - live: OData V2 service ZLIFE_INS_SRV through the shared Azure SAP gateway (same call shape as
//    gate-entry/src/lib/sap.ts). Switched on with NEXT_PUBLIC_TERM_POLICY_LIVE=1 at build time, once Basis has
//    registered the service (see ../../sap/README.md). The gateway passes only GET and POST, so every write is a POST.
//  - mock: browser localStorage, running the same business rules as the SAP class (validate.ts), so the screens
//    behave identically before and after the switch.
// The gateway signs in to SAP with its technical user, so SAP cannot tell who the person is: every call carries the
// hub email and the SAP class derives user, role and employee from it.
import type { EmployeeInfo, LimitRow, MassRowResult, Nominee, Policy, PolicyInput, Profile, SapRole, SumOption } from '../types/policy';
import { activeNominees, checkPolicyForm, limitToRupees } from './validate';

export const SAP_GATEWAY = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api';
export const SAP_SYSTEM = process.env.NEXT_PUBLIC_TERM_POLICY_SAP_SYSTEM ?? 'EDS';
export const SAP_SERVICE = 'ZLIFE_INS_SRV';
export const IS_LIVE = process.env.NEXT_PUBLIC_TERM_POLICY_LIVE === '1';

export class TermPolicyError extends Error {
  constructor(message: string, public status = 400, public field?: string) {
    super(message);
    this.name = 'TermPolicyError';
  }
}

export interface TermPolicyApi {
  getProfile(email: string, hubIsAdmin: boolean): Promise<Profile>;
  getEmployee(email: string, empId: string): Promise<EmployeeInfo>;
  getSumOptions(email: string, empId: string): Promise<SumOption[]>;
  savePolicy(email: string, input: PolicyInput): Promise<{ reqno: string }>;
  deletePolicy(email: string, reqno: string): Promise<void>;
  /** all = every active policy of the year (admin download); empId = one employee; neither = the caller's own. */
  listPolicies(email: string, q: { empId?: string; all?: boolean }): Promise<Policy[]>;
  saveLimits(email: string, rows: LimitRow[]): Promise<{ count: number }>;
  sendSummary(email: string, reqnos: string[]): Promise<void>;
}

// ------------------------------------------------------------------ live ---------------------------------------------

const BASE = `${SAP_GATEWAY}/${SAP_SYSTEM}/${SAP_SERVICE}`;
const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

function sapError(status: number, text: string): TermPolicyError {
  let message = '';
  try {
    const j = JSON.parse(text);
    message = j?.error?.message?.value ?? '';
  } catch {
    /* HTML from the gateway */
  }
  if (status === 404 && /Cannot (GET|POST) \/api\//.test(text)) return new TermPolicyError('The SAP gateway does not pass this request on to SAP yet.', 501);
  if (/No service found for namespace/.test(message) || status === 503) return new TermPolicyError(`The SAP service ${SAP_SERVICE} is not available on the gateway.`, 503);
  if (status === 401 || status === 403) return new TermPolicyError(message || 'SAP refused the request.', status);
  return new TermPolicyError(message || `SAP returned HTTP ${status}`, status || 502);
}

async function call(method: 'GET' | 'POST', path: string, params: Record<string, string> = {}, body?: unknown): Promise<any> {
  const qs = Object.entries({ ...params, $format: 'json' })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}?${qs}`, {
      method,
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new TermPolicyError('SAP is not reachable right now. Check the network and try again.', 502);
  }
  const text = await res.text();
  if (!res.ok) throw sapError(res.status, text);
  if (!text) return undefined;
  const d = JSON.parse(text)?.d;
  return d && Array.isArray(d.results) ? d.results : d;
}

/** SAP JSON dates arrive as /Date(1700000000000)/ (UTC midnight). */
const sapDate = (v: any): string => {
  const ms = /\/Date\((-?\d+)/.exec(String(v ?? ''))?.[1];
  return ms ? new Date(Number(ms)).toISOString().slice(0, 10) : '';
};
const num = (v: any) => Number(v) || 0;
const noLeadZeros = (v: any) => String(v ?? '').replace(/^0+(?=\d)/, '');

function toNominees(rows: any[] | undefined): Nominee[] {
  return (rows ?? []).map((n) => ({ name: n.Name ?? '', relation: (n.Relation ?? '').trim(), share: String(n.PerShare ?? '').trim() })) as Nominee[];
}

function toPolicy(r: any): Policy {
  return {
    reqno: r.Reqno, year: r.Year, empId: noLeadZeros(r.EmpId), employeeName: r.EmployeeName ?? '', designation: r.Designation ?? '',
    orgUnit: r.OrgUnit ?? '', locationText: r.LocationText ?? '', email: r.CompanyMail ?? '', personalEmail: r.PersonalMail ?? '',
    contact: r.Contact ?? '', sumAssured: r.SumText ?? '', premium: num(r.Premium), gst: num(r.Gst), total: num(r.Total),
    createdBy: r.CreatedBy ?? '', requestDate: sapDate(r.ReqDate), nominees: toNominees(r.Nominees?.results ?? r.Nominees),
  };
}

const live: TermPolicyApi = {
  async getProfile(email) {
    const r = await call('GET', `/ProfileSet(${q(email)})`);
    return { email, user: r.User, role: r.Role as SapRole, empId: noLeadZeros(r.EmpId), activeYear: r.ActiveYear };
  },
  async getEmployee(email, empId) {
    const r = await call('GET', `/EmployeeSet(EmpId=${q(empId)},Email=${q(email)})`);
    return {
      empId: noLeadZeros(r.EmpId), firstName: r.FirstName, lastName: r.LastName, dob: sapDate(r.Dob), age: num(r.Age), gender: r.Gender,
      companyCode: r.CompanyCode, companyName: r.CompanyName, department: r.Department, orgUnit: r.OrgUnit, designation: r.Designation,
      location: r.Location, locationText: r.LocationText, email: r.CompanyMail ?? '', limitText: r.LimitText ?? '', year: r.Year,
    };
  },
  async getSumOptions(email, empId) {
    const rows = await call('GET', '/SumOptionSet', { $filter: `EmpId eq ${q(empId)} and Email eq ${q(email)}`, $orderby: 'Slno' });
    return rows.map((r: any) => ({ text: r.SumText, amount: num(r.SumAmount), premium: num(r.Premium), gst: num(r.Gst), total: num(r.Total) }));
  },
  async savePolicy(email, input) {
    const r = await call('POST', '/PolicySet', {}, {
      Email: email, Reqno: input.reqno ?? '', EmpId: input.empId, SumText: input.sumAssured, PersonalMail: input.personalEmail, Contact: input.contact,
      Nominees: activeNominees(input.nominees).map((n) => ({ Name: n.name.trim(), Relation: n.relation, PerShare: n.share.trim() })),
    });
    return { reqno: r.Reqno };
  },
  async deletePolicy(email, reqno) {
    await call('POST', '/DeletePolicy', { Reqno: q(reqno), Email: q(email) });
  },
  async listPolicies(email, query) {
    const parts = [`Email eq ${q(email)}`];
    if (query.all) parts.push("AllRows eq 'X'");
    if (query.empId) parts.push(`EmpId eq ${q(query.empId)}`);
    const rows = await call('GET', '/PolicySet', { $filter: parts.join(' and '), $expand: 'Nominees' });
    return rows.map(toPolicy);
  },
  async saveLimits(email, rows) {
    const r = await call('POST', '/LimitUploadSet', {}, { Email: email, Rows: rows.map((x) => ({ EmpId: x.empId, Limit: x.limit })) });
    return { count: num(r?.Count) || rows.length };
  },
  async sendSummary(email, reqnos) {
    await call('POST', '/SendSummary', { Reqnos: q(reqnos.join(',')), Email: q(email) });
  },
};

// ------------------------------------------------------------------ mock ---------------------------------------------

const POL_KEY = 'term-policy-mock-policies-v2';
const LIM_KEY = 'term-policy-mock-limits-v2';
const YEAR = String(new Date().getFullYear());

// 2023 slab table from ZLIFE_AMT (live data on EDS): sum in lakhs -> premium, GST, total.
const SLABS: [number, number, number, number][] = [
  [10, 2156, 388, 2544], [20, 4312, 776, 5088], [30, 6468, 1164, 7632], [40, 8624, 1552, 10176], [50, 10780, 1940, 12720],
  [75, 16170, 2911, 19081], [100, 21560, 3881, 25441], [150, 32340, 5821, 38161], [200, 43120, 7762, 50882],
  [250, 53900, 9702, 63602], [300, 64680, 11642, 76322], [400, 86240, 15523, 101763], [500, 107800, 19404, 127204],
];

function read<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: the mock just forgets */
  }
}
const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));
const userOf = (email: string) => email.split('@')[0].toLowerCase();
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function mockEmpIdFor(email: string) {
  return String(90000000 + (hash(email) % 1000000));
}

/** Any 8-digit number is an employee, except ids starting with 0 ("does not exist") or 1 (another company). */
function mockEmployee(empId: string): EmployeeInfo {
  if (!/^\d{1,8}$/.test(empId)) throw new TermPolicyError('Employee ID does not exist.', 404, 'empId');
  if (empId.startsWith('0')) throw new TermPolicyError('Employee ID does not exist.', 404, 'empId');
  if (empId.startsWith('1')) throw new TermPolicyError('You are not an employee under Emami Limited.', 400, 'empId');
  const h = hash(empId);
  const first = ['Rohan', 'Ananya', 'Sourav', 'Priya', 'Imran', 'Meera'][h % 6];
  const last = ['Sharma', 'Das', 'Verma', 'Iyer', 'Khan', 'Gupta'][(h >> 3) % 6];
  const limits = read<Record<string, string>>(LIM_KEY, {});
  return {
    empId, firstName: first, lastName: last, dob: `${1975 + (h % 25)}-0${1 + (h % 9)}-1${h % 9}`, age: 30 + (h % 25), gender: h % 2 ? 'Male' : 'Female',
    companyCode: '1000', companyName: 'Emami Limited', department: 'Sales', orgUnit: ['Sales East', 'Finance', 'Supply Chain', 'IT'][h % 4],
    designation: ['Manager', 'Sr. Manager', 'Executive', 'AGM'][(h >> 2) % 4], location: '1001', locationText: ['Kolkata', 'Mumbai', 'Delhi'][h % 3],
    email: empId.endsWith('7') ? '' : `${first}.${last}@emamigroup.com`.toLowerCase(), limitText: limits[empId] ?? '50 LAKHS', year: YEAR,
  };
}

function mockSlabs(limitText: string): SumOption[] {
  const max = limitToRupees(limitText);
  return SLABS.filter(([l]) => l * 100000 <= max).map(([l, p, g, t]) => ({ text: `${l} LAKHS`, amount: l * 100000, premium: p, gst: g, total: t }));
}

const mock: TermPolicyApi = {
  async getProfile(email, hubIsAdmin) {
    const role: SapRole = hubIsAdmin ? 'ADMIN' : 'USER';
    return wait({ email, user: userOf(email), role, empId: mockEmpIdFor(email), activeYear: YEAR });
  },
  async getEmployee(_email, empId) {
    return wait(mockEmployee(empId));
  },
  async getSumOptions(_email, empId) {
    return wait(mockSlabs(mockEmployee(empId).limitText));
  },
  async savePolicy(email, input) {
    const policies = read<Policy[]>(POL_KEY, []);
    const emp = mockEmployee(input.empId);
    const err = checkPolicyForm({ personalEmail: input.personalEmail, contact: input.contact, hasCompanyEmail: !!emp.email, sumAssured: input.sumAssured, nominees: input.nominees });
    if (err) throw new TermPolicyError(err.message, 400, err.field);
    const slab = mockSlabs(emp.limitText).find((s) => s.text === input.sumAssured);
    if (!slab) throw new TermPolicyError('The selected sum assured is not allowed for this employee.', 400, 'sumAssured');
    const dup = policies.find((p) => p.empId === emp.empId && p.reqno !== input.reqno);
    if (dup) throw new TermPolicyError(`Policy for the employee id ${emp.empId} already exists`, 400, 'empId');
    const existing = input.reqno ? policies.find((p) => p.reqno === input.reqno) : undefined;
    if (input.reqno && !existing) throw new TermPolicyError(`Request ${input.reqno} not found.`, 404);
    const policy: Policy = {
      reqno: existing?.reqno ?? `${YEAR}${String(policies.length + 1).padStart(6, '0')}`, year: YEAR, empId: emp.empId,
      employeeName: `${emp.firstName} ${emp.lastName}`, designation: emp.designation, orgUnit: emp.orgUnit, locationText: emp.locationText,
      email: emp.email, personalEmail: input.personalEmail.trim(), contact: input.contact.trim(), sumAssured: slab.text, premium: slab.premium,
      gst: slab.gst, total: slab.total, createdBy: existing?.createdBy ?? userOf(email), requestDate: existing?.requestDate ?? new Date().toISOString().slice(0, 10),
      nominees: activeNominees(input.nominees).map((n) => ({ ...n, name: n.name.trim(), share: n.share.trim() })),
    };
    write(POL_KEY, [...policies.filter((p) => p.reqno !== policy.reqno), policy]);
    return wait({ reqno: policy.reqno });
  },
  async deletePolicy(_email, reqno) {
    write(POL_KEY, read<Policy[]>(POL_KEY, []).filter((p) => p.reqno !== reqno));
    return wait(undefined);
  },
  async listPolicies(email, query) {
    const all = read<Policy[]>(POL_KEY, []);
    const rows = query.all ? all : query.empId ? all.filter((p) => p.empId === query.empId) : all.filter((p) => p.createdBy === userOf(email));
    return wait(rows.sort((a, b) => a.reqno.localeCompare(b.reqno)));
  },
  async saveLimits(_email, rows) {
    const limits = read<Record<string, string>>(LIM_KEY, {});
    rows.forEach((r) => (limits[r.empId] = r.limit));
    write(LIM_KEY, limits);
    return wait({ count: rows.length });
  },
  async sendSummary() {
    return wait(undefined);
  },
};

export const api: TermPolicyApi = IS_LIVE ? live : mock;

/** Mass upload: one SAVE per Excel row (each row goes through the same server-side rules), results reported per row. */
export async function massUpload(email: string, rows: { row: number; input: PolicyInput }[]): Promise<MassRowResult[]> {
  const out: MassRowResult[] = [];
  for (const { row, input } of rows) {
    try {
      const { reqno } = await api.savePolicy(email, input);
      out.push({ row, empId: input.empId, ok: true, message: `Saved as ${reqno}` });
    } catch (e) {
      out.push({ row, empId: input.empId, ok: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }
  return out;
}
