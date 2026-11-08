import { CheckCheck, Copy, Lock, Plus, RefreshCw, RotateCcw, Send, Trash2 } from 'lucide-react';
import { Button, Pill, Spinner, inputCls } from '../ui';
import { StatusChip } from './StatusChip';
import { SRC_META, canDelete, canFinalise, canRecalc, canReopen, canSubmit, scenLabel, showDate, stripZeros, NO_SCEN } from '@/lib/pkg/rules';
import type { PkgScen } from '@/lib/pkg/types';

export type BarAction = 'RECALC' | 'COPY' | 'SUBMIT' | 'FINALIZE' | 'REOPEN' | 'DELETE';

export default function ScenarioBar({ scens, scen, pending, onSelect, onNew, onAction, onOpenBase }: {
  scens: PkgScen[]; scen: PkgScen | null; pending: string; onSelect: (id: string) => void; onNew: () => void; onAction: (a: BarAction) => void; onOpenBase: (id: string) => void;
}) {
  const busy = !!pending;
  const btn = (a: BarAction, label: string, icon: React.ReactNode, ok: boolean, variant: 'primary' | 'secondary' | 'danger' = 'secondary', extra = '') => (
    <Button size="sm" variant={variant} className={extra} disabled={!scen || !ok || busy} onClick={() => onAction(a)}>{pending === a ? <Spinner /> : icon} {label}</Button>
  );
  const st = scen?.Status ?? '';
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Scenario" className={`${inputCls} max-w-xl flex-1`} value={scen?.ScenId ?? ''} disabled={busy} onChange={(e) => onSelect(e.target.value)}>
          {!scen && <option value="">Select a scenario</option>}
          {scens.map((s) => <option key={s.ScenId} value={s.ScenId}>{scenLabel(s)}</option>)}
        </select>
        <Button size="sm" variant="primary" onClick={onNew} disabled={busy}><Plus size={14} /> New</Button>
        <span className="mx-1 hidden h-6 w-px bg-line md:block" />
        <div className="flex flex-wrap gap-2">
          {btn('RECALC', 'Recalculate', <RefreshCw size={14} />, canRecalc(st))}
          {btn('COPY', 'Copy', <Copy size={14} />, !!scen)}
          {btn('SUBMIT', 'Submit', <Send size={14} />, canSubmit(st))}
          {btn('FINALIZE', 'Finalise', <CheckCheck size={14} />, canFinalise(st), 'primary', '!bg-good !border-good')}
          {btn('REOPEN', 'Reopen', <RotateCcw size={14} />, canReopen(st))}
          {btn('DELETE', 'Delete', <Trash2 size={14} />, canDelete(st), 'danger')}
        </div>
      </div>
      {scen && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <StatusChip status={scen.Status} />
          <Pill tone="accent">v{scen.BudgetVersion}</Pill>
          <span className="font-semibold text-ink">{scen.Descr}</span>
          <span>Plant {scen.Werks}</span>
          <span>{showDate(scen.ValidFrom)} to {showDate(scen.ValidTo)}</span>
          <span>FY {scen.BudgetYear}</span>
          <span>Key date {showDate(scen.KeyDate)}</span>
          <span className="inline-flex items-center gap-1" title="Rate source priority">
            {scen.Prio.split(/[\s,>]+/).filter(Boolean).map((p, i, a) => (
              <span key={p} className="inline-flex items-center gap-1"><span className={`rounded px-1 py-0.5 text-2xs font-bold ${SRC_META[p] ?? 'bg-sunken'}`}>{p}</span>{i < a.length - 1 && '›'}</span>
            ))}
          </span>
          {scen.Norm === 'X' && <Pill tone="neutral">Normalise % ON</Pill>}
          {scen.BaseScenId && scen.BaseScenId !== NO_SCEN && (
            <span>Copied from <button type="button" className="font-semibold text-accent underline" onClick={() => onOpenBase(scen.BaseScenId)}>#{stripZeros(scen.BaseScenId)}</button></span>
          )}
          {(scen.CreatedBy || scen.FinalBy) && <span className="cursor-help underline decoration-dotted" title={`Created by ${scen.CreatedBy || '—'}${scen.FinalBy ? `\nFinalised by ${scen.FinalBy}` : ''}`}>Audit</span>}
          {!['D', 'C'].includes(st) && <span className="inline-flex items-center gap-1 font-semibold"><Lock size={12} /> Read-only</span>}
        </div>
      )}
    </div>
  );
}
