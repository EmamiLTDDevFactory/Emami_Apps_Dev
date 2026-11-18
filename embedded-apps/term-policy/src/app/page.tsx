'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Search, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Banner, { type BannerState } from '../components/Banner';
import { api, TermPolicyError } from '../lib/termPolicyApi';
import { checkPolicyForm, inr, shareTotal } from '../lib/validate';
import { MAX_NOMINEES, RELATIONS, type EmployeeInfo, type Nominee, type Policy, type SumOption } from '../types/policy';

const blankNominees = (): Nominee[] => Array.from({ length: MAX_NOMINEES }, () => ({ name: '', relation: '', share: '' }));
const padNominees = (n: Nominee[]) => [...n, ...blankNominees()].slice(0, MAX_NOMINEES);

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <div className="text-[12.5px] font-semibold text-ink">{value || '—'}</div>
    </div>
  );
}

export default function TermPolicyPage() {
  const { email, profile, canActForOthers, isAdmin, isMock, loading: appLoading, error: appError } = useApp();

  const [empIdInput, setEmpIdInput] = useState('');
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [options, setOptions] = useState<SumOption[]>([]);
  const [existing, setExisting] = useState<Policy | null>(null);
  const [sumAssured, setSumAssured] = useState('');
  const [contact, setContact] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [nominees, setNominees] = useState<Nominee[]>(blankNominees());
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

  const fail = (e: unknown) => setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });

  /** Fetch step of the Web Dynpro: HR data, the sum-assured slabs the limit allows, and any request already filed. */
  const loadEmployee = useCallback(
    async (empId: string) => {
      if (!email) return;
      setBusy(true);
      setBanner(null);
      setFieldError(null);
      try {
        const emp = await api.getEmployee(email, empId);
        const [opts, policies] = await Promise.all([api.getSumOptions(email, empId), api.listPolicies(email, { empId })]);
        const policy = policies[0] ?? null;
        setEmployee(emp);
        setOptions(opts);
        setExisting(policy);
        setSumAssured(policy?.sumAssured ?? '');
        setContact(policy?.contact ?? '');
        setPersonalEmail(policy?.personalEmail ?? '');
        setNominees(policy ? padNominees(policy.nominees) : blankNominees());
        if (opts.length === 0) setBanner({ type: 'error', message: 'No insurance limit is set for this employee. Contact HR.' });
      } catch (e) {
        setEmployee(null);
        setOptions([]);
        setExisting(null);
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [email]
  );

  // An ordinary employee applies for themselves: fetch straight away, no ID to type.
  useEffect(() => {
    if (appLoading || !profile || canActForOthers) return;
    if (profile.empId) {
      setEmpIdInput(profile.empId);
      void loadEmployee(profile.empId);
    }
  }, [appLoading, profile, canActForOthers, loadEmployee]);

  const slab = useMemo(() => options.find((o) => o.text === sumAssured), [options, sumAssured]);
  const total = shareTotal(nominees);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !employee) return;
    const problem = checkPolicyForm({ personalEmail, contact, hasCompanyEmail: !!employee.email, sumAssured, nominees });
    if (problem) {
      setFieldError(problem);
      setBanner({ type: 'error', message: problem.message });
      return;
    }
    setFieldError(null);
    setBusy(true);
    setBanner(null);
    try {
      const { reqno } = await api.savePolicy(email, { reqno: existing?.reqno, empId: employee.empId, sumAssured, personalEmail, contact, nominees });
      setBanner({ type: 'success', message: existing ? `Request ${reqno} changed successfully.` : `Request ${reqno} saved successfully.` });
      await loadEmployee(employee.empId);
    } catch (err) {
      if (err instanceof TermPolicyError && err.field) setFieldError({ field: err.field, message: err.message });
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!email || !existing || !employee) return;
    if (!window.confirm(`Delete request ${existing.reqno}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.deletePolicy(email, existing.reqno);
      setBanner({ type: 'success', message: 'Request Deleted.' });
      await loadEmployee(employee.empId);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const setNominee = (i: number, patch: Partial<Nominee>) => setNominees((rows) => rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const invalid = (f: string) => (fieldError?.field === f ? 'border-red' : '');

  if (appLoading) return <Spinner />;
  if (appError) return <Banner banner={{ type: 'error', message: appError }} onClose={() => undefined} />;

  return (
    <div>
      {isMock && (
        <div className="mb-3 rounded-xl border border-amber/30 bg-amberBg px-3 py-2 text-[12px] font-semibold text-amber">
          Demo mode: the SAP service ZLIFE_INS_SRV is not switched on for this build, so data is kept only in this browser.
        </div>
      )}
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

      <div className="glass-card mb-3 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-glassRust text-rust"><ShieldCheck size={14} /></div>
          <h2 className="text-[13.5px] font-bold text-ink">Term Life Policy{profile ? ` — ${profile.activeYear}` : ''}</h2>
        </div>

        {canActForOthers ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (empIdInput.trim()) void loadEmployee(empIdInput.trim());
            }}
          >
            <div>
              <label className="field-label">Employee ID</label>
              <input className="input mt-1 w-44" inputMode="numeric" value={empIdInput} onChange={(e) => setEmpIdInput(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 90000618" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !empIdInput}><Search size={13} /> Fetch</button>
          </form>
        ) : !profile?.empId ? (
          <p className="text-[12.5px] text-inkSoft">Your employee number could not be found from your company mail id. Please contact the HR department.</p>
        ) : null}
      </div>

      {busy && !employee && <Spinner />}

      {employee && (
        <>
          <div className="glass-card mb-3 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <Detail label="Employee ID" value={employee.empId} />
            <Detail label="Name" value={`${employee.firstName} ${employee.lastName}`} />
            <Detail label="Designation" value={employee.designation} />
            <Detail label="Org Unit" value={employee.orgUnit} />
            <Detail label="Location" value={employee.locationText} />
            <Detail label="Age (as at 1 Aug)" value={employee.age} />
            <Detail label="Gender" value={employee.gender} />
            <Detail label="Insurance limit" value={employee.limitText} />
          </div>

          <form onSubmit={submit} className="glass-card space-y-4 p-4">
            {existing && (
              <div className="rounded-xl bg-blueBg px-3 py-2 text-[12px] font-semibold text-blue">
                Request {existing.reqno} filed on {existing.requestDate} by {existing.createdBy}. You can change it below.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="field-label">Sum Assured</label>
                <select className={`select mt-1 ${invalid('sumAssured')}`} value={sumAssured} onChange={(e) => setSumAssured(e.target.value)}>
                  <option value="">Select…</option>
                  {options.map((o) => <option key={o.text} value={o.text}>{o.text}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Mobile</label>
                <input className={`input mt-1 ${invalid('contact')}`} inputMode="numeric" maxLength={10} value={contact} onChange={(e) => setContact(e.target.value.replace(/\D/g, ''))} placeholder="10 digits" />
              </div>
              <div>
                <label className="field-label">Personal Mail{employee.email ? ' (optional)' : ''}</label>
                <input className={`input mt-1 ${invalid('personalEmail')}`} type="email" value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} placeholder={employee.email || 'name@example.com'} />
              </div>
            </div>

            {slab && (
              <div className="grid grid-cols-3 gap-3 rounded-xl bg-glassRust p-3">
                <Detail label="Base premium" value={inr(slab.premium)} />
                <Detail label="GST" value={inr(slab.gst)} />
                <Detail label="Total premium" value={inr(slab.total)} />
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="field-label">Nominees</label>
                <span className={`text-[11.5px] font-bold ${total === 100 ? 'text-green' : 'text-amber'}`}>Share total: {total}% / 100%</span>
              </div>
              <div className="space-y-1.5">
                {nominees.map((n, i) => (
                  <div key={i} className={`grid grid-cols-[1fr_120px_72px] gap-1.5 ${fieldError?.field === 'nominees' ? 'rounded-lg ring-1 ring-red/30' : ''}`}>
                    <input className="input" placeholder={`Nominee ${i + 1} name`} value={n.name} onChange={(e) => setNominee(i, { name: e.target.value })} />
                    <select className="select" value={n.relation} onChange={(e) => setNominee(i, { relation: e.target.value as Nominee['relation'] })}>
                      <option value="">Relation</option>
                      {RELATIONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                    <input className="input" inputMode="numeric" maxLength={3} placeholder="%" value={n.share} onChange={(e) => setNominee(i, { share: e.target.value.replace(/\D/g, '') })} />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="btn btn-primary" disabled={busy || options.length === 0}>{existing ? 'Save changes' : 'Submit'}</button>
              {existing && isAdmin && (
                <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}><Trash2 size={13} /> Delete request</button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
