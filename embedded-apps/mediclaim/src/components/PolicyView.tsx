'use client';

import { fmtDate, fmtMoney, fmtRs } from '../lib/format';
import { ctcLabel, genderLabel, relLabel } from '../lib/rules';
import type { Policy } from '../lib/types';
import { Info, Section, TableWrap, grid, td, tdNum, th } from './ui';

/** Read-only policy: request, employee, policy details, premium split and members (the MAIN view in display mode). */
export default function PolicyView({ policy: p, title }: { policy: Policy; title?: string }) {
  const self = p.Members.find((m) => m.Relation === '1');
  const name = p.FullName || self?.Name || '';
  return (
    <>
      <Section
        title={title ?? 'Request Details'}
        right={p.DelFlag ? <span className="pill bg-redBg text-red">Deleted</span> : p.CanChange ? <span className="pill bg-greenBg text-green">Current year</span> : undefined}
      >
        <div className={grid}>
          <Info label="Request No" value={p.ReqNo} />
          <Info label="Request Date" value={fmtDate(p.ReqDate)} />
          <Info label="Policy Year" value={p.Year} />
        </div>
      </Section>

      <Section title="Employee Details">
        <div className={grid}>
          <Info label="Employee Id" value={p.EmpId} />
          <Info label="Name" value={name} />
          <Info label="Company" value={[p.CompCode, p.CodeTxt].filter(Boolean).join(' - ')} />
          <Info label="Department" value={p.OuText || p.Dept} />
          <Info label="Designation" value={p.DesignTxt} />
          <Info label="Location" value={p.LocTxt} />
          <Info label="Gender" value={p.GenText || genderLabel(p.Gender)} />
          <Info label="Age in years" value={p.AgeInYrs || ''} />
          {p.NoEmpIdSap && <Info label="CTC" value={ctcLabel(p.NoEmpIdCtc)} />}
          <Info label="Email Id" value={p.CorpEmail} />
          <Info label="Personal Email" value={p.PersonalEmail} />
          <Info label="Mobile Number" value={p.Contact} />
        </div>
      </Section>

      <Section title="Policy Details">
        <div className={grid}>
          <Info label="Sum Insured under the Base Policy (Rs)" value={fmtMoney(p.SumBase)} />
          <Info label="Base Policy Premium" value={fmtRs(p.PreBase)} />
          <Info label="Top Up Policy" value={p.TopUpYes ? 'Yes' : 'No'} />
          {p.TopUpYes && <Info label="Sum Insured under TopUp policy (Rs)" value={fmtMoney(p.TopUpPolicy)} />}
          {p.TopUpYes && <Info label="Top Up Policy Premium" value={fmtRs(p.TopUpPre)} />}
          <Info label="Total Premium" value={fmtRs(p.TotalPre)} />
          <Info label="Employee's Share" value={fmtRs(p.EmpShare)} />
          <Info label="Employer's Share" value={fmtRs(p.EmployerShare)} />
        </div>
      </Section>

      <Section title="Insured members" note="Self and nominees">
        <TableWrap>
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-border bg-cream">
              <tr>
                <th className={th}>Sl</th>
                <th className={th}>Name</th>
                <th className={th}>Relation with primary employee</th>
                <th className={th}>DOB</th>
                <th className={th}>Gender</th>
                <th className={`${th} text-right`}>Age</th>
                <th className={`${th} text-right`}>Base Premium Amt</th>
                <th className={`${th} text-right`}>Employee Share</th>
              </tr>
            </thead>
            <tbody>
              {p.Members.map((m) => (
                <tr key={m.SlNo} className="border-b border-border/60 last:border-0">
                  <td className={td}>{Number(m.SlNo) || m.SlNo}</td>
                  <td className={td}>
                    {m.Name}
                    {m.IsNew && <span className="pill ml-1.5 bg-amberBg text-amber">New</span>}
                  </td>
                  <td className={td}>{m.RelationText || relLabel(m.Relation, m.Gender)}</td>
                  <td className={td}>{fmtDate(m.Dob)}</td>
                  <td className={td}>{genderLabel(m.Gender)}</td>
                  <td className={tdNum}>{m.AgeInYrs || ''}</td>
                  <td className={tdNum}>{fmtMoney(m.ActPre)}</td>
                  <td className={tdNum}>{fmtMoney(m.PreAmt)}</td>
                </tr>
              ))}
              {p.Members.length === 0 && (
                <tr><td className={`${td} text-inkSoft`} colSpan={8}>No members on this policy.</td></tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Section>
    </>
  );
}
