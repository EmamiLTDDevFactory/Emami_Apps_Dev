// Shapes of the Term Life policy contract (OData service ZLIFE_INS_SRV, see ../../sap/README.md).
// Field meaning comes from the Web Dynpro ZWD_MEDICAIM_NOMINEE and tables ZLIFE_EMP / ZLIFE_FAMILY.

/** ZMEDI_AUTH_USERS: flag R = ADMIN (download / delete / limits / mail), flag E = EDITOR (apply for anyone, change). */
export type SapRole = 'USER' | 'EDITOR' | 'ADMIN';

export interface Profile {
  email: string;
  /** SAP user name (lower case) that owns this mail in the user master; the key used in ZMEDI_AUTH_USERS and ZLIFE_EMP-CREATED_BY. */
  user: string;
  role: SapRole;
  /** Employee number found from the company mail in HR infotype 0105; empty if none. */
  empId: string;
  activeYear: string;
}

export interface EmployeeInfo {
  empId: string;
  firstName: string;
  lastName: string;
  dob: string; // yyyy-mm-dd
  age: number;
  gender: string;
  companyCode: string;
  companyName: string;
  department: string;
  orgUnit: string;
  designation: string;
  location: string;
  locationText: string;
  /** Company mail from HR. When empty the applicant must enter a personal mail. */
  email: string;
  /** Per-employee cap, e.g. "50 LAKHS" (ZLIFE_INS_LIMIT). Empty = no limit row. */
  limitText: string;
  year: string;
}

export interface SumOption {
  text: string; // "50 LAKHS"
  amount: number; // rupees
  premium: number;
  gst: number;
  total: number;
}

export type RelationCode = '3' | '4' | '5' | '6';
export const RELATIONS: { code: RelationCode; label: string }[] = [
  { code: '5', label: 'Spouse' },
  { code: '6', label: 'Son' },
  { code: '3', label: 'Father' },
  { code: '4', label: 'Mother' },
];
export const relationLabel = (code: string) => RELATIONS.find((r) => r.code === code)?.label ?? code;
export const MAX_NOMINEES = 6;

export interface Nominee {
  name: string;
  relation: RelationCode | '';
  /** Whole-number percentage, kept as text because the SAP field is CHAR3. */
  share: string;
}

export interface Policy {
  reqno: string;
  year: string;
  empId: string;
  employeeName: string;
  designation: string;
  orgUnit: string;
  locationText: string;
  email: string;
  personalEmail: string;
  contact: string;
  sumAssured: string;
  premium: number;
  gst: number;
  total: number;
  createdBy: string;
  requestDate: string;
  nominees: Nominee[];
}

export interface PolicyInput {
  /** Present = change an existing request. */
  reqno?: string;
  empId: string;
  sumAssured: string;
  personalEmail: string;
  contact: string;
  nominees: Nominee[];
}

export interface LimitRow {
  empId: string;
  limit: string; // "50 LAKHS"
}

export interface MassRowResult {
  row: number;
  empId: string;
  ok: boolean;
  message: string;
}
