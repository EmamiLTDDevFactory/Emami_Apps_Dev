'use client';

import type { EmployeeOrgDetails } from '../types/policy';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="field-label">{label}</span>
      <span className="text-[12px] font-semibold text-ink">{value}</span>
    </span>
  );
}

export default function OrgDetailsStrip({ employee }: { employee: EmployeeOrgDetails }) {
  return (
    <div className="glass-card mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
      <Field label="Employee ID" value={employee.employeeId} />
      <Field label="Name" value={employee.name} />
      <Field label="Designation" value={employee.designation} />
      <Field label="Department" value={employee.department} />
      <Field label="Location" value={employee.location} />
      <Field label="Grade" value={employee.grade} />
    </div>
  );
}
