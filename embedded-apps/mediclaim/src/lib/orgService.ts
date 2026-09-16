// No SAP service exists yet for employee org details. This mocks what will become a GET against
// ZHR_EMPLOYEE_ORG_SRV's EmployeeOrgSet ($filter=Email eq '<email>'), same OData v2 JSON shape
// every other SAP integration in this repo unpacks (see fm-po-deviation/src/lib/sapClient.ts) —
// swap the body of fetchEmployeeOrgDetails for a real axios GET against that entity set when the
// service exists; every caller already awaits a Promise<EmployeeOrgDetails>, so no caller-side
// change will be needed.
import type { EmployeeOrgDetails } from '../types/policy';

const MOCK_DIRECTORY: Record<string, EmployeeOrgDetails> = {
  'priya.sharma@emamigroup.com': {
    employeeId: 'EMP10234', name: 'Priya Sharma', email: 'priya.sharma@emamigroup.com',
    designation: 'Senior Manager - Finance', department: 'Finance', grade: 'M3', location: 'Kolkata',
    companyCode: '1000', dateOfJoining: '2016-07-11', reportingManager: 'Anil Kapoor', costCenter: 'CC-1002',
  },
  'rahul.verma@emamigroup.com': {
    employeeId: 'EMP10891', name: 'Rahul Verma', email: 'rahul.verma@emamigroup.com',
    designation: 'Executive - IT', department: 'IT', grade: 'E2', location: 'Mumbai',
    companyCode: '1000', dateOfJoining: '2021-01-18', reportingManager: 'Sunita Rao', costCenter: 'CC-2004',
  },
  'ananya.das@emamigroup.com': {
    employeeId: 'EMP10456', name: 'Ananya Das', email: 'ananya.das@emamigroup.com',
    designation: 'Deputy Manager - HR', department: 'HR', grade: 'M2', location: 'Kolkata',
    companyCode: '1000', dateOfJoining: '2018-09-03', reportingManager: 'Vikram Singh', costCenter: 'CC-1005',
  },
  'sandeep.rao@emamigroup.com': {
    employeeId: 'EMP10712', name: 'Sandeep Rao', email: 'sandeep.rao@emamigroup.com',
    designation: 'Manager - Supply Chain', department: 'Supply Chain', grade: 'M1', location: 'Guwahati',
    companyCode: '1000', dateOfJoining: '2019-04-22', reportingManager: 'Meera Nair', costCenter: 'CC-3001',
  },
  'kavita.iyer@emamigroup.com': {
    employeeId: 'EMP10998', name: 'Kavita Iyer', email: 'kavita.iyer@emamigroup.com',
    designation: 'Senior Executive - Marketing', department: 'Marketing', grade: 'E3', location: 'Mumbai',
    companyCode: '1000', dateOfJoining: '2020-11-09', reportingManager: 'Rajesh Khanna', costCenter: 'CC-4002',
  },
  'amit.singh@emamigroup.com': {
    employeeId: 'EMP10333', name: 'Amit Singh', email: 'amit.singh@emamigroup.com',
    designation: 'Assistant Manager - Manufacturing', department: 'Manufacturing', grade: 'M4', location: 'Pantnagar',
    companyCode: '1000', dateOfJoining: '2015-02-14', reportingManager: 'Deepak Malhotra', costCenter: 'CC-5003',
  },
  'neha.gupta@emamigroup.com': {
    employeeId: 'EMP10577', name: 'Neha Gupta', email: 'neha.gupta@emamigroup.com',
    designation: 'Executive - Finance', department: 'Finance', grade: 'E2', location: 'Kolkata',
    companyCode: '1000', dateOfJoining: '2022-06-01', reportingManager: 'Priya Sharma', costCenter: 'CC-1002',
  },
};

function hashToDigits(input: string, digits: number): string {
  let hash = 0;
  for (const ch of input) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return String(hash % 10 ** digits).padStart(digits, '0');
}

function titleCaseFromLocalPart(local: string): string {
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
  return name || local;
}

/** Builds a plausible profile for any hub email not in the small mock directory above, so no
 * real hub user ever hits an error just because they weren't hand-seeded — deterministic per
 * email (same input always yields the same synthesized record) rather than random. */
function synthesizeProfile(email: string): EmployeeOrgDetails {
  const local = email.split('@')[0] || email;
  return {
    employeeId: `EMP${hashToDigits(email, 5)}`,
    name: titleCaseFromLocalPart(local),
    email,
    designation: 'Executive',
    department: 'General',
    grade: 'E2',
    location: 'Kolkata',
    companyCode: '1000',
    dateOfJoining: '2023-01-01',
    reportingManager: 'Not Assigned',
    costCenter: 'CC-0000',
  };
}

function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Employee org details for the given hub email — mock lookup today, a filtered SAP
 * EmployeeOrgSet GET tomorrow (see this file's own top comment). Never rejects: an email outside
 * the small hardcoded directory gets a deterministically synthesized profile instead. */
export async function fetchEmployeeOrgDetails(email: string): Promise<EmployeeOrgDetails> {
  const key = email.trim().toLowerCase();
  const found = MOCK_DIRECTORY[key];
  return delay(found ?? synthesizeProfile(key));
}

/** Exposed only so policyService's seed data can borrow a few real-looking employees without
 * duplicating this list. Not meant for direct use by pages/components. */
export function listMockDirectoryEmployees(): EmployeeOrgDetails[] {
  return Object.values(MOCK_DIRECTORY);
}
