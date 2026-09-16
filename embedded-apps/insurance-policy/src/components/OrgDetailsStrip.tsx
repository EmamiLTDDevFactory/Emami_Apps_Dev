import type { EmployeeOrgDetails } from '../types/policy';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="field-label">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </span>
  );
}

/** Compact single strip of the signed-in employee's org details — used at the top of the
 * dashboard and both policy forms so every screen shows who these details apply to without
 * spending a card-per-field's worth of vertical space on it. */
export default function OrgDetailsStrip({ employee }: { employee: EmployeeOrgDetails }) {
  return (
    <div className="glass-card mb-3 flex flex-wrap gap-x-4 gap-y-1 p-3 text-[12px]">
      <Field label="Employee ID" value={employee.employeeId} />
      <Field label="Name" value={employee.name} />
      <Field label="Designation" value={employee.designation} />
      <Field label="Department" value={employee.department} />
      <Field label="Location" value={employee.location} />
      <Field label="Grade" value={employee.grade} />
      <Field label="Reporting Manager" value={employee.reportingManager} />
    </div>
  );
}
