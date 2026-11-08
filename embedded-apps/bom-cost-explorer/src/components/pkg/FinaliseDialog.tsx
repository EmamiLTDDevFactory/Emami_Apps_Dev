'use client';
import { useEffect, useState } from 'react';
import { Button, Modal, Spinner } from '../ui';
import { finaliseCounts, finaliseTarget, fmtInt } from '@/lib/pkg/rules';
import type { PkgGroup, PkgResult, PkgScen } from '@/lib/pkg/types';

/** Confirm before FINALIZE: counts from the header rows, the target table, an explicit overwrite tick; then SAP's own row counts. */
export default function FinaliseDialog({ open, scen, groups, busy, result, error, onClose, onConfirm }: {
  open: boolean; scen: PkgScen | null; groups: PkgGroup[]; busy: boolean; result: PkgResult | null; error: string; onClose: () => void; onConfirm: () => void;
}) {
  const [ok, setOk] = useState(false);
  useEffect(() => { if (open) setOk(false); }, [open]);
  const { n, m } = finaliseCounts(groups);
  return (
    <Modal
      open={open} onClose={busy ? () => {} : onClose} title={result ? 'Scenario finalised' : 'Finalise scenario'}
      footer={result ? <Button variant="primary" onClick={onClose}>Close</Button> : (
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" className="!bg-good !border-good" disabled={!ok || busy || n === 0} onClick={onConfirm}>{busy && <Spinner />} Finalise</Button>
        </>
      )}
    >
      {result ? (
        <div className="flex flex-col gap-2 text-sm">
          {result.Msg && <p>{result.Msg}</p>}
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[['ZCOMPONENT rows', result.RowsZcomp], ['ZCOMPONENTN rows', result.RowsZcompn], ['Skipped', result.RowsSkip]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl bg-sunken p-2"><dt className="text-2xs text-muted">{l}</dt><dd className="text-lg font-extrabold">{fmtInt(Number(v))}</dd></div>
            ))}
          </dl>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p><b>{fmtInt(n)}</b> {n === 1 ? 'material' : 'materials'} will be written, <b>{fmtInt(m)}</b> skipped (exceptions).</p>
          <p className="text-muted">Target: <b className="text-ink">{finaliseTarget(scen?.Werks ?? '')}</b></p>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>I understand existing rates for the same key will be overwritten</span></label>
          {error && <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-bad">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
