// The Web Dynpro's submit rules (view MAIN, method ONACTIONSUBMIT), in one place. The SAP class
// ZCL_LIFE_INS_UTILS->SAVE_POLICY enforces the same rules and is the authority; this copy gives the
// form instant feedback and is also what the mock backend runs.
import { MAX_NOMINEES, type Nominee } from '../types/policy';

export const MAIL_RE = /^\w+([.-]\w+)*@(\w+[.-])+\w{2,}$/;

/** "50 LAKHS" -> 5000000; 0 when the text is not "<number> <unit>". */
export function limitToRupees(limit: string): number {
  const num = /^(\d+)\s/.exec(`${limit.trim()} `)?.[1];
  return num ? Number(num) * 100000 : 0;
}

export function activeNominees(nominees: Nominee[]): Nominee[] {
  return nominees.filter((n) => n.name.trim() || n.share.trim());
}

export function shareTotal(nominees: Nominee[]): number {
  return activeNominees(nominees).reduce((s, n) => s + (Number(n.share) || 0), 0);
}

export interface FormCheck {
  personalEmail: string;
  contact: string;
  hasCompanyEmail: boolean;
  sumAssured: string;
  nominees: Nominee[];
}

/** Returns the first problem as field + message, or null when the form can be submitted. */
export function checkPolicyForm(f: FormCheck): { field: string; message: string } | null {
  if (!f.hasCompanyEmail) {
    if (!f.personalEmail.trim()) return { field: 'personalEmail', message: 'Enter personal mail id.' };
    if (!MAIL_RE.test(f.personalEmail.trim())) return { field: 'personalEmail', message: 'Invalid Mail ID.' };
  }
  const contact = f.contact.trim();
  if (!contact) return { field: 'contact', message: 'Enter mobile number.' };
  if (/\D/.test(contact)) return { field: 'contact', message: 'Mobile number must contain digits only.' };
  if (contact.length !== 10) return { field: 'contact', message: 'Enter 10 digits for the mobile number' };
  if (!f.sumAssured) return { field: 'sumAssured', message: 'Enter the sum to be insured.' };
  const noms = activeNominees(f.nominees);
  if (noms.length === 0) return { field: 'nominees', message: 'Add at least one nominee.' };
  if (noms.length > MAX_NOMINEES) return { field: 'nominees', message: `A maximum of ${MAX_NOMINEES} nominees is allowed.` };
  for (const n of noms) {
    if (!n.name.trim() || !n.share.trim()) return { field: 'nominees', message: 'Each nominee needs a name and a share.' };
    if (!n.relation) return { field: 'nominees', message: `Choose a relation for nominee ${n.name}.` };
    if (!/^\d+$/.test(n.share.trim()) || Number(n.share) < 1) return { field: 'nominees', message: `Share for ${n.name} must be a whole number.` };
  }
  if (shareTotal(f.nominees) !== 100) return { field: 'nominees', message: 'Distribution of share is not 100%' };
  return null;
}

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
