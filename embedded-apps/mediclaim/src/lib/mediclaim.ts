/**
 * ZMEDICLAIM_SRV operations (CONTRACT.md), one typed function per entity set / function import.
 *
 * Convention (CONTRACT "Conventions"): the gateway logs on with a technical user, so the signed-in hub email (lower case)
 * goes with every call - first in every list $filter, as the last key of every keyed read, as property Email on every
 * create / update and as parameter Email of every function import. ABAP flags are 'X' / '' strings (never booleans), amounts
 * are Edm.Decimal strings, dates /Date()/. Premiums are never sent as authoritative: SAP recomputes everything.
 */
import { getHubEmail } from './hubEmailLogin';
import { dec, eq, flag, fromSapDate, isX, num, odataKey, str, toSapDate, toSapDateLiteral } from './format';
import { navResults, plainEntity, sapCreate, sapDelete, sapFunction, sapGet, sapList, SapError } from './sap';
import type {
  BlockedEmployee, Employee, MediclaimContext, MemberInput, NonSapSelf, Policy, PolicyMember, PolicyReportRow, QuoteInput, QuoteResult,
  SubmitInput, SumInsuredOption, TopUpOption,
} from './types';

/** Hub login email, lower case. */
export const email = () => (getHubEmail() ?? '').trim().toLowerCase();

/** Company code / text the Web Dynpro stamped on a non-SAP employee (SPEC 2.2 step 4). */
export const NON_SAP_COMP_CODE = '1000';
export const NON_SAP_COMP_TEXT = 'Emami Limited';

/* ------------------------------- mappers ------------------------------- */

const mapContext = (r: any): MediclaimContext => {
  const year = str(r.Year);
  return {
    Email: str(r.Email),
    UserId: str(r.UserId),
    EmpId: str(r.EmpId),
    FullName: str(r.FullName),
    Year: year,
    YearText: str(r.YearText) || (year ? `${year}-${Number(year) + 1}` : ''),
    CutOffDate: fromSapDate(r.CutOffDate),
    InsurerMail: str(r.InsurerMail),
    // The contract defines AgeCalcDate = Year & '0131'; fall back to it if SAP leaves the property out.
    AgeCalcDate: fromSapDate(r.AgeCalcDate) ?? (year ? `${year}-01-31` : null),
    IsAuthUser: isX(r.IsAuthUser),
    IsHrAdmin: isX(r.IsHrAdmin),
    WindowOpen: isX(r.WindowOpen),
    MyReqNo: str(r.MyReqNo),
    MyCanChange: isX(r.MyCanChange),
  };
};

export const mapMember = (r: any): PolicyMember => ({
  ReqNo: str(r.ReqNo),
  SlNo: str(r.SlNo),
  Name: str(r.Name),
  Dob: fromSapDate(r.Dob),
  Gender: str(r.Gender),
  // '' is a real code (Father) - only trimmed, never defaulted.
  Relation: str(r.Relation),
  RelationText: str(r.RelationText),
  AgeInYrs: num(r.AgeInYrs),
  PreAmt: num(r.PreAmt),
  ActPre: num(r.ActPre),
  SumBase: num(r.SumBase),
  CrtDate: fromSapDate(r.CrtDate),
  IsNew: isX(r.IsNew),
});

const sortMembers = (m: PolicyMember[]) => [...m].sort((a, b) => Number(a.SlNo) - Number(b.SlNo));

const mapEmployee = (r: any): Employee => ({
  EmpId: str(r.EmpId),
  Email: str(r.Email),
  IsSapEmployee: isX(r.IsSapEmployee),
  Eligible: isX(r.Eligible),
  Reason: str(r.Reason),
  CompCode: str(r.CompCode),
  CompText: str(r.CompText),
  Dept: str(r.Dept),
  OuText: str(r.OuText),
  Design: str(r.Design),
  DesignText: str(r.DesignText),
  Location: str(r.Location),
  LocText: str(r.LocText),
  FirstName: str(r.FirstName),
  LastName: str(r.LastName),
  Dob: fromSapDate(r.Dob),
  AgeInYears: num(r.AgeInYears),
  GenderText: str(r.GenderText),
  Gender: str(r.Gender),
  CorpEmail: str(r.CorpEmail),
  PersonalEmail: str(r.PersonalEmail),
  Contact: str(r.Contact),
  CtcAbove5L: isX(r.CtcAbove5L),
  CtcCode: str(r.CtcCode),
  ExistingReqNo: str(r.ExistingReqNo),
  PrevYearReqNo: str(r.PrevYearReqNo),
  PrevMembers: sortMembers(navResults(r.PrevMembers).map(mapMember)),
});

const mapPolicy = (r: any): Policy => ({
  ReqNo: str(r.ReqNo),
  ReqDate: fromSapDate(r.ReqDate),
  CreatedBy: str(r.CreatedBy),
  Year: str(r.Year),
  EmpId: str(r.EmpId),
  CompCode: str(r.CompCode),
  CodeTxt: str(r.CodeTxt),
  Dept: str(r.Dept),
  OuText: str(r.OuText),
  Design: str(r.Design),
  DesignTxt: str(r.DesignTxt),
  Dob: fromSapDate(r.Dob),
  AgeInYrs: num(r.AgeInYrs),
  GenText: str(r.GenText),
  Gender: str(r.Gender),
  Location: str(r.Location),
  LocTxt: str(r.LocTxt),
  CorpEmail: str(r.CorpEmail),
  PersonalEmail: str(r.PersonalEmail),
  Contact: str(r.Contact),
  SumBase: num(r.SumBase),
  PreBase: num(r.PreBase),
  TopUpYes: isX(r.TopUpYes),
  TopUpPolicy: num(r.TopUpPolicy),
  TopUpPre: num(r.TopUpPre),
  TotalPre: num(r.TotalPre),
  EmpShare: num(r.EmpShare),
  Married: isX(r.Married),
  NoEmpIdSap: isX(r.NoEmpIdSap),
  NoEmpIdCtc: str(r.NoEmpIdCtc),
  DelFlag: isX(r.DelFlag),
  EmployerShare: r.EmployerShare === undefined || r.EmployerShare === null ? num(r.TotalPre) - num(r.EmpShare) : num(r.EmployerShare),
  CanChange: isX(r.CanChange),
  FullName: str(r.FullName),
  Email: str(r.Email),
  Members: sortMembers(navResults(r.Members).map(mapMember)),
  raw: plainEntity(r),
});

const mapReport = (r: any): PolicyReportRow => ({
  ReqNo: str(r.ReqNo),
  SlNo: str(r.SlNo),
  Year: str(r.Year),
  CompText: str(r.CompText),
  LocText: str(r.LocText),
  OuText: str(r.OuText),
  EmpId: str(r.EmpId),
  DesignText: str(r.DesignText),
  CtcAbove5L: isX(r.CtcAbove5L) || /^(yes|y)$/i.test(str(r.CtcAbove5L)),
  CorpEmail: str(r.CorpEmail),
  PersonalEmail: str(r.PersonalEmail),
  Contact: str(r.Contact),
  FamilyNo: str(r.FamilyNo),
  Name: str(r.Name),
  Dob: fromSapDate(r.Dob),
  AgeInYrs: num(r.AgeInYrs),
  Gender: str(r.Gender),
  Relation: str(r.Relation),
  SumBase: num(r.SumBase),
  PreBase: num(r.PreBase),
  TopUpYesNo: isX(r.TopUpYesNo) || /^(yes|y)$/i.test(str(r.TopUpYesNo)),
  TopUpPolicy: num(r.TopUpPolicy),
  TopUpPre: num(r.TopUpPre),
  TotalPre: num(r.TotalPre),
  PreAmt: num(r.PreAmt),
  EmpShare: num(r.EmpShare),
  EmployerShare: num(r.EmployerShare),
  CrtDate: fromSapDate(r.CrtDate),
  NewInd: isX(r.NewInd) || /^new$/i.test(str(r.NewInd)),
});

/* ------------------------------- reads ------------------------------- */

/** ContextSet(Email): identity, roles, active year, cut-off. */
export async function getContext(): Promise<MediclaimContext> {
  const e = email();
  return mapContext(await sapGet<any>('ContextSet', { Email: e }));
}

/** Sum-insured options of the active year (SumInsuredSet), ascending. */
export async function listSumInsured(year?: string): Promise<SumInsuredOption[]> {
  const rows = await sapList('SumInsuredSet', { filter: [eq('Email', email()), year && eq('Year', year)] });
  return rows
    .map((r): SumInsuredOption => ({ Year: str(r.Year), SumInsured: num(r.SumInsured), TopUpAllowed: isX(r.TopUpAllowed) }))
    .sort((a, b) => a.SumInsured - b.SumInsured);
}

export async function listTopUps(year?: string): Promise<TopUpOption[]> {
  const rows = await sapList('TopUpSet', { filter: [eq('Email', email()), year && eq('Year', year)] });
  return rows
    .map((r): TopUpOption => ({ Year: str(r.Year), TopUpAmount: num(r.TopUpAmount), Premium: num(r.Premium) }))
    .sort((a, b) => a.TopUpAmount - b.TopUpAmount);
}

/** EmployeeSet(EmpId, Email) with the previous-year family (PrevMembers): the Web Dynpro's "enter employee id + Enter" step. */
export async function fetchEmployee(empId: string): Promise<Employee> {
  return mapEmployee(await sapGet<any>('EmployeeSet', { EmpId: empId.trim(), Email: email() }, { expand: 'PrevMembers' }));
}

/** PolicySet(ReqNo, Email) with its members. */
export async function getPolicy(reqNo: string): Promise<Policy> {
  return mapPolicy(await sapGet<any>('PolicySet', { ReqNo: reqNo.trim(), Email: email() }, { expand: 'Members' }));
}

/** PolicySet list: Email is mandatory; the server scopes it to the caller's own policy unless the caller is an auth user. */
export async function searchPolicies(f: { empId?: string; year?: string; reqNo?: string } = {}): Promise<Policy[]> {
  const rows = await sapList('PolicySet', {
    filter: [eq('Email', email()), f.empId?.trim() && eq('EmpId', f.empId.trim()), f.year?.trim() && eq('Year', f.year.trim()), f.reqNo?.trim() && eq('ReqNo', f.reqNo.trim())],
  });
  return rows.map(mapPolicy).sort((a, b) => b.ReqNo.localeCompare(a.ReqNo));
}

/**
 * Last year's application (WD popup V_PREV_YR): EmployeeSet.PrevYearReqNo when SAP fills it, else the employee's non-deleted
 * policy of the previous year from the PolicySet list (Year = active year - 1). Returns null when there is none.
 */
export async function getPreviousYearPolicy(empId: string, activeYear: string): Promise<{ policy: Policy | null; reason: string }> {
  const e = await fetchEmployee(empId);
  if (e.PrevYearReqNo) return { policy: await getPolicy(e.PrevYearReqNo), reason: '' };
  const prevYear = String(Number(activeYear) - 1);
  const found = (await searchPolicies({ empId: empId.trim(), year: prevYear })).find((p) => !p.DelFlag);
  if (found) return { policy: await getPolicy(found.ReqNo), reason: '' };
  // An ineligible employee with no history: show SAP's reason unless it only says "a policy already exists".
  return { policy: null, reason: !e.Eligible && !e.ExistingReqNo ? e.Reason : '' };
}

/* ------------------------------- payload builders (exported for tests) ------------------------------- */

const pad2 = (n: number) => String(n).padStart(2, '0');

const memberPayload = (m: MemberInput, index: number) => ({
  Email: email(),
  ReqNo: '',
  SlNo: m.SlNo ?? pad2(index + 2),
  Name: m.Name.trim(),
  Dob: toSapDate(m.Dob),
  Relation: m.Relation,
});

/** The employee's own member row, only sent for a non-SAP employee (SAP knows everything about a PERNR). */
const nonSapSelfMember = (s: NonSapSelf) => ({
  Email: email(),
  ReqNo: '',
  SlNo: '01',
  Name: `${s.FirstName.trim()} ${s.LastName.trim()}`.trim(),
  Relation: '1',
  Gender: s.Gender,
  AgeInYrs: s.Age,
});

const nonSapProps = (s: NonSapSelf) => ({
  NoEmpIdSap: 'X',
  NoEmpIdCtc: s.Ctc,
  CompCode: NON_SAP_COMP_CODE,
  CodeTxt: NON_SAP_COMP_TEXT,
  OuText: s.Dept.trim(),
  DesignTxt: s.Position.trim(),
  LocTxt: s.Location.trim(),
  Gender: s.Gender,
  AgeInYrs: s.Age,
});

let quoteSeq = 0;

export function buildQuotePayload(q: QuoteInput) {
  return {
    QuoteId: String(++quoteSeq),
    Email: email(),
    EmpId: q.EmpId,
    SumInsured: dec(q.SumInsured),
    TopUpAmount: dec(q.TopUpAmount),
    ...(q.nonSap ? nonSapProps(q.nonSap) : {}),
    Members: [...(q.nonSap ? [nonSapSelfMember(q.nonSap)] : []), ...q.Members.map(memberPayload)],
  };
}

export function buildSubmitPayload(s: SubmitInput) {
  return {
    Email: email(),
    EmpId: s.EmpId,
    SumBase: dec(s.SumInsured),
    TopUpYes: flag(s.TopUpYes),
    TopUpPolicy: dec(s.TopUpYes ? s.TopUpAmount : 0),
    CorpEmail: s.CorpEmail.trim(),
    PersonalEmail: s.PersonalEmail.trim(),
    Contact: s.Contact.trim(),
    ...(s.nonSap ? nonSapProps(s.nonSap) : {}),
    Members: [...(s.nonSap ? [nonSapSelfMember(s.nonSap)] : []), ...s.Members.map(memberPayload)],
  };
}

/* ------------------------------- writes ------------------------------- */

/** QuoteSet deep POST (no persistence): the live premium calculation. SAP rule texts come back in Messages and in thrown errors, verbatim. */
export async function quote(q: QuoteInput): Promise<QuoteResult> {
  const r = await sapCreate<any>('QuoteSet', buildQuotePayload(q));
  const TotalPre = num(r?.TotalPre);
  const EmpShare = num(r?.EmpShare);
  return {
    PreBase: num(r?.PreBase),
    TopUpPre: num(r?.TopUpPre),
    TotalPre,
    EmpShare,
    EmployerShare: r?.EmployerShare === undefined || r?.EmployerShare === null ? TotalPre - EmpShare : num(r.EmployerShare),
    Messages: str(r?.Messages),
    Members: sortMembers(navResults(r?.Members).map(mapMember)),
  };
}

/** Submit = deep POST on PolicySet (SPEC 2.8, validations + numbering + mail are server side). Returns the created policy (with ReqNo). */
export async function submitPolicy(s: SubmitInput): Promise<Policy> {
  const created = mapPolicy(await sapCreate<any>('PolicySet', buildSubmitPayload(s)));
  if (!created.ReqNo) throw new SapError(502, 'INTERNAL', 'SAP saved the policy but returned no request number - check "My Mediclaim" for it.');
  return created;
}

/**
 * Change = "Add Nominees": deep POST /PolicySet carrying the existing ReqNo (SAP Gateway refuses a PUT with inline Members:
 * "Inline component is not defined or not allowed (HTTP PUT)"). The policy is sent as it was read; existing members keep their
 * SlNo, new ones go with the next SlNo. SI / top-up / contact are immutable server-side. Returns the changed policy.
 */
export async function addNominees(policy: Policy, existing: PolicyMember[], added: MemberInput[]): Promise<Policy> {
  const lastSl = existing.reduce((mx, m) => Math.max(mx, Number(m.SlNo) || 0), 1);
  const body = {
    ...policy.raw,
    Email: email(),
    Members: [
      ...existing.map((m) => ({
        Email: email(),
        ReqNo: policy.ReqNo,
        SlNo: m.SlNo,
        Name: m.Name,
        ...(m.Dob ? { Dob: toSapDate(m.Dob) } : {}),
        Relation: m.Relation,
        Gender: m.Gender,
      })),
      ...added.map((m, i) => ({ ...memberPayload(m, i), ReqNo: policy.ReqNo, SlNo: pad2(lastSl + i + 1) })),
    ],
  };
  await sapCreate('PolicySet', body);
  return getPolicy(policy.ReqNo);
}

/** DeletePolicy(ReqNo, Email): HR admin only, active year only (SAP enforces and answers with the legacy texts). */
export async function deletePolicy(reqNo: string): Promise<Policy> {
  return mapPolicy(await sapFunction<any>('DeletePolicy', { ReqNo: odataKey(reqNo), Email: odataKey(email()) }));
}

/** SetCutOff(CutOffDate, InsurerMail, Email): HR admin only. Returns the new context. */
export async function setCutOff(cutOffDate: string, insurerMail: string): Promise<MediclaimContext> {
  return mapContext(
    await sapFunction<any>('SetCutOff', { CutOffDate: toSapDateLiteral(cutOffDate), InsurerMail: odataKey(insurerMail.trim().toLowerCase()), Email: odataKey(email()) })
  );
}

/* ------------------------------- blocked employees ------------------------------- */

const mapBlocked = (r: any): BlockedEmployee => ({ EmpId: str(r.EmpId), Name: str(r.Name) });

export async function listBlocked(): Promise<BlockedEmployee[]> {
  const rows = await sapList('BlockedEmployeeSet', { filter: [eq('Email', email())] });
  return rows.map(mapBlocked).sort((a, b) => a.EmpId.localeCompare(b.EmpId));
}

/** One row per POST (add / update). EmpId is PERNR, 8 digits. */
export async function addBlocked(empId: string, name: string): Promise<BlockedEmployee> {
  return mapBlocked(await sapCreate('BlockedEmployeeSet', { EmpId: padPernr(empId), Name: name.trim(), Email: email() }));
}

/** DELETE - the Azure gateway had no DELETE route for the other apps; SapError GATEWAY_UNSUPPORTED if it still has none. */
export async function removeBlocked(empId: string): Promise<void> {
  await sapDelete('BlockedEmployeeSet', { EmpId: padPernr(empId), Email: email() });
}

/** PERNR_D is NUMC 8. */
export const padPernr = (v: string) => v.trim().replace(/^0+(?=\d)/, '').padStart(8, '0');

/* ------------------------------- HR download ------------------------------- */

/** PolicyReportSet: one row per member (flattened) for one year. Excludes deleted policies server-side. The location filter is applied on the screen (LocText). */
export async function listPolicyReport(year: string): Promise<PolicyReportRow[]> {
  const rows = await sapList('PolicyReportSet', { filter: [eq('Email', email()), eq('Year', year)] });
  return rows.map(mapReport).sort((a, b) => a.ReqNo.localeCompare(b.ReqNo) || Number(a.SlNo) - Number(b.SlNo));
}
