'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { History, UserPlus, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Banner, { type BannerState } from '../components/Banner';
import EnrolmentForm from '../components/EnrolmentForm';
import PolicyView from '../components/PolicyView';
import WindowBanner from '../components/WindowBanner';
import { Spinner } from '../components/ui';
import { getPolicy } from '../lib/mediclaim';
import type { Policy } from '../lib/types';

type Mode = 'new' | 'view' | 'change';

/** My Mediclaim: the enrolment form until the employee has a policy, then that policy read-only with "Add Nominees". */
export default function MyMediclaimPage() {
  const { ctx, isAuthUser, refresh } = useApp();
  const [mode, setMode] = useState<Mode>(ctx?.MyReqNo ? 'view' : 'new');
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(Boolean(ctx?.MyReqNo));
  const [banner, setBanner] = useState<BannerState | null>(null);

  const open = useCallback(async (reqNo: string) => {
    setLoading(true);
    setBanner(null);
    try {
      setPolicy(await getPolicy(reqNo));
      setMode('view');
    } catch (e) {
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Could not load the policy.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    if (ctx?.MyReqNo) void open(ctx.MyReqNo);
  }, [ctx, open]);

  if (!ctx) return null;

  const done = (p: Policy, kind: 'submitted' | 'changed') => {
    setPolicy(p);
    setMode('view');
    setBanner({
      type: 'success',
      message: `${kind === 'submitted' ? 'Request submitted successfully.' : 'Request changed successfully.'} Request No ${p.ReqNo}.`,
    });
    refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // The submit answer is the created entity; re-read it so the view has members and CanChange from SAP.
    getPolicy(p.ReqNo).then(setPolicy).catch(() => undefined);
  };

  const isOwn = policy && ctx.EmpId && policy.EmpId === ctx.EmpId;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-[16px] font-extrabold text-ink">My Mediclaim</h1>
        <span className="text-[12px] font-semibold text-inkSoft">Policy year {ctx.YearText}</span>
      </div>
      <WindowBanner ctx={ctx} />
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

      {loading && <Spinner />}

      {!loading && mode === 'view' && policy && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {policy.CanChange && !policy.DelFlag && (
              <button type="button" onClick={() => setMode('change')} className="btn-primary !px-3 !py-2 text-[12.5px]">
                <Users size={14} />
                Add Nominees
              </button>
            )}
            <Link href={{ pathname: '/last-year/', query: { empId: policy.EmpId } }} className="btn-ghost !px-3 !py-2 text-[12.5px]">
              <History size={14} />
              Last year application
            </Link>
            {isAuthUser && (
              <button type="button" onClick={() => { setPolicy(null); setMode('new'); setBanner(null); }} className="btn-ghost !px-3 !py-2 text-[12.5px]">
                <UserPlus size={14} />
                Enrol another employee
              </button>
            )}
            {!isOwn && <span className="text-[11.5px] text-inkSoft">Policy of employee {policy.EmpId}</span>}
          </div>
          <PolicyView policy={policy} />
        </>
      )}

      {!loading && mode === 'change' && policy && (
        <EnrolmentForm mode="change" policy={policy} onDone={done} onCancel={() => setMode('view')} />
      )}

      {!loading && mode === 'new' && (
        <>
          {ctx.MyReqNo && (
            <button type="button" onClick={() => void open(ctx.MyReqNo)} className="btn-ghost mb-3 !px-3 !py-1.5 text-[12px]">
              Back to my policy {ctx.MyReqNo}
            </button>
          )}
          <EnrolmentForm mode="new" onDone={done} onOpenPolicy={isAuthUser ? (r) => void open(r) : undefined} />
        </>
      )}
    </div>
  );
}
