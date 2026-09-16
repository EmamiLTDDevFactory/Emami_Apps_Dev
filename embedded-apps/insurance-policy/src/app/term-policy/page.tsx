'use client';

import { useEffect, useState } from 'react';
import { Plus, X, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import OrgDetailsStrip from '../../components/OrgDetailsStrip';
import Banner, { type BannerState } from '../../components/Banner';
import YesNoToggle from '../../components/YesNoToggle';
import type { Nominee } from '../../types/policy';

const SUM_ASSURED_OPTIONS = ['₹25,00,000', '₹50,00,000', '₹75,00,000', '₹1,00,00,000'];
const MAX_NOMINEES = 2;
const EMPTY_NOMINEE: Nominee = { name: '', relationship: '', dob: '', contactNumber: '', sharePercent: 100 };

export default function TermPolicyPage() {
  const { employee, loading, myTermPolicy, submitTermPolicy } = useApp();

  const [sumAssured, setSumAssured] = useState(SUM_ASSURED_OPTIONS[1]);
  const [nominees, setNominees] = useState<Nominee[]>([{ ...EMPTY_NOMINEE }]);
  const [isSmoker, setIsSmoker] = useState(false);
  const [hasCriticalIllness, setHasCriticalIllness] = useState(false);
  const [criticalIllnessDetails, setCriticalIllnessDetails] = useState('');
  const [hasExistingTermCover, setHasExistingTermCover] = useState(false);
  const [existingTermCoverAmount, setExistingTermCoverAmount] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [declared, setDeclared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    if (!myTermPolicy) return;
    setSumAssured(myTermPolicy.sumAssured);
    setNominees(myTermPolicy.nominees);
    setIsSmoker(myTermPolicy.isSmoker);
    setHasCriticalIllness(myTermPolicy.hasCriticalIllness);
    setCriticalIllnessDetails(myTermPolicy.criticalIllnessDetails);
    setHasExistingTermCover(myTermPolicy.hasExistingTermCover);
    setExistingTermCoverAmount(myTermPolicy.existingTermCoverAmount);
    setHeightCm(myTermPolicy.heightCm);
    setWeightKg(myTermPolicy.weightKg);
    setEffectiveDate(myTermPolicy.effectiveDate);
  }, [myTermPolicy]);

  function updateNominee(index: number, patch: Partial<Nominee>) {
    setNominees((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!declared || !employee) return;
    const totalShare = nominees.reduce((sum, n) => sum + (Number(n.sharePercent) || 0), 0);
    if (totalShare !== 100) {
      setShareError(`Nominee share must total 100% (currently ${totalShare}%).`);
      return;
    }
    setShareError(null);
    setSubmitting(true);
    setBanner(null);
    try {
      await submitTermPolicy({
        sumAssured, nominees, isSmoker, hasCriticalIllness, criticalIllnessDetails,
        hasExistingTermCover, existingTermCoverAmount, heightCm, weightKg, effectiveDate,
      });
      setBanner({ type: 'success', message: 'Term policy details submitted successfully.' });
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
            <ShieldCheck size={14} />
          </div>
          <h2 className="text-[13.5px] font-bold text-ink">Term Life Policy</h2>
          {myTermPolicy && (
            <span className="ml-auto text-[11px] font-semibold text-inkSoft">
              Last submitted {new Date(myTermPolicy.submittedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <label className="field-label">Sum Assured</label>
              <select className="select mt-1" value={sumAssured} onChange={(e) => setSumAssured(e.target.value)}>
                {SUM_ASSURED_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Height (cm)</label>
              <input required type="number" className="input mt-1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Weight (kg)</label>
              <input required type="number" className="input mt-1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Effective Date</label>
              <input required type="date" className="input mt-1" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="field-label">Nominees (share must total 100%)</label>
              {nominees.length < MAX_NOMINEES && (
                <button
                  type="button"
                  onClick={() => setNominees((rows) => [...rows, { ...EMPTY_NOMINEE, sharePercent: 0 }])}
                  className="flex items-center gap-1 text-[11.5px] font-bold text-rust hover:underline"
                >
                  <Plus size={12} /> Add Nominee
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {nominees.map((nom, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_70px_auto] items-center gap-1.5">
                  <input required placeholder="Name" className="input" value={nom.name} onChange={(e) => updateNominee(i, { name: e.target.value })} />
                  <input required placeholder="Relationship" className="input" value={nom.relationship} onChange={(e) => updateNominee(i, { relationship: e.target.value })} />
                  <input required type="date" className="input" value={nom.dob} onChange={(e) => updateNominee(i, { dob: e.target.value })} />
                  <input required placeholder="Contact Number" className="input" value={nom.contactNumber} onChange={(e) => updateNominee(i, { contactNumber: e.target.value })} />
                  <input
                    required
                    type="number"
                    min={0}
                    max={100}
                    placeholder="%"
                    className="input"
                    value={nom.sharePercent ?? ''}
                    onChange={(e) => updateNominee(i, { sharePercent: Number(e.target.value) })}
                  />
                  {nominees.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setNominees((rows) => rows.filter((_, idx) => idx !== i))}
                      aria-label="Remove nominee"
                      className="text-inkSoft hover:text-red"
                    >
                      <X size={15} />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
            {shareError && <p className="mt-1 text-[11.5px] font-semibold text-red">{shareError}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="field-label mb-1 block">Smoker?</label>
              <YesNoToggle value={isSmoker} onChange={setIsSmoker} />
            </div>
            <div>
              <label className="field-label mb-1 block">Any Critical Illness?</label>
              <YesNoToggle value={hasCriticalIllness} onChange={setHasCriticalIllness} />
              {hasCriticalIllness && (
                <textarea
                  required
                  placeholder="Describe the critical illness"
                  className="input mt-1.5 h-14 resize-none"
                  value={criticalIllnessDetails}
                  onChange={(e) => setCriticalIllnessDetails(e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="field-label mb-1 block">Existing Term Cover Elsewhere?</label>
              <YesNoToggle value={hasExistingTermCover} onChange={setHasExistingTermCover} />
              {hasExistingTermCover && (
                <input
                  required
                  placeholder="Cover Amount"
                  className="input mt-1.5"
                  value={existingTermCoverAmount}
                  onChange={(e) => setExistingTermCoverAmount(e.target.value)}
                />
              )}
            </div>
          </div>

          <label className="flex items-start gap-2 text-[12px] text-ink">
            <input required type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-rust" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
            I declare that the information provided above is true and correct to the best of my knowledge.
          </label>

          <button type="submit" disabled={!declared || submitting} className="btn-primary">
            {submitting ? 'Submitting…' : myTermPolicy ? 'Update Submission' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}
