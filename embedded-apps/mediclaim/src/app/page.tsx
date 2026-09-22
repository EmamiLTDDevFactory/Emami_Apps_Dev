'use client';

import { useEffect, useState } from 'react';
import { Plus, X, HeartPulse } from 'lucide-react';
import { useApp } from '../context/AppContext';
import OrgDetailsStrip from '../components/OrgDetailsStrip';
import Banner, { type BannerState } from '../components/Banner';
import YesNoToggle from '../components/YesNoToggle';
import type { Dependent, DependentRelationship, Gender, MediclaimPolicyType, Nominee } from '../types/policy';

const SUM_INSURED_OPTIONS = ['₹3,00,000', '₹5,00,000', '₹7,50,000', '₹10,00,000'];
const RELATIONSHIP_OPTIONS: DependentRelationship[] = ['Spouse', 'Child', 'Parent', 'Parent-in-law'];
const GENDER_OPTIONS: Gender[] = ['Male', 'Female', 'Other'];
const MAX_DEPENDENTS = 5;

const EMPTY_DEPENDENT: Dependent = { name: '', relationship: 'Spouse', dob: '', gender: 'Male' };
const EMPTY_NOMINEE: Nominee = { name: '', relationship: '', dob: '', contactNumber: '' };

export default function MediclaimPage() {
  const { employee, loading, myMediclaim, submitMediclaim } = useApp();

  const [policyType, setPolicyType] = useState<MediclaimPolicyType>('Self Only');
  const [sumInsured, setSumInsured] = useState(SUM_INSURED_OPTIONS[0]);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [nominee, setNominee] = useState<Nominee>(EMPTY_NOMINEE);
  const [hasPreExistingDisease, setHasPreExistingDisease] = useState(false);
  const [preExistingDiseaseDetails, setPreExistingDiseaseDetails] = useState('');
  const [existingPolicyNumber, setExistingPolicyNumber] = useState('');
  const [declared, setDeclared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);

  useEffect(() => {
    if (!myMediclaim) return;
    setPolicyType(myMediclaim.policyType);
    setSumInsured(myMediclaim.sumInsured);
    setEffectiveDate(myMediclaim.effectiveDate);
    setDependents(myMediclaim.dependents);
    setNominee(myMediclaim.nominee);
    setHasPreExistingDisease(myMediclaim.hasPreExistingDisease);
    setPreExistingDiseaseDetails(myMediclaim.preExistingDiseaseDetails);
    setExistingPolicyNumber(myMediclaim.existingPolicyNumber);
  }, [myMediclaim]);

  function updateDependent(index: number, patch: Partial<Dependent>) {
    setDependents((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!declared || !employee) return;
    setSubmitting(true);
    setBanner(null);
    try {
      await submitMediclaim({
        policyType, sumInsured, effectiveDate, dependents, nominee,
        hasPreExistingDisease, preExistingDiseaseDetails, existingPolicyNumber,
      });
      setBanner({ type: 'success', message: 'Mediclaim policy details submitted successfully.' });
    } catch (err) {
      setBanner({ type: 'error', message: err instanceof Error ? err.message : 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !employee) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <OrgDetailsStrip employee={employee} />
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

      <div className="glass-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-glassRust text-rust">
            <HeartPulse size={14} />
          </div>
          <h2 className="text-[13.5px] font-bold text-ink">Mediclaim Policy</h2>
          {myMediclaim && (
            <span className="ml-auto text-[11px] font-semibold text-inkSoft">
              Last submitted {new Date(myMediclaim.submittedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <label className="field-label">Policy Type</label>
              <select className="select mt-1" value={policyType} onChange={(e) => setPolicyType(e.target.value as MediclaimPolicyType)}>
                <option value="Self Only">Self Only</option>
                <option value="Self + Family">Self + Family</option>
              </select>
            </div>
            <div>
              <label className="field-label">Sum Insured</label>
              <select className="select mt-1" value={sumInsured} onChange={(e) => setSumInsured(e.target.value)}>
                {SUM_INSURED_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Effective Date</label>
              <input required type="date" className="input mt-1" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
          </div>

          {policyType === 'Self + Family' && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="field-label">Dependents</label>
                {dependents.length < MAX_DEPENDENTS && (
                  <button
                    type="button"
                    onClick={() => setDependents((rows) => [...rows, { ...EMPTY_DEPENDENT }])}
                    className="flex items-center gap-1 text-[11.5px] font-bold text-rust hover:underline"
                  >
                    <Plus size={12} /> Add Dependent
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {dependents.map((dep, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-1.5">
                    <input placeholder="Name" className="input" value={dep.name} onChange={(e) => updateDependent(i, { name: e.target.value })} />
                    <select className="select" value={dep.relationship} onChange={(e) => updateDependent(i, { relationship: e.target.value as DependentRelationship })}>
                      {RELATIONSHIP_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <input type="date" className="input" value={dep.dob} onChange={(e) => updateDependent(i, { dob: e.target.value })} />
                    <select className="select" value={dep.gender} onChange={(e) => updateDependent(i, { gender: e.target.value as Gender })}>
                      {GENDER_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setDependents((rows) => rows.filter((_, idx) => idx !== i))}
                      aria-label="Remove dependent"
                      className="text-inkSoft hover:text-red"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
                {dependents.length === 0 && <p className="text-[11.5px] text-inkSoft">No dependents added yet.</p>}
              </div>
            </div>
          )}

          <div>
            <label className="field-label">Nominee</label>
            <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <input required placeholder="Name" className="input" value={nominee.name} onChange={(e) => setNominee((n) => ({ ...n, name: e.target.value }))} />
              <input required placeholder="Relationship" className="input" value={nominee.relationship} onChange={(e) => setNominee((n) => ({ ...n, relationship: e.target.value }))} />
              <input required type="date" className="input" value={nominee.dob} onChange={(e) => setNominee((n) => ({ ...n, dob: e.target.value }))} />
              <input required placeholder="Contact Number" className="input" value={nominee.contactNumber} onChange={(e) => setNominee((n) => ({ ...n, contactNumber: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label mb-1 block">Any Pre-existing Disease?</label>
              <YesNoToggle value={hasPreExistingDisease} onChange={setHasPreExistingDisease} />
              {hasPreExistingDisease && (
                <textarea
                  required
                  placeholder="Describe the pre-existing disease/condition"
                  className="input mt-1.5 h-16 resize-none"
                  value={preExistingDiseaseDetails}
                  onChange={(e) => setPreExistingDiseaseDetails(e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="field-label">Existing / Ported Policy Number (optional)</label>
              <input className="input mt-1" value={existingPolicyNumber} onChange={(e) => setExistingPolicyNumber(e.target.value)} />
            </div>
          </div>

          <label className="flex items-start gap-2 text-[12px] text-ink">
            <input required type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-rust" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
            I declare that the information provided above is true and correct to the best of my knowledge.
          </label>

          <button type="submit" disabled={!declared || submitting} className="btn-primary">
            {submitting ? 'Submitting…' : myMediclaim ? 'Update Submission' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}
