'use client';

import React, { useEffect, useState } from 'react';
import { publicTrack } from '../../lib/liveApi';

interface Info { status: string; from: string; to: string; vehicle: string; etaAt: string | null; plannedArrival: string | null; delayed: boolean; lastPlace: string; lastAt: string; departedAt: string | null; deliveredAt: string | null; expired?: boolean }
const fmt = (s: string) => new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

/** Public recipient page: no login; the long random token in the link is the only credential. Shows status, vehicle (masked), ETA and delivery confirmation. */
export default function TrackPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [msg, setMsg] = useState('Loading…');
  useEffect(() => {
    const tok = new URLSearchParams(window.location.search).get('t') ?? '';
    const load = () => publicTrack(tok).then(({ status, body }) => {
      if (status === 429) return setMsg('Too many requests. Please try again in a minute.');
      if (status !== 200) return setMsg('This tracking link is not valid.');
      if ((body as { expired?: boolean }).expired) return setMsg('This delivery is complete and the tracking link has expired.');
      setInfo(body as unknown as Info);
    }).catch(() => setMsg('Tracking is not available right now.'));
    load(); const t = setInterval(load, 60000); return () => clearInterval(t);
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-appBg p-4">
      <div className="card w-full max-w-md p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/apps/smartruck-tms/emami-apps-logo.png" alt="Emami" width={90} className="mb-4" />
        {!info ? <p className="text-sm font-bold text-ink">{msg}</p> : (
          <div className="space-y-3 text-sm">
            <div className="text-xs font-extrabold uppercase tracking-wider text-inkSoft">Your delivery</div>
            <div className="text-xl font-extrabold text-ink">{info.status}</div>
            <div>{info.from} → {info.to}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><div className="hint">Vehicle</div><b>{info.vehicle}</b></div>
              <div><div className="hint">{info.deliveredAt ? 'Delivered' : 'Expected arrival'}</div><b>{info.deliveredAt ? fmt(info.deliveredAt) : info.etaAt ? fmt(info.etaAt) : 'To be confirmed'}</b></div>
            </div>
            {info.delayed && !info.deliveredAt && <div className="rounded-xl bg-amberBg px-3 py-2 font-bold text-amber">The delivery is running later than planned.</div>}
            {info.lastPlace && <div className="hint">Last seen near {info.lastPlace} · {fmt(info.lastAt)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
