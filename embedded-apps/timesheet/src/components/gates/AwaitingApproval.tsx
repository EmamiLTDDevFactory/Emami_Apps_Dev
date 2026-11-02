'use client';

import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import PickManager from './PickManager';
import { BASE_PATH } from './BASE_PATH';

const POLL_MS = 8000;

// Shown once an employee has picked a manager but that manager hasn't approved them yet (see
// Shell.tsx's render gate, keyed off currentUser.status/managerId). Polls quietly in the
// background so approval takes effect without the employee having to know to reload - the same
// "always re-verify" reasoning as AppContext's hub bootstrap, just on a shorter loop since there's
// no hub round-trip involved here.
export default function AwaitingApproval({ currentUser }: { currentUser: any }) {
  const { getUserById, refreshUser } = useApp();
  const [checking, setChecking] = useState(false);
  const [pickingAgain, setPickingAgain] = useState(false);
  const manager = getUserById(currentUser.managerId);

  useEffect(() => {
    const id = setInterval(() => {
      refreshUser(currentUser.id).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [currentUser.id, refreshUser]);

  if (pickingAgain) return <PickManager changingFrom={manager} />;

  async function handleCheckNow() {
    setChecking(true);
    try {
      await refreshUser(currentUser.id);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-appBg px-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-rustLight/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-rust/15 blur-3xl" aria-hidden="true" />

      <div className="glass-panel relative w-full max-w-sm p-8 text-center">
        <div className="mb-4 flex flex-col items-center gap-2.5">
          <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Group" className="h-20 w-20 object-contain" />
          </a>
        </div>
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-border border-t-rust" aria-hidden="true" />
        <h1 className="text-lg font-bold text-ink">Waiting for approval</h1>
        <p className="mt-2 text-sm text-inkSoft">
          You asked to join <span className="font-medium text-ink">{manager?.name || 'your manager'}</span>&apos;s team. You&apos;ll be
          able to use Timesheet as soon as they approve you - this page will move on by itself once that happens.
        </p>
        <button type="button" onClick={handleCheckNow} disabled={checking} className="btn-ghost mt-5 w-full">
          {checking ? 'Checking…' : 'Check now'}
        </button>
        <button
          type="button"
          onClick={() => setPickingAgain(true)}
          className="mt-3 text-xs font-medium text-rust hover:text-rustDeep focus:outline-none focus-visible:underline"
        >
          Picked the wrong manager? Choose someone else.
        </button>
      </div>
    </div>
  );
}
