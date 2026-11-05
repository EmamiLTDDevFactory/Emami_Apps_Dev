'use client';
/**
 * "BOM checklist" tab: finished goods whose BOMs or production versions are inactive, duplicated or out of step (the report's FG-level checklist),
 * for the selection of the LAST run on the first tab. Until a run exists it says "Run first". Nothing loads by itself: the checklist is read only
 * when the person presses Run checklist, and the result is kept in the shared cache for the same selection.
 */
import { Play } from 'lucide-react';
import { Button, Card, Empty, Pill, Skeleton } from '../ui';
import WacMessages from '../wac/WacMessages';
import type { BudgetQuery } from '@/lib/budget/filter';
import { checkKey, startCheck, useEntry } from '@/lib/budget/useBudget';
import { issuesOf } from '@/lib/budget/view';
import type { BudgetCheckRow } from '@/lib/budget/types';

const CTX = 'budget-run';
const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };

export default function BudgetChecklist({ runQ, email }: { runQ: BudgetQuery | null; email: string }) {
  const entry = useEntry<BudgetCheckRow>(runQ ? safe(() => checkKey(runQ, email)) : null);
  if (!runQ) return <Card><Empty title="Run first">Run the budget on the "Run and summary" tab; the checklist then uses that selection.</Empty></Card>;
  const run = (force = false) => { void startCheck(runQ, CTX, email, force); };
  return (
    <Card title="BOM and production version checklist" actions={<Button size="sm" variant="primary" onClick={() => run(entry?.status === 'done')} disabled={entry?.status === 'loading'}><Play size={13} /> {entry?.status === 'done' ? 'Refresh' : 'Run checklist'}</Button>}>
      <p className="mb-2 text-sm text-muted">Finished goods whose BOMs or production versions are inactive, duplicated or out of step. SAP checks them for the selection of the last run (the report&apos;s FG-level checklist).</p>
      {entry?.status === 'loading' && <Skeleton rows={5} />}
      <WacMessages messages={entry?.messages ?? []} error={entry?.status === 'error' ? entry.error : null} />
      {entry?.status === 'done' && <CheckTable rows={entry.data ?? []} />}
    </Card>
  );
}

function CheckTable({ rows }: { rows: BudgetCheckRow[] }) {
  const bad = rows.filter((r) => issuesOf(r).length);
  if (!rows.length) return <Empty title="Nothing to check">SAP returned no finished goods.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm"><b>{bad.length}</b> of {rows.length} finished goods have an issue.</p>
      <div className="scroll-thin max-h-[52vh] overflow-auto rounded-2xl border border-line">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead><tr className="text-left text-2xs font-extrabold uppercase text-muted">{['Material', 'Description', 'Plant', 'All BoM inactive', 'All PVer inactive', 'Multiple BoM active', 'Multiple PVer unlocked', 'Alt. BoM issue'].map((h) => <th key={h} className="sticky top-0 whitespace-nowrap border-b border-line bg-sunken px-2.5 py-2">{h}</th>)}</tr></thead>
          <tbody>
            {[...bad, ...rows.filter((r) => !issuesOf(r).length)].map((r) => (
              <tr key={`${r.Werks}|${r.Matnr}|${r.Rowid}`} className="odd:bg-panel even:bg-sunken/40">
                <td className="border-b border-line/60 px-2.5 py-1.5 font-mono text-xs font-bold text-accent">{r.Matnr}</td><td className="border-b border-line/60 px-2.5 py-1.5">{r.Maktx}</td><td className="border-b border-line/60 px-2.5 py-1.5">{r.Werks}</td>
                {[r.AllBomIn, r.AllPverIn, r.MulBom, r.MulUnlock, r.MulProd].map((f, i) => <td key={i} className="border-b border-line/60 px-2.5 py-1.5">{f ? <Pill tone="warn">X</Pill> : <span className="text-faint">–</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
