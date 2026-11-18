'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import { SAP_SERVICE, SAP_SYSTEM } from '../lib/config';
import { isServiceDown } from '../lib/termPolicyApi';

/** Shown instead of the app when ProfileSet cannot be read (service not registered / SAP unreachable), like Mediclaim and gate-entry. */
export default function ServiceUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const down = isServiceDown(error);
  const detail = error instanceof Error ? error.message : '';
  return (
    <div className="glass-card mx-auto mt-10 max-w-md p-5 text-center" role="alert">
      <CloudOff size={28} className="mx-auto text-red" />
      <p className="mt-2 text-[14px] font-extrabold text-ink">{down ? 'Term Life service not available (SAP)' : 'Could not load Term Life Policy'}</p>
      <p className="mt-1 text-[12.5px] text-inkSoft">
        {down
          ? `The SAP service ${SAP_SERVICE} (${SAP_SYSTEM}) did not answer. It may not be registered yet or SAP may be down. Try again in a while.`
          : detail}
      </p>
      {down && detail && <p className="mt-2 break-words rounded-lg bg-appBg px-2 py-1.5 text-[11.5px] text-inkSoft">{detail}</p>}
      <button type="button" onClick={onRetry} className="btn btn-primary mt-3 inline-flex">
        <RefreshCw size={13} />
        Try again
      </button>
    </div>
  );
}
