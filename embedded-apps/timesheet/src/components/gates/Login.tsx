'use client';

import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { BASE_PATH } from './BASE_PATH';

// Demo-only "log in as" picker - only ever reachable in standalone local dev (see
// AppContext.tsx's bootstrapFromHub: /auth/demo-users 404s outright once deployed, and this
// screen is never rendered for a real hub-signed-in visitor - see the render guards there).
export default function Login() {
  const { demoUsers, demoLogin, currentUserId } = useApp();
  const { showToast } = useToast();
  const [selected, setSelected] = useState(currentUserId || demoUsers[0]?.id);
  const [loggingIn, setLoggingIn] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoggingIn(true);
    try {
      await demoLogin(selected);
    } catch (err: any) {
      showToast(err.message || 'Could not log in.', 'error');
      setLoggingIn(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-appBg px-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-rustLight/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-rust/15 blur-3xl" aria-hidden="true" />

      <div className="glass-panel relative w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Group" className="h-32 w-32 object-contain" />
          </a>
          <span className="text-lg font-bold tracking-tight text-ink">TimeSheet</span>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="user-select" className="mb-1.5 block text-sm font-medium text-inkSoft">
              Log in as
            </label>
            <select
              id="user-select"
              value={selected}
              disabled={loggingIn}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:opacity-50"
            >
              {demoUsers.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.name} - {u.role === 'manager' ? 'Manager' : 'Employee'}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={loggingIn || !selected} className="btn-primary w-full">
            {loggingIn ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-inkSoft">
          No password needed - this is a demo role switcher. Try a manager to see approvals &amp; team screens.
        </p>
      </div>
    </div>
  );
}
