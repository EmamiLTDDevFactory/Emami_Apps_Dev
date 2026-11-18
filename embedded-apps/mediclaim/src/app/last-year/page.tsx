'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import Banner, { type BannerState } from '../../components/Banner';
import PolicyView from '../../components/PolicyView';
import { Field, Section, Spinner, inputCls } from '../../components/ui';
import { getPreviousYearPolicy } from '../../lib/mediclaim';
import type { Policy } from '../../lib/types';

/** "Last Year's Application" (WD popup V_PREV_YR): the previous year's policy of the employee, read-only. */
export default function LastYearPage() {
  const { ctx } = useApp();
  const [empId, setEmpId] = useState('');
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [searched, setSearched] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);

  const show = useCallback(async (id: string) => {
    setBanner(null);
    setPolicy(null);
    setSearched(false);
    if (!id.trim()) {
      setBanner({ type: 'error', message: 'Provide employee code and hit enter' });
      return;
    }
    setLoading(true);
    try {
      const r = await getPreviousYearPolicy(id, ctx?.Year ?? '');
      setPolicy(r.policy);
      if (r.reason) setBanner({ type: 'error', message: r.reason });
      setSearched(true);
    } catch (err) {
      setBanner({ type: 'error', message: err instanceof Error ? err.message : 'Could not load last year\'s application.' });
    } finally {
      setLoading(false);
    }
  }, [ctx?.Year]);

  const first = useRef(true);
  useEffect(() => {
    if (!first.current || !ctx) return;
    first.current = false;
    // The main form links here with ?empId=; otherwise the caller's own PERNR.
    const q = new URLSearchParams(window.location.search).get('empId') || ctx.EmpId;
    if (q) {
      setEmpId(q);
      void show(q);
    }
  }, [ctx, show]);

  return (
    <div>
      <h1 className="mb-3 text-[16px] font-extrabold text-ink">Last Year&apos;s Application</h1>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
      <Section title="Employee">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full max-w-[220px]">
            <Field label="Employee Id" htmlFor="empId">
              <input id="empId" className={inputCls()} value={empId} inputMode="numeric" maxLength={8}
                onChange={(e) => setEmpId(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && void show(empId)} />
            </Field>
          </div>
          <button type="button" onClick={() => void show(empId)} disabled={loading} className="btn-primary !px-3 !py-2 text-[12.5px]">
            <Search size={13} />
            Show
          </button>
        </div>
      </Section>
      {loading && <Spinner />}
      {!loading && policy && <PolicyView policy={policy} title="Last year's request" />}
      {!loading && searched && !policy && !banner && (
        <p className="glass-card p-4 text-center text-[12.5px] text-inkSoft">No application found for the previous policy year.</p>
      )}
      <Link href="/" className="btn-ghost mt-2 !px-3 !py-1.5 text-[12px]">Back to My Mediclaim</Link>
    </div>
  );
}
