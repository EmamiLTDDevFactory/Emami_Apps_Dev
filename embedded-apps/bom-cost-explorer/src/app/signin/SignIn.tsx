'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, LogIn } from 'lucide-react';
import { BASE_PATH, bffBase, exchange, hubToken } from '@/lib/client/session';
import { Button, inputCls } from '@/components/ui';

/** No login form of its own: the Emami Apps hub already authenticated the person and their hub
 * token is exchanged for this app's session. (A local-development sign-in appears only when the
 * BFF runs with MOCK_SAP / ALLOW_DEMO_LOGIN - never on a deployed server.) */
export default function SignIn() {
  const params = useSearchParams();
  const raw = params.get('callbackUrl') || '';
  const callbackUrl = raw.startsWith('/') && !raw.startsWith('//') ? raw : `${BASE_PATH}/`;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [hasHub, setHasHub] = useState(false);
  const [email, setEmail] = useState('');

  const viaHub = (token: string) => {
    setBusy(true);
    exchange({ hubToken: token })
      .then(() => (window.location.href = callbackUrl))
      .catch((e) => {
        setBusy(false);
        setError(e.message);
      });
  };

  useEffect(() => {
    fetch(`${bffBase()}/api/session`, { cache: 'no-store' }).then((r) => r.json()).then((d) => setDemo(!!d.demo)).catch(() => setError('The BOM Cost Explorer server cannot be reached. Please try again later.'));
    const token = params.get('hubToken') || hubToken();
    setHasHub(!!token);
    if (token && !params.get('signedOut')) viaHub(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <a href="/" className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep">
        <ArrowLeft size={14} /> Back to Emami Apps
      </a>
      <div className="grid flex-1 place-items-center p-4">
        <div className="w-full max-w-sm animate-slideUp rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={150} height={124} className="mx-auto" />
          <h1 className="mt-4 text-lg font-extrabold text-ink">BOM Cost Explorer</h1>
          <p className="text-xs text-muted">SAP BOM costing, plant comparison and what-if simulation</p>

          {busy && (
            <div className="mt-6 flex flex-col items-center gap-3" role="status">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-accent border-t-transparent" />
              <p className="text-sm text-muted">Signing you in with your Emami Apps session…</p>
            </div>
          )}
          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-xl bg-bad/10 p-3 text-left text-sm text-bad" role="alert">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          {!busy && (
            <div className="mt-6 flex flex-col gap-2">
              {hasHub ? (
                <Button variant="primary" onClick={() => viaHub(hubToken() || params.get('hubToken') || '')}><LogIn size={15} /> Continue as Emami Apps user</Button>
              ) : (
                <p className="text-sm text-muted">Open this app from the <strong>Emami Apps</strong> hub. Your sign-in and access come from there.</p>
              )}
              <a href="/" className="text-xs font-semibold text-accent hover:underline">Go to Emami Apps</a>
            </div>
          )}

          {demo && !busy && (
            <form
              className="mt-6 space-y-2 border-t border-line pt-5 text-left"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await exchange({ demo: { email: email || 'developer@example.com' } });
                  window.location.href = callbackUrl;
                } catch (err) {
                  setBusy(false);
                  setError((err as Error).message);
                }
              }}
            >
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-warn">Local development sign-in</p>
              <input className={inputCls} type="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button type="submit" className="w-full">Sign in</Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
