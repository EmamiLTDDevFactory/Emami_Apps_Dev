// SAP client for the OData V2 service ZLIFE_INS_SRV, through the shared Azure SAP gateway (same call shape as
// gate-entry/src/lib/sap.ts and mediclaim/src/lib/sap.ts). No mock data and no localStorage data: every rule lives in
// SAP (ZCL_LIFE_INS_UTILS, see ../../sap/README.md). While the service is not registered the app shows
// "Term Life service not available (SAP)" with a Try again button, like Mediclaim.
// The gateway passes only GET and POST, so every write is a POST. It signs in to SAP with its technical user, so SAP
// cannot tell who the person is: every call carries the hub email and the SAP class derives user, role and employee from it.
import type { EmployeeInfo, LimitRow, MassRowResult, Nominee, Policy, PolicyInput, Profile, SapRole, SumOption } from '../types/policy';
import { activeNominees } from './validate';
import { SAP_BASE_URL, SAP_SERVICE } from './config';

export class TermPolicyError extends Error {
  constructor(message: string, public status = 400, public field?: string) {
    super(message);
    this.name = 'TermPolicyError';
  }
}

/** The service or gateway is not there (as opposed to a rule SAP enforced). */
export const isServiceDown = (e: unknown) => e instanceof TermPolicyError && (e.status === 501 || e.status === 502 || e.status === 503);

export interface TermPolicyApi {
  getProfile(email: string): Promise<Profile>;
  getEmployee(email: string, empId: string): Promise<EmployeeInfo>;
  getSumOptions(email: string, empId: string): Promise<SumOption[]>;
  savePolicy(email: string, input: PolicyInput): Promise<{ reqno: string }>;
  deletePolicy(email: string, reqno: string): Promise<void>;
  /** all = every active policy of the year (admin download); empId = one employee; neither = the caller's own. */
  listPolicies(email: string, q: { empId?: string; all?: boolean }): Promise<Policy[]>;
  saveLimits(email: string, rows: LimitRow[]): Promise<{ count: number }>;
  sendSummary(email: string, reqnos: string[]): Promise<void>;
}

const BASE = SAP_BASE_URL;
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
  if (status === 404 && !message) return new TermPolicyError(`The SAP service ${SAP_SERVICE} is not available on the gateway.`, 503);
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

export const api: TermPolicyApi = {
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
