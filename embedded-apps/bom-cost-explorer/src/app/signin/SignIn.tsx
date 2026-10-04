'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BASE_PATH, bffBase, exchange, hubToken } from '@/lib/client/session';
import { Button, inputCls } from '@/components/ui';

/** No login form of its own: the Emami Apps hub already authenticated the person. Their hub
 * token is exchanged for this app's session. Demo sign-in exists only in mock / dev mode. */
export default function SignIn() {
  const params = useSearchParams();
  const raw = params.get('callbackUrl') || '';
  const callbackUrl = raw.startsWith('/') && !raw.startsWith('//') ? raw : `${BASE_PATH}/`;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [email, setEmail] = useState('demo.user@example.com');
  const [plants, setPlants] = useState('1000, 1100, 1200, 1300, BD10, AE10');

  useEffect(() => {
    fetch(`${bffBase()}/api/session`).then((r) => r.json()).then((d) => setDemo(!!d.demo)).catch(() => setError('The BOM Cost Explorer server cannot be reached.'));
    if (params.get('signedOut')) return;
    const token = params.get('hubToken') || hubToken();
    if (!token) return;
    setBusy(true);
    exchange({ hubToken: token })
      .then(() => (window.location.href = callbackUrl))
      .catch((e) => {
        setBusy(false);
        setError(e.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-accent text-sm font-bold text-accent-ink" aria-hidden>BC</span>
          <div>
            <h1 className="font-semibold">BOM Cost Explorer</h1>
            <p className="text-xs text-muted">SAP costing, comparison and simulation</p>
          </div>
        </div>
        {busy && <p className="text-sm text-muted" role="status">Signing you in with your Emami Apps session…</p>}
        {error && <p className="mb-3 rounded bg-bad/10 p-2 text-sm text-bad" role="alert">{error}</p>}
        {!busy && (
          <p className="mb-4 text-sm text-muted">
            Open this app from the <strong>Emami Apps</strong> hub. Your session and plant access come from there.
          </p>
        )}
        {!busy && hubToken() && params.get('signedOut') && (
          <Button variant="primary" className="mb-4 w-full" onClick={() => { setBusy(true); exchange({ hubToken: hubToken()! }).then(() => (window.location.href = `${BASE_PATH}/`)).catch((e) => { setBusy(false); setError(e.message); }); }}>
            Continue as Emami Apps user
          </Button>
        )}
        {demo && !busy && (
          <form
            className="space-y-3 border-t border-line pt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await exchange({ demo: { email, plants } });
                window.location.href = callbackUrl;
              } catch (err) {
                setBusy(false);
                setError((err as Error).message);
              }
            }}
          >
            <p className="text-2xs font-semibold uppercase tracking-wide text-warn">Demo sign-in (mock / development only)</p>
            <label className="block text-xs text-muted">Email
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block text-xs text-muted">Allowed plants (comma separated, * = all)
              <input className={inputCls} value={plants} onChange={(e) => setPlants(e.target.value)} />
            </label>
            <Button type="submit" variant="primary" className="w-full">Sign in</Button>
          </form>
        )}
      </div>
    </main>
  );
}
