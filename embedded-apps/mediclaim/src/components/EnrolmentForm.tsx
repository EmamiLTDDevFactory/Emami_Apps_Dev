'use client';

/**
 * The Web Dynpro "Medical Insurance Policy" screen (view MAIN of ZWD_MEDICAIM), new enrolment and "Add Nominees" (change):
 *   1. employee id + fetch (eligibility, SAP / non-SAP mode, previous-year family carried forward)  - SPEC 2.2
 *   2. sum insured -> top-up (only for 5,00,000) -> family rows                                        - SPEC 2.3 / 2.4 / 2.6
 *   3. live premium through QuoteSet after every change (display only; SAP recomputes on submit)      - SPEC 2.5
 *   4. submit validations 1-13 with the legacy texts, then PolicySet deep POST (the change is a deep POST with the existing ReqNo) - SPEC 2.8
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { History, Plus, RefreshCw, Search, Send, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { fmtDate, fmtMoney, todayIso } from '../lib/format';
import { addNominees, fetchEmployee, listSumInsured, listTopUps, quote as quoteCall, submitPolicy } from '../lib/mediclaim';
import {
  CTC_OPTIONS, MAX_FAMILY_ROWS, RELATION_OPTIONS, ageAt, checkNonSapForSumInsured, checkQuoteInputs, checkSubmit, genderForRelation, genderLabel,
  relFromWire, relToWire, toNonSapSelf, type FamilyRowInput, type Problem, type UiRelation,
} from '../lib/rules';
import type { Employee, MemberInput, NonSapSelf, Policy, QuoteResult, SumInsuredOption, TopUpOption } from '../lib/types';
import Banner, { type BannerState } from './Banner';
import QuoteBreakdown from './QuoteBreakdown';
import { Field, Info, Section, Spinner, TableWrap, grid, inputCls, selectCls, td, tdNum, th } from './ui';

interface Row extends FamilyRowInput {
  key: number;
  /** Change flow: an existing member of the policy (read-only). */
  locked?: boolean;
  slNo?: string;
}

interface NonSapFields {
  dept: string; position: string; firstName: string; lastName: string; gender: string; location: string; corpEmail: string; age: string; ctc: string;
}

const EMPTY_NON_SAP: NonSapFields = { dept: '', position: '', firstName: '', lastName: '', gender: '', location: '', corpEmail: '', age: '', ctc: '' };
let rowKey = 0;
const newRow = (p: Partial<Row> = {}): Row => ({ key: ++rowKey, name: '', dob: '', relation: 'F', ...p });

interface Props {
  mode: 'new' | 'change';
  /** Required for mode 'change': the policy as read, with its members. */
  policy?: Policy;
  onDone: (p: Policy, kind: 'submitted' | 'changed') => void;
  onCancel?: () => void;
  /** Duplicate found at fetch: open the existing policy (admins). */
  onOpenPolicy?: (reqNo: string) => void;
}

export default function EnrolmentForm({ mode, policy, onDone, onCancel, onOpenPolicy }: Props) {
  const { ctx, isAuthUser } = useApp();
  const change = mode === 'change' && !!policy;
  const ownEmpId = ctx?.EmpId ?? '';
  // An employee with a PERNR can only enrol that PERNR (SAP refuses others); auth users (HR) may type any id.
  const idLocked = change || (!!ownEmpId && !isAuthUser);

  const [empIdInput, setEmpIdInput] = useState(change ? policy!.EmpId : ownEmpId);
  const [emp, setEmp] = useState<Employee | null>(null);
  const [fetching, setFetching] = useState(false);
  const [ns, setNs] = useState<NonSapFields>(EMPTY_NON_SAP);
  const [personalEmail, setPersonalEmail] = useState('');
  const [contact, setContact] = useState('');
  const [sumInsured, setSumInsured] = useState(0);
  const [topUpYes, setTopUpYes] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);

  const [sumOptions, setSumOptions] = useState<SumInsuredOption[]>([]);
  const [topUps, setTopUps] = useState<TopUpOption[]>([]);
  const [optionsError, setOptionsError] = useState('');

  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  const [banner, setBanner] = useState<BannerState | null>(null);
  const [bad, setBad] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const year = ctx?.Year ?? '';
  const ageDate = ctx?.AgeCalcDate ?? '';
  const fetched = change || (!!emp && emp.Eligible);
  const isSap = change ? !policy!.NoEmpIdSap : !!emp?.IsSapEmployee;
  const ready = change || (!!emp && emp.Eligible);

  const fail = useCallback((p: Problem | string) => {
    const message = typeof p === 'string' ? p : p.message;
    setBanner({ type: 'error', message });
    setBad(typeof p === 'string' ? '' : p.field);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /* ----------------------------- option lists ----------------------------- */

  useEffect(() => {
    if (change || !year) return;
    let off = false;
    Promise.all([listSumInsured(year), listTopUps(year)])
      .then(([s, t]) => {
        if (off) return;
        setSumOptions(s);
        setTopUps(t);
      })
      .catch((e) => !off && setOptionsError(e instanceof Error ? e.message : 'Could not load the sum insured options.'));
    return () => {
      off = true;
    };
  }, [change, year]);

  /* ------------------------------ change setup ------------------------------ */

  useEffect(() => {
    if (!change || !policy) return;
    const family = policy.Members.filter((m) => m.Relation !== '1');
    setSumInsured(policy.SumBase);
    setTopUpYes(policy.TopUpYes);
    setTopUpAmount(policy.TopUpPolicy);
    setPersonalEmail(policy.PersonalEmail);
    setContact(policy.Contact);
    const locked = family.map((m) => newRow({ name: m.Name, dob: m.Dob ?? '', relation: relFromWire(m.Relation, m.Gender), locked: true, slNo: m.SlNo }));
    setRows(locked.length < MAX_FAMILY_ROWS ? [...locked, newRow()] : locked);
  }, [change, policy]);

  /* ------------------------------ fetch employee ------------------------------ */

  const resetFromEmployee = (e: Employee) => {
    setEmp(e);
    setSumInsured(0);
    setTopUpYes(false);
    setTopUpAmount(0);
    setQuote(null);
    setQuoteError('');
    setNs(EMPTY_NON_SAP);
    setPersonalEmail(e.PersonalEmail);
    setContact(e.Contact);
    // Previous-year family carried forward into the rows (name / DOB / relation only), SPEC 2.2 step 5i.
    const carried = e.PrevMembers.filter((m) => m.Relation !== '1').slice(0, MAX_FAMILY_ROWS);
    setRows(carried.length ? carried.map((m) => newRow({ name: m.Name, dob: m.Dob ?? '', relation: relFromWire(m.Relation, m.Gender) })) : [newRow()]);
  };

  const doFetch = useCallback(
    async (id: string) => {
      setBanner(null);
      setBad('');
      if (!id.trim()) {
        fail({ message: 'Enter Employee ID and hit enter.', field: 'empId' });
        return;
      }
      setFetching(true);
      setEmp(null);
      try {
        const e = await fetchEmployee(id);
        resetFromEmployee(e);
        if (!e.Eligible) setBanner({ type: 'error', message: e.Reason || 'This employee cannot apply.' });
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Could not fetch the employee.');
      } finally {
        setFetching(false);
      }
    },
    [fail] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // An employee with a PERNR starts with their own record already fetched.
  const autoFetched = useRef(false);
  useEffect(() => {
    if (change || autoFetched.current || !ctx) return;
    autoFetched.current = true;
    if (ownEmpId) void doFetch(ownEmpId);
  }, [change, ctx, ownEmpId, doFetch]);

  /* --------------------------------- derived --------------------------------- */

  const siOption = sumOptions.find((o) => o.SumInsured === sumInsured);
  const topUpAllowed = change ? policy!.TopUpYes : !!siOption?.TopUpAllowed;
  const empGender = change ? policy!.Gender || (policy!.GenText === 'Male' ? '1' : policy!.GenText === 'Female' ? '2' : '') : isSap ? emp?.Gender ?? '' : ns.gender;

  const nonSapSelf: NonSapSelf | undefined = useMemo(() => {
    if (change) {
      if (!policy!.NoEmpIdSap) return undefined;
      const self = policy!.Members.find((m) => m.Relation === '1');
      return { Dept: policy!.OuText, Position: policy!.DesignTxt, FirstName: self?.Name ?? '', LastName: '', Gender: policy!.Gender, Age: policy!.AgeInYrs, Location: policy!.LocTxt, Ctc: policy!.NoEmpIdCtc };
    }
    return isSap || !emp ? undefined : toNonSapSelf(ns);
  }, [change, policy, isSap, emp, ns]);

  const used = useMemo(() => rows.filter((r) => r.dob), [rows]);
  const memberInputs = (list: Row[]): MemberInput[] =>
    list.filter((r) => r.dob).map((r) => ({ Name: r.name, Dob: r.dob, Relation: relToWire(r.relation), ...(r.slNo ? { SlNo: r.slNo } : {}) }));

  /* ---------------------------------- quote ---------------------------------- */

  const quoteSeq = useRef(0);
  const quoteKey = JSON.stringify([ready, sumInsured, topUpYes, topUpAmount, used.map((r) => [r.name, r.dob, r.relation]), nonSapSelf]);
  useEffect(() => {
    if (!ready) return;
    const mySeq = ++quoteSeq.current;
    if (!sumInsured) {
      setQuote(null);
      setQuoteError('');
      setQuoting(false);
      return;
    }
    const pre = checkQuoteInputs(sumInsured, rows);
    if (pre) {
      setQuote(null);
      setQuoteError(pre.message);
      setQuoting(false);
      return;
    }
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await quoteCall({
          EmpId: change ? policy!.EmpId : empIdInput.trim(),
          SumInsured: sumInsured,
          TopUpAmount: topUpYes ? topUpAmount : 0,
          Members: memberInputs(rows),
          nonSap: nonSapSelf,
        });
        if (mySeq !== quoteSeq.current) return;
        setQuote(q);
        setQuoteError(q.Messages);
      } catch (e) {
        if (mySeq !== quoteSeq.current) return;
        setQuote(null);
        setQuoteError(e instanceof Error ? e.message : 'Could not calculate the premium.');
      } finally {
        if (mySeq === quoteSeq.current) setQuoting(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // quoteKey carries every input the quote depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  const recalc = () => {
    // "Calculate Premium": re-run now by bumping a harmless state is unnecessary - the quote is already live; just surface pre-validation texts.
    const pre = checkQuoteInputs(sumInsured, rows);
    if (pre) fail(pre);
    else setBanner(null);
  };

  const famOut = quote?.Members.filter((m) => m.Relation !== '1') ?? [];
  const selfOut = quote?.Members.find((m) => m.Relation === '1');

  /* ---------------------------------- actions ---------------------------------- */

  const onSumInsured = (value: number) => {
    setBanner(null);
    setBad('');
    if (value && !isSap) {
      const p = checkNonSapForSumInsured({ ...ns, personalEmail, contact });
      if (p) {
        setSumInsured(0);
        fail(p);
        return;
      }
    }
    setSumInsured(value);
    const allowed = sumOptions.find((o) => o.SumInsured === value)?.TopUpAllowed;
    if (!allowed) {
      setTopUpYes(false);
      setTopUpAmount(0);
    }
  };

  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const delRow = (key: number) =>
    setRows((rs) => (rs.length > 1 || rs[0]?.locked ? rs.filter((r) => r.key !== key) : [newRow()]));
  const familyCount = rows.length;
  const canAddRow = familyCount < MAX_FAMILY_ROWS && sumInsured > 0;

  const rowAge = (r: Row): number | undefined => {
    if (!r.dob) return undefined;
    const q = famOut[used.findIndex((u) => u.key === r.key)];
    if (q?.AgeInYrs) return q.AgeInYrs;
    return ageDate ? ageAt(r.dob, ageDate) : undefined;
  };

  const submit = async () => {
    setBanner(null);
    setBad('');
    if (!isSap && !change) {
      const p = checkNonSapForSumInsured({ ...ns, personalEmail, contact });
      if (p) return fail(p);
    }
    const rowAges = used.map((r) => rowAge(r));
    const problem = checkSubmit({
      empId: change ? policy!.EmpId : empIdInput,
      fetched,
      isSap,
      firstName: change ? 'x' : emp?.FirstName ?? '',
      corpEmail: change ? policy!.CorpEmail : isSap ? emp?.CorpEmail ?? '' : ns.corpEmail,
      personalEmail,
      contact,
      sumInsured,
      topUpYes,
      topUpAmount,
      rows,
      rowAges,
    });
    if (problem) return fail(problem);
    if (quoteError) return fail(quoteError);
    if (change && !rows.some((r) => !r.locked && r.dob)) return fail({ message: 'Add at least one new nominee with a date of birth.', field: 'rows' });

    setSubmitting(true);
    try {
      if (change) {
        const added = memberInputs(rows.filter((r) => !r.locked));
        const changed = await addNominees(policy!, policy!.Members, added);
        onDone(changed, 'changed');
      } else {
        const created = await submitPolicy({
          EmpId: empIdInput.trim(),
          SumInsured: sumInsured,
          TopUpYes: topUpYes,
          TopUpAmount: topUpAmount,
          CorpEmail: isSap ? emp?.CorpEmail ?? '' : ns.corpEmail,
          PersonalEmail: personalEmail,
          Contact: contact,
          Members: memberInputs(rows),
          nonSap: nonSapSelf,
        });
        onDone(created, 'submitted');
      }
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not process.Please refresh and retry');
    } finally {
      setSubmitting(false);
    }
  };

  const clearBad = (f: string) => bad === f && setBad('');
  const setNsField = (k: keyof NonSapFields) => (v: string) => {
    clearBad(k);
    setNs((s) => ({ ...s, [k]: v }));
    // A new sum insured must be chosen again after the self details change (SPEC 2.3 re-validates on the select).
  };

  /* ---------------------------------- render ---------------------------------- */

  const selfName = change
    ? policy!.Members.find((m) => m.Relation === '1')?.Name ?? ''
    : isSap ? [emp?.FirstName, emp?.LastName].filter(Boolean).join(' ') : [ns.firstName, ns.lastName].filter(Boolean).join(' ');
  const selfGender = change ? genderLabel(empGender) : isSap ? emp?.GenderText || genderLabel(emp?.Gender ?? '') : genderLabel(ns.gender);
  const selfAge = selfOut?.AgeInYrs || (change ? policy!.AgeInYrs : isSap ? emp?.AgeInYears : Number(ns.age) || 0);
  const lastYearHref = { pathname: '/last-year/', query: { empId: change ? policy!.EmpId : empIdInput.trim() } };

  return (
    <div ref={top}>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
      {optionsError && <Banner banner={{ type: 'error', message: optionsError }} onClose={() => setOptionsError('')} />}

      <Section title="Request Details">
        <div className={grid}>
          <Info label="Request No" value={change ? policy!.ReqNo : 'Assigned on submit'} />
          <Info label="Request Date" value={fmtDate(change ? policy!.ReqDate : todayIso())} />
          <Info label="Policy Year" value={ctx?.YearText} />
        </div>
      </Section>

      <Section title="Employee Details" note={change ? undefined : '(*Note: enter the Employee ID and click Fetch)'}>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full max-w-[220px]">
            <Field label="Employee Id" required htmlFor="empId">
              <input
                id="empId"
                value={empIdInput}
                readOnly={idLocked}
                inputMode="numeric"
                maxLength={8}
                onChange={(e) => {
                  clearBad('empId');
                  setEmpIdInput(e.target.value.replace(/\D/g, ''));
                  if (emp) setEmp(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && !idLocked && void doFetch(empIdInput)}
                className={`${inputCls(bad === 'empId')} ${idLocked ? '!bg-appBg' : ''}`}
                placeholder="e.g. 00012345"
              />
            </Field>
          </div>
          {!idLocked && (
            <button type="button" onClick={() => void doFetch(empIdInput)} disabled={fetching} className="btn-primary !px-3 !py-2 text-[12.5px]">
              <Search size={13} />
              {fetching ? 'Fetching...' : 'Fetch'}
            </button>
          )}
          {idLocked && !change && (
            <button type="button" onClick={() => void doFetch(empIdInput)} disabled={fetching} className="btn-ghost !px-3 !py-2 text-[12.5px]">
              <RefreshCw size={13} />
              Reload
            </button>
          )}
        </div>
        {fetching && <Spinner className="!py-4" />}

        {emp && !emp.Eligible && emp.ExistingReqNo && onOpenPolicy && (
          <button type="button" onClick={() => onOpenPolicy(emp.ExistingReqNo)} className="btn-ghost mt-2 !px-3 !py-1.5 text-[12px]">
            Open policy {emp.ExistingReqNo}
          </button>
        )}

        {ready && (
          <div className="mt-3">
            {isSap ? (
              <div className={grid}>
                <Info label="Company" value={change ? [policy!.CompCode, policy!.CodeTxt].filter(Boolean).join(' - ') : [emp!.CompCode, emp!.CompText].filter(Boolean).join(' - ')} />
                <Info label="Department" value={change ? policy!.OuText : emp!.OuText || emp!.Dept} />
                <Info label="Designation" value={change ? policy!.DesignTxt : emp!.DesignText} />
                <Info label="Name" value={selfName} />
                <Info label="Gender" value={selfGender} />
                <Info label="Location" value={change ? policy!.LocTxt : emp!.LocText} />
                <Info label="Age in years" value={selfAge || ''} />
                <Info label="Email Id" value={change ? policy!.CorpEmail : emp!.CorpEmail} />
              </div>
            ) : change ? (
              <div className={grid}>
                <Info label="Company" value={[policy!.CompCode, policy!.CodeTxt].filter(Boolean).join(' - ')} />
                <Info label="Department" value={policy!.OuText} />
                <Info label="Position" value={policy!.DesignTxt} />
                <Info label="Name" value={selfName} />
                <Info label="Gender" value={selfGender} />
                <Info label="Location" value={policy!.LocTxt} />
                <Info label="Age in years" value={policy!.AgeInYrs} />
                <Info label="Email Id" value={policy!.CorpEmail} />
              </div>
            ) : (
              <>
                <p className="mb-2 text-[11.5px] font-semibold text-inkSoft">
                  Employee id not found in SAP: enter the details manually. {emp!.CompText ? `Company: ${emp!.CompCode} ${emp!.CompText}` : 'Company: 1000 Emami Limited'}
                </p>
                <div className={grid}>
                  <Field label="Department" required htmlFor="dept"><input id="dept" className={inputCls(bad === 'dept')} value={ns.dept} onChange={(e) => setNsField('dept')(e.target.value)} maxLength={40} /></Field>
                  <Field label="Position" required htmlFor="position"><input id="position" className={inputCls(bad === 'position')} value={ns.position} onChange={(e) => setNsField('position')(e.target.value)} maxLength={40} /></Field>
                  <Field label="First Name" required htmlFor="firstName"><input id="firstName" className={inputCls(bad === 'firstName')} value={ns.firstName} onChange={(e) => setNsField('firstName')(e.target.value)} maxLength={40} /></Field>
                  <Field label="Last Name" required htmlFor="lastName"><input id="lastName" className={inputCls(bad === 'lastName')} value={ns.lastName} onChange={(e) => setNsField('lastName')(e.target.value)} maxLength={40} /></Field>
                  <Field label="Gender" required htmlFor="gender">
                    <select id="gender" className={selectCls(bad === 'gender')} value={ns.gender} onChange={(e) => setNsField('gender')(e.target.value)}>
                      <option value="">Select</option>
                      <option value="1">Male</option>
                      <option value="2">Female</option>
                    </select>
                  </Field>
                  <Field label="Location" required htmlFor="location"><input id="location" className={inputCls(bad === 'location')} value={ns.location} onChange={(e) => setNsField('location')(e.target.value)} maxLength={40} /></Field>
                  <Field label="Age in years" required htmlFor="age"><input id="age" className={inputCls(bad === 'age')} value={ns.age} inputMode="numeric" maxLength={3} onChange={(e) => setNsField('age')(e.target.value.replace(/\D/g, ''))} /></Field>
                  <Field label="CTC" required htmlFor="ctc">
                    <select id="ctc" className={selectCls(bad === 'ctc')} value={ns.ctc} onChange={(e) => setNsField('ctc')(e.target.value)}>
                      <option value="">Select</option>
                      {CTC_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Email Id" htmlFor="corpEmail"><input id="corpEmail" type="email" className={inputCls(bad === 'corpEmail')} value={ns.corpEmail} onChange={(e) => setNsField('corpEmail')(e.target.value)} maxLength={241} /></Field>
                </div>
              </>
            )}

            <div className={`${grid} mt-3`}>
              <Field label="Personal Email" htmlFor="personalEmail">
                <input id="personalEmail" type="email" className={inputCls(bad === 'personalEmail')} value={personalEmail} readOnly={change} disabled={change}
                  onChange={(e) => { clearBad('personalEmail'); setPersonalEmail(e.target.value); }} maxLength={241} />
              </Field>
              <Field label="Mobile Number" required htmlFor="contact">
                <input id="contact" className={inputCls(bad === 'contact')} value={contact} readOnly={change} disabled={change} inputMode="tel" maxLength={30}
                  onChange={(e) => { clearBad('contact'); setContact(e.target.value); }} />
              </Field>
            </div>
          </div>
        )}
      </Section>

      {ready && (
        <>
          <Section title="Policy Details">
            <div className={grid}>
              <Field label="Sum Insured under the Base Policy (Rs)" required htmlFor="sumInsured">
                <select id="sumInsured" className={selectCls(bad === 'sumInsured')} value={sumInsured} disabled={change}
                  onChange={(e) => onSumInsured(Number(e.target.value))}>
                  {change ? <option value={sumInsured}>{fmtMoney(sumInsured)}</option> : <option value={0}>Select</option>}
                  {!change && sumOptions.map((o) => <option key={o.SumInsured} value={o.SumInsured}>{fmtMoney(o.SumInsured)}</option>)}
                </select>
              </Field>
              <Info label="Base Policy Premium" value={quote ? `Rs. ${fmtMoney(quote.PreBase)}` : ''} />
              <div className="flex items-end gap-4">
                <label className={`flex items-center gap-2 text-[12.5px] font-bold ${topUpAllowed && !change ? 'text-ink' : 'text-inkSoft'}`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#4F3FD6]"
                    checked={topUpYes}
                    disabled={!topUpAllowed || change}
                    onChange={(e) => {
                      setTopUpYes(e.target.checked);
                      if (!e.target.checked) setTopUpAmount(0);
                      clearBad('topUpAmount');
                    }}
                  />
                  Top Up Policy - Yes
                </label>
                {!topUpAllowed && sumInsured > 0 && !change && <span className="text-[11px] text-inkSoft">Top up is available only for a sum insured of 5,00,000</span>}
              </div>
              <Field label="Sum Insured under TopUp policy (Rs)" htmlFor="topUpAmount">
                <select id="topUpAmount" className={selectCls(bad === 'topUpAmount')} value={topUpAmount} disabled={!topUpYes || change}
                  onChange={(e) => { clearBad('topUpAmount'); setTopUpAmount(Number(e.target.value)); }}>
                  {change ? <option value={topUpAmount}>{fmtMoney(topUpAmount)}</option> : <option value={0}>Select</option>}
                  {!change && topUps.map((t) => <option key={t.TopUpAmount} value={t.TopUpAmount}>{fmtMoney(t.TopUpAmount)}</option>)}
                </select>
              </Field>
              <Info label="Top Up Policy Premium" value={quote && topUpYes ? `Rs. ${fmtMoney(quote.TopUpPre)}` : ''} />
              <Info label="Total Premium" value={quote ? `Rs. ${fmtMoney(quote.TotalPre)}` : ''} />
            </div>
          </Section>

          <Section
            title="Nominee(s) for Policy"
            note={sumInsured ? `Up to ${MAX_FAMILY_ROWS} nominees. Father, Mother and Spouse once each, up to 3 children (children above 30 cannot be covered).` : 'Choose the sum insured first.'}
          >
            <TableWrap>
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-border bg-cream">
                  <tr>
                    <th className={th}>Name</th>
                    <th className={th}>DOB</th>
                    <th className={th}>Relation with primary employee</th>
                    <th className={th}>Gender</th>
                    <th className={`${th} text-right`}>Age</th>
                    <th className={`${th} text-right`}>Base Premium Amt</th>
                    <th className={`${th} text-right`}>Employee Share</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60 bg-cream/60">
                    <td className={td}>{selfName || '-'}</td>
                    <td className={td}>{!isSap ? '-' : fmtDate(change ? policy!.Dob : emp?.Dob)}</td>
                    <td className={td}>Self</td>
                    <td className={td}>{selfGender}</td>
                    <td className={tdNum}>{selfAge || ''}</td>
                    <td className={tdNum}>{selfOut ? fmtMoney(selfOut.ActPre) : ''}</td>
                    <td className={tdNum}>{selfOut ? fmtMoney(selfOut.PreAmt) : ''}</td>
                    <td className={td} />
                  </tr>
                  {rows.map((r, idx) => {
                    const q = r.dob ? famOut[used.findIndex((u) => u.key === r.key)] : undefined;
                    const off = !sumInsured || !!r.locked;
                    return (
                      <tr key={r.key} className="border-b border-border/60 last:border-0">
                        <td className={td}>
                          <input aria-label={`Nominee ${idx + 1} name`} className={inputCls()} value={r.name} disabled={off} maxLength={80} onChange={(e) => setRow(r.key, { name: e.target.value })} />
                        </td>
                        <td className={td}>
                          <input aria-label={`Nominee ${idx + 1} date of birth`} type="date" className={inputCls()} value={r.dob} disabled={off} min="1900-01-01" max={todayIso()}
                            onChange={(e) => setRow(r.key, { dob: e.target.value })} />
                        </td>
                        <td className={td}>
                          <select aria-label={`Nominee ${idx + 1} relation`} className={selectCls(bad === 'rows')} value={r.relation} disabled={off}
                            onChange={(e) => { clearBad('rows'); setRow(r.key, { relation: e.target.value as UiRelation }); }}>
                            {RELATION_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                          </select>
                        </td>
                        <td className={td}>{r.dob ? genderLabel(q?.Gender || genderForRelation(r.relation, empGender)) : ''}</td>
                        <td className={tdNum}>{rowAge(r) ?? ''}</td>
                        <td className={tdNum}>{q ? fmtMoney(q.ActPre) : ''}</td>
                        <td className={tdNum}>{q ? fmtMoney(q.PreAmt) : ''}</td>
                        <td className={td}>
                          {!r.locked && (
                            <button type="button" aria-label={`Delete nominee ${idx + 1}`} onClick={() => delRow(r.key)} disabled={!sumInsured} className="rounded-md p-1 text-inkSoft hover:bg-redBg hover:text-red disabled:opacity-40">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => setRows((rs) => [...rs, newRow()])} disabled={!canAddRow} className="btn-ghost !px-2.5 !py-1.5 text-[12px]">
                <Plus size={13} />
                Add nominee
              </button>
              <span className="text-[11.5px] text-inkSoft">{familyCount} of {MAX_FAMILY_ROWS} rows</span>
            </div>
          </Section>

          <QuoteBreakdown quote={quote} busy={quoting} error={quoteError} />

          <div className="mb-6 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void submit()} disabled={submitting || quoting} className="btn-primary !px-4 !py-2 text-[13px]">
              <Send size={14} />
              {submitting ? 'Submitting...' : change ? 'Submit nominees' : 'Submit'}
            </button>
            <button type="button" onClick={recalc} disabled={quoting} className="btn-ghost !px-3 !py-2 text-[12.5px]">
              <RefreshCw size={13} />
              Calculate Premium
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel} disabled={submitting} className="btn-ghost !px-3 !py-2 text-[12.5px]">Cancel</button>
            )}
            <Link href={lastYearHref} className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-rust hover:underline">
              <History size={13} />
              Last Year&apos;s Application
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
