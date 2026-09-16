'use client';

import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { BASE_PATH } from './BASE_PATH';

// Shown to a brand-new employee (or one whose manager just rejected them) before they can do
// anything else in Timesheet - see AppContext.tsx's status field and Shell.tsx's render gate.
// Picking someone here doesn't attach them right away; it just moves them to AwaitingApproval to
// wait for that manager's yes/no.
export default function PickManager({ changingFrom }: { changingFrom?: any }) {
  const { fetchManagers, requestManager } = useApp();
  const { showToast } = useToast();
  const [managers, setManagers] = useState<any[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchManagers()
      .then(setManagers)
      .catch((err: Error) => setLoadError(err.message || 'Could not load the list of managers.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await requestManager(selectedId);
    } catch (err: any) {
      showToast(err.message || 'Could not send that request.', 'error');
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-appBg px-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-rustLight/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-rust/15 blur-3xl" aria-hidden="true" />

      <div className="glass-panel relative w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Group" className="h-24 w-24 object-contain" />
          <span className="text-lg font-bold tracking-tight text-ink">
            {changingFrom ? 'Pick someone else' : "Who's your reporting manager?"}
          </span>
          <p className="text-center text-sm text-inkSoft">
            {changingFrom
              ? "Choose the manager you actually report to - they'll get your request to approve."
              : "Choose your manager below. They'll need to approve you before you can start logging hours."}
          </p>
        </div>

        {loadError && <p className="mb-4 rounded-lg border border-redBg bg-redBg px-3 py-2 text-sm text-red">{loadError}</p>}

        {!loadError && managers && managers.length === 0 && (
          <p className="text-center text-sm text-inkSoft">No managers have been set up in Timesheet yet. Check back once one has.</p>
        )}

        {!loadError && managers && managers.length > 0 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="manager-select" className="mb-1.5 block text-sm font-medium text-inkSoft">
                Reporting manager
              </label>
              <select
                id="manager-select"
                value={selectedId}
                disabled={submitting}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:opacity-50"
              >
                <option value="" disabled>
                  Select a manager…
                </option>
                {managers.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={submitting || !selectedId} className="btn-primary w-full">
              {submitting ? 'Sending request…' : 'Send request'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
