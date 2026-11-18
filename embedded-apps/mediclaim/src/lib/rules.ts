/**
 * Web Dynpro rules that are checked on the screen before a round trip (SPEC.md 2.3, 2.5 pre-validations, 2.6, 2.8 steps 1-13), with
 * the verbatim legacy message texts. SAP re-checks all of them (and the ones that need data - CTC, PA0002 tamper check, duplicate,
 * cut-off); anything SAP rejects is shown as SAP words it. Nothing here computes a premium.
 */
import type { NonSapSelf } from './types';

export const MAX_FAMILY_ROWS = 6;
export const MAX_CHILDREN = 3;
export const CHILD_AGE_LIMIT = 30;
/** Top-up is offered for this sum insured only (SumInsuredSet.TopUpAllowed carries the same fact). */
export const TOP_UP_SUM_INSURED = 500000;

/* ----------------------------- relations / gender ----------------------------- */

/**
 * Relation on the screen: 'F' = Father (SAP code is the empty string, which is why the screen needs its own code),
 * '3' Mother, '4' Spouse, '5' Son, '6' Daughter. Domain ZREL1 (the family dropdown) has no Self and no Child 3.
 */
export type UiRelation = 'F' | '3' | '4' | '5' | '6';

export const RELATION_OPTIONS: { code: UiRelation; label: string }[] = [
  { code: 'F', label: 'Father' },
  { code: '3', label: 'Mother' },
  { code: '4', label: 'Spouse' },
  { code: '5', label: 'Son' },
  { code: '6', label: 'Daughter' },
];

export const relToWire = (r: UiRelation): string => (r === 'F' ? '' : r);

/** SAP relation code -> label (ZREL: '' Father, '1' Self, '3' Mother, '4' Spouse, '5' Son, '6' Daughter, '7' Child 3). */
export function relLabel(wire: string, gender?: string): string {
  switch (wire) {
    case '': return 'Father';
    case '1': return 'Self';
    case '3': return 'Mother';
    case '4': return 'Spouse';
    case '5': return 'Son';
    case '6': return 'Daughter';
    case '7': return gender === '1' ? 'Son' : gender === '2' ? 'Daughter' : 'Child 3';
    default: return wire;
  }
}

/** SAP member (relation 5/6/7 normalised by gender, as the WD display does) -> screen relation. */
export function relFromWire(wire: string, gender?: string): UiRelation {
  if (wire === '') return 'F';
  if (wire === '7') return gender === '2' ? '6' : '5';
  if (wire === '3' || wire === '4' || wire === '5' || wire === '6') return wire;
  return 'F';
}

export const genderLabel = (g: string) => (g === '1' ? 'Male' : g === '2' ? 'Female' : g === '' ? '' : g);

/** Gender is never typed: it follows from the relation (SPEC 2.5/2.6). Spouse = opposite of the employee. */
export function genderForRelation(r: UiRelation, employeeGender: string): string {
  switch (r) {
    case 'F': return '1';
    case '3': return '2';
    case '4': return employeeGender === '1' ? '2' : '1';
    case '5': return '1';
    case '6': return '2';
  }
}

/* --------------------------------- age --------------------------------- */

/**
 * Age at the period's AgeCalcDate, the way the WD computed it (HRCM_TIME_PERIOD_CALCULATE + rounding, SPEC 2.5): whole
 * years, +1 when 6 or more months are left over; under one year counts as 1. DISPLAY / pre-check only - SAP's age is authoritative.
 */
export function ageAt(dobIso: string, asOfIso: string): number {
  const [y1, m1, d1] = dobIso.split('-').map(Number);
  const [y2, m2, d2] = asOfIso.split('-').map(Number);
  let years = y2 - y1;
  let months = m2 - m1;
  let days = d2 - d1;
  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(y2, m2 - 1, 0)).getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years !== 0 && months >= 6) years += 1;
  if (years === 0 && (months !== 0 || days !== 0)) years = 1;
  return years;
}

/* ------------------------------ field checks ------------------------------ */

/** SPEC 2.8 step 3/5: \w+(\.\w+)*@(\w+\.)+(\w{2,4}), ignore case, whole value. */
export const MAIL_REGEX = /^\w+(\.\w+)*@(\w+\.)+(\w{2,4})$/i;

export interface Problem {
  message: string;
  /** Form field to highlight. */
  field: string;
}

/** SPEC 2.3: before the sum insured can be chosen a non-SAP employee must have filled these, in this order. */
export function checkNonSapForSumInsured(f: {
  dept: string; position: string; firstName: string; lastName: string; gender: string; location: string;
  corpEmail: string; personalEmail: string; contact: string; age: string; ctc: string;
}): Problem | null {
  if (!f.dept.trim()) return { message: 'Provide Department', field: 'dept' };
  if (!f.position.trim()) return { message: 'Provide Position', field: 'position' };
  if (!f.firstName.trim()) return { message: 'Provide First Name', field: 'firstName' };
  if (!f.lastName.trim()) return { message: 'Provide Last Name', field: 'lastName' };
  if (!f.gender) return { message: 'Select Gender', field: 'gender' };
  if (!f.location.trim()) return { message: 'Provide Location', field: 'location' };
  if (!f.corpEmail.trim() && !f.personalEmail.trim()) return { message: 'Provide either corporate mail id or personal email id or both', field: 'personalEmail' };
  if (!f.contact.trim()) return { message: 'Provide Mobile Number', field: 'contact' };
  if (!f.age.trim() || !(Number(f.age) > 0)) return { message: 'Provide Age in Years', field: 'age' };
  if (!f.ctc) return { message: 'Select CTC', field: 'ctc' };
  return null;
}

export interface FamilyRowInput {
  name: string;
  dob: string;
  relation: UiRelation;
}

/** Rows count only when the DOB is filled (SPEC 2.5/2.6; the name is not validated). */
export const activeRows = <T extends { dob: string }>(rows: T[]) => rows.filter((r) => r.dob);

/** SPEC 2.5 pre-validations 1-3 (the CTC check needs SAP and comes back in the quote Messages). */
export function checkQuoteInputs(sumInsured: number, rows: FamilyRowInput[]): Problem | null {
  if (!sumInsured) return { message: 'Provide the sum insured under base policy.', field: 'sumInsured' };
  const used = activeRows(rows);
  const count = (r: UiRelation) => used.filter((x) => x.relation === r).length;
  if (count('F') > 1 || count('3') > 1 || count('4') > 1) return { message: 'Relation Father/Mother/Spouse should appear exactly once.', field: 'rows' };
  if (count('5') + count('6') > MAX_CHILDREN) return { message: 'Upto 3 children can be added under the policy.', field: 'rows' };
  return null;
}

export interface SubmitCheckInput {
  empId: string;
  fetched: boolean;
  isSap: boolean;
  firstName: string;
  corpEmail: string;
  personalEmail: string;
  contact: string;
  sumInsured: number;
  topUpYes: boolean;
  topUpAmount: number;
  rows: FamilyRowInput[];
  /** Age of each active row at AgeCalcDate (SAP's age arrives with the quote and is preferred when present). */
  rowAges: (number | undefined)[];
}

/** SPEC 2.8 validations 1-13 in the original order; first failure wins. */
export function checkSubmit(i: SubmitCheckInput): Problem | null {
  if (!i.empId.trim()) return { message: 'Enter Employee ID and hit enter.', field: 'empId' };
  if (!i.fetched) return { message: 'Enter a valid employee id and try again.', field: 'empId' };
  if (!i.isSap && i.corpEmail.trim() && !MAIL_REGEX.test(i.corpEmail.trim())) return { message: 'Invalid Mail ID.', field: 'corpEmail' };
  if (!i.corpEmail.trim() && !i.personalEmail.trim()) return { message: 'Enter personal mail id.', field: 'personalEmail' };
  if (i.personalEmail.trim() && !MAIL_REGEX.test(i.personalEmail.trim())) return { message: 'Invalid Mail ID.', field: 'personalEmail' };
  const contact = i.contact.trim();
  if (!contact) return { message: 'Enter mobile number.', field: 'contact' };
  const letters = contact.match(/[A-Za-z]/g);
  if (letters) return { message: `Invalid characters ${letters.join('')} in mobile number ${contact}`, field: 'contact' };
  // "exactly 10 digits": the legacy check was strlen <> 10; anything but digits is refused with the same text.
  if (!/^\d{10}$/.test(contact)) return { message: 'Enter 10 digits for the mobile number', field: 'contact' };
  if (!i.sumInsured) return { message: 'Enter amount insured under base policy.', field: 'sumInsured' };
  if (i.topUpYes && !i.topUpAmount) return { message: 'Enter amount insured under top up policy.', field: 'topUpAmount' };
  if (i.isSap && !i.firstName.trim()) return { message: 'Enter Employee ID and hit enter.', field: 'empId' };
  const calc = checkQuoteInputs(i.sumInsured, i.rows);
  if (calc) return calc;
  const used = activeRows(i.rows);
  const over = used.some((r, idx) => (r.relation === '5' || r.relation === '6') && (i.rowAges[idx] ?? 0) > CHILD_AGE_LIMIT);
  if (over) return { message: 'Children above 30 years old cannot be covered under the policy', field: 'rows' };
  return null;
}

export const ctcLabel = (code: string) => (code === '01' ? 'Below 5 LPA' : code === '02' ? 'Above 5 LPA' : code === '03' ? '5 LPA' : code);
export const CTC_OPTIONS = ['01', '02', '03'].map((c) => ({ code: c, label: ctcLabel(c) }));

export function toNonSapSelf(f: {
  dept: string; position: string; firstName: string; lastName: string; gender: string; location: string; age: string; ctc: string;
}): NonSapSelf {
  return {
    Dept: f.dept, Position: f.position, FirstName: f.firstName, LastName: f.lastName, Gender: f.gender, Location: f.location,
    Age: Math.round(Number(f.age)), Ctc: f.ctc,
  };
}
