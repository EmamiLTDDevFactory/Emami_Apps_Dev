/**
 * Typed views of the ZMEDICLAIM_SRV entity sets (CONTRACT.md). Property names are the SAP property names exactly.
 * Value conversion done by mediclaim.ts: dates -> 'YYYY-MM-DD' | null, amounts / counts -> number, ABAP flags ('X' / '') -> boolean.
 * Relation / Gender keep the SAP codes (Relation: ''=Father '1'=Self '3'=Mother '4'=Spouse '5'=Son '6'=Daughter '7'=Child 3;
 * Gender: '1' male, '2' female).
 */

/** ContextSet (key Email) - who the caller is, the active period and cut-off. */
export interface MediclaimContext {
  Email: string;
  UserId: string;
  /** Own PERNR, '' when the email has none (non-SAP employee). */
  EmpId: string;
  FullName: string;
  Year: string;
  YearText: string;
  CutOffDate: string | null;
  InsurerMail: string;
  AgeCalcDate: string | null;
  IsAuthUser: boolean;
  IsHrAdmin: boolean;
  WindowOpen: boolean;
  MyReqNo: string;
  MyCanChange: boolean;
}

/** SumInsuredSet (key Year, SumInsured, Email). */
export interface SumInsuredOption {
  Year: string;
  SumInsured: number;
  TopUpAllowed: boolean;
}

/** TopUpSet (key Year, TopUpAmount, Email). Premium is informational only; the quote is authoritative. */
export interface TopUpOption {
  Year: string;
  TopUpAmount: number;
  Premium: number;
}

/** PolicyMemberSet (key ReqNo, SlNo, Email). SlNo '01' = the employee. */
export interface PolicyMember {
  ReqNo: string;
  SlNo: string;
  Name: string;
  Dob: string | null;
  Gender: string;
  Relation: string;
  RelationText: string;
  AgeInYrs: number;
  /** Employee share. */
  PreAmt: number;
  /** Full premium. */
  ActPre: number;
  SumBase: number;
  CrtDate: string | null;
  IsNew: boolean;
}

/** EmployeeSet (key EmpId, Email) - result of the eligibility fetch (SPEC 2.2). */
export interface Employee {
  EmpId: string;
  Email: string;
  IsSapEmployee: boolean;
  Eligible: boolean;
  /** Verbatim legacy message when not eligible. */
  Reason: string;
  CompCode: string;
  CompText: string;
  Dept: string;
  OuText: string;
  Design: string;
  DesignText: string;
  Location: string;
  LocText: string;
  FirstName: string;
  LastName: string;
  Dob: string | null;
  AgeInYears: number;
  GenderText: string;
  Gender: string;
  CorpEmail: string;
  PersonalEmail: string;
  Contact: string;
  CtcAbove5L: boolean;
  CtcCode: string;
  ExistingReqNo: string;
  PrevYearReqNo: string;
  /** Navigation PrevMembers: previous-year family carried forward. */
  PrevMembers: PolicyMember[];
}

/** PolicySet (key ReqNo, Email) = ZMEDI_EMP + EmployerShare + CanChange. */
export interface Policy {
  ReqNo: string;
  ReqDate: string | null;
  CreatedBy: string;
  Year: string;
  EmpId: string;
  CompCode: string;
  CodeTxt: string;
  Dept: string;
  OuText: string;
  Design: string;
  DesignTxt: string;
  Dob: string | null;
  AgeInYrs: number;
  GenText: string;
  Gender: string;
  Location: string;
  LocTxt: string;
  CorpEmail: string;
  PersonalEmail: string;
  Contact: string;
  SumBase: number;
  PreBase: number;
  TopUpYes: boolean;
  TopUpPolicy: number;
  TopUpPre: number;
  TotalPre: number;
  EmpShare: number;
  Married: boolean;
  NoEmpIdSap: boolean;
  NoEmpIdCtc: string;
  DelFlag: boolean;
  EmployerShare: number;
  CanChange: boolean;
  /** Not in the contract's property list; shown only if SAP sends it (list screens fall back to the self member). */
  FullName: string;
  Email: string;
  Members: PolicyMember[];
  /** The entity exactly as read (no __metadata / navigation): the base of the PUT that adds nominees. */
  raw: Record<string, any>;
}

/** Input row of QuoteSet / PolicySet deep create. Relation is the SAP code ('' = Father). */
export interface MemberInput {
  Name: string;
  /** 'YYYY-MM-DD'. */
  Dob: string;
  Relation: string;
  /** Change flow: SlNo of an existing member, '' for a new one. */
  SlNo?: string;
}

/** Self details a non-SAP employee types in (SPEC 2.1/2.3). */
export interface NonSapSelf {
  FirstName: string;
  LastName: string;
  /** '1' male, '2' female. */
  Gender: string;
  Age: number;
  /** Department / Position / Location are free text. */
  Dept: string;
  Position: string;
  Location: string;
  /** '01' Below 5 LPA, '02' Above 5 LPA, '03' 5 LPA. */
  Ctc: string;
}

export interface QuoteInput {
  EmpId: string;
  SumInsured: number;
  /** 0 = no top-up. */
  TopUpAmount: number;
  Members: MemberInput[];
  nonSap?: NonSapSelf;
}

export interface QuoteResult {
  PreBase: number;
  TopUpPre: number;
  TotalPre: number;
  EmpShare: number;
  EmployerShare: number;
  /** Verbatim legacy error text, '' when the quote is fine. */
  Messages: string;
  /** May include the employee's own row (Relation '1'). */
  Members: PolicyMember[];
}

export interface SubmitInput {
  EmpId: string;
  SumInsured: number;
  TopUpYes: boolean;
  TopUpAmount: number;
  CorpEmail: string;
  PersonalEmail: string;
  Contact: string;
  Members: MemberInput[];
  nonSap?: NonSapSelf;
}

export interface BlockedEmployee {
  EmpId: string;
  Name: string;
}

/** PolicyReportSet row (HR download, SPEC 5.4). */
export interface PolicyReportRow {
  ReqNo: string;
  SlNo: string;
  Year: string;
  CompText: string;
  LocText: string;
  OuText: string;
  EmpId: string;
  DesignText: string;
  CtcAbove5L: boolean;
  CorpEmail: string;
  PersonalEmail: string;
  Contact: string;
  FamilyNo: string;
  Name: string;
  Dob: string | null;
  AgeInYrs: number;
  Gender: string;
  Relation: string;
  SumBase: number;
  PreBase: number;
  TopUpYesNo: boolean;
  TopUpPolicy: number;
  TopUpPre: number;
  TotalPre: number;
  PreAmt: number;
  EmpShare: number;
  EmployerShare: number;
  CrtDate: string | null;
  NewInd: boolean;
}
