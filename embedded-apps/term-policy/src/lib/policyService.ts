// No SAP service exists yet for Term Policy submissions. This mocks what will become POST/GET
// against ZINSURANCE_SRV's ZTermPolicySet entity set (create via POST with the same payload shape
// as TermPolicyDraft below, SAP itself assigning id/submittedAt/status; "my submission" via GET
// with $filter=Email eq '<email>'; unfiltered GetEntitySet for the admin report) — see
// fm-po-deviation/src/lib/sapClient.ts for the exact axios call shape to use once that service
// exists. Until then, submissions are kept in this browser's localStorage only (mirrors
// embedded-apps/payment-tracking's po-creation.tsx mock-persistence pattern — "kept only in this
// browser, never sent anywhere"). Every function below is async and shaped exactly like the real
// SAP calls will be, so swapping the implementation later requires no caller-side changes.
import type { EmployeeOrgDetails, TermPolicyDraft, TermPolicySubmission } from '../types/policy';
import { listMockDirectoryEmployees } from './orgService';

const TERM_KEY = 'term-policy-submissions-v1';
const SEEDED_KEY = 'term-policy-seeded-v1';

function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function readList<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, list: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // best-effort only — a private-browsing tab or a full storage quota shouldn't break the form
  }
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Seeds a handful of sample submissions on first load only, so the Admin report has content to
 * show immediately instead of an empty table — guarded by SEEDED_KEY so it never re-runs (and
 * never overwrites real submissions made afterward) on a later visit. */
function ensureSeeded(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(SEEDED_KEY)) return;
  } catch {
    return;
  }

  const employees = listMockDirectoryEmployees();
  const pick = (i: number): EmployeeOrgDetails => employees[i % employees.length];

  const seed: TermPolicySubmission[] = [
    { id: newId('TRM'), employee: pick(0), sumAssured: '₹50,00,000',
      nominees: [{ name: 'Rohan Sharma', relationship: 'Spouse', dob: '1988-03-12', contactNumber: '9830012345', sharePercent: 100 }],
      isSmoker: false, hasCriticalIllness: false, criticalIllnessDetails: '', hasExistingTermCover: false,
      existingTermCoverAmount: '', heightCm: '162', weightKg: '58', effectiveDate: '2026-01-01',
      submittedAt: daysAgoIso(19), status: 'Submitted' },
    { id: newId('TRM'), employee: pick(1), sumAssured: '₹25,00,000',
      nominees: [{ name: 'Sunita Verma', relationship: 'Parent', dob: '1965-08-02', contactNumber: '9911223344', sharePercent: 100 }],
      isSmoker: true, hasCriticalIllness: false, criticalIllnessDetails: '', hasExistingTermCover: true,
      existingTermCoverAmount: '₹10,00,000', heightCm: '175', weightKg: '80', effectiveDate: '2026-01-01',
      submittedAt: daysAgoIso(12), status: 'Submitted' },
    { id: newId('TRM'), employee: pick(2), sumAssured: '₹1,00,00,000',
      nominees: [
        { name: 'Sourav Das', relationship: 'Spouse', dob: '1985-11-30', contactNumber: '9800112233', sharePercent: 60 },
        { name: 'Ritu Das', relationship: 'Parent', dob: '1960-02-11', contactNumber: '9800112200', sharePercent: 40 },
      ],
      isSmoker: false, hasCriticalIllness: true, criticalIllnessDetails: 'Family history of diabetes.', hasExistingTermCover: false,
      existingTermCoverAmount: '', heightCm: '168', weightKg: '64', effectiveDate: '2026-01-01',
      submittedAt: daysAgoIso(7), status: 'Submitted' },
    { id: newId('TRM'), employee: pick(5), sumAssured: '₹75,00,000',
      nominees: [{ name: 'Rekha Singh', relationship: 'Spouse', dob: '1982-05-25', contactNumber: '9845011223', sharePercent: 100 }],
      isSmoker: false, hasCriticalIllness: false, criticalIllnessDetails: '', hasExistingTermCover: false,
      existingTermCoverAmount: '', heightCm: '171', weightKg: '76', effectiveDate: '2026-01-01',
      submittedAt: daysAgoIso(3), status: 'Submitted' },
    { id: newId('TRM'), employee: pick(6), sumAssured: '₹50,00,000',
      nominees: [{ name: 'Manoj Gupta', relationship: 'Spouse', dob: '1991-10-08', contactNumber: '9830099887', sharePercent: 100 }],
      isSmoker: false, hasCriticalIllness: false, criticalIllnessDetails: '', hasExistingTermCover: false,
      existingTermCoverAmount: '', heightCm: '159', weightKg: '55', effectiveDate: '2026-01-01',
      submittedAt: daysAgoIso(0), status: 'Submitted' },
  ];

  writeList(TERM_KEY, seed);
  try {
    window.localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    // best-effort — worst case seeding just runs again next time
  }
}

export async function getMyTermPolicySubmission(email: string): Promise<TermPolicySubmission | null> {
  ensureSeeded();
  const key = email.trim().toLowerCase();
  const list = readList<TermPolicySubmission>(TERM_KEY);
  const found = list.find((s) => s.employee.email.toLowerCase() === key) ?? null;
  return delay(found);
}

/** Upserts by employee email — a resubmission replaces the previous one rather than duplicating
 * it, since only the latest declaration should count. */
export async function submitTermPolicy(employee: EmployeeOrgDetails, data: TermPolicyDraft): Promise<TermPolicySubmission> {
  ensureSeeded();
  const list = readList<TermPolicySubmission>(TERM_KEY);
  const submission: TermPolicySubmission = {
    ...data,
    id: newId('TRM'),
    employee,
    submittedAt: new Date().toISOString(),
    status: 'Submitted',
  };
  const key = employee.email.trim().toLowerCase();
  const next = [...list.filter((s) => s.employee.email.toLowerCase() !== key), submission];
  writeList(TERM_KEY, next);
  return delay(submission);
}

export async function listTermPolicySubmissions(): Promise<TermPolicySubmission[]> {
  ensureSeeded();
  return delay(readList<TermPolicySubmission>(TERM_KEY));
}
