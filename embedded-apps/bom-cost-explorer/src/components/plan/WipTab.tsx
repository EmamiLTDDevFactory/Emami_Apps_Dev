'use client';
/** WIP tab: PlanWipSet - WIP requirement per finished good. "Save as WIP plan" groups the rows by component,
 * plant and country, sums the months, names the plan "WIP <plan>" and hands it to the upload wizard (check,
 * then save). */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Save } from 'lucide-react';
import { ErrorNote, RoleNote, tdCls, tdNum, thCls, thNum } from './common';
import { PENDING_UPLOAD_KEY } from '@/lib/plan/upload';
import { Button, Card, Empty, Skeleton, cx } from '../ui';
import { fetchPlanWip } from '@/lib/plan/client';
import { wipPlanName, wipPlanRows } from '@/lib/plan/scenarios';
import { FISCAL_MONTHS, monthKeys } from '@/lib/plan/fields';
import type { PlanWorkspace } from '@/lib/plan/workspace';
import { fmtNum } from '@/lib/format';

const QM = monthKeys('Qm');

export default function WipTab({ ws }: { ws: PlanWorkspace }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const data = ws.loaded.wip;

  async function load() {
    setLoading(true);
    setError('');
    try {
      ws.setLoaded({ wip: await fetchPlanWip(ws.plan, ws.plants) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!data) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.plan, data === null]);

  const planRows = useMemo(() => (data ? wipPlanRows(ws.plan, data.rows) : []), [data, ws.plan]);
  const saveAsPlan = () => {
    try {
      sessionStorage.setItem(PENDING_UPLOAD_KEY, JSON.stringify({ source: `WIP of ${ws.plan}`, rows: planRows }));
    } catch {
      setError('This browser blocked session storage; the WIP plan cannot be handed to the upload page.');
      return;
    }
    router.push('/plan/upload/');
  };

  return (
    <div className="flex flex-col gap-3">
      <RoleNote ws={ws} />
      <Card
        title="WIP requirement"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={cx(loading && 'animate-spin')} /></Button>
            <Button size="sm" variant="primary" disabled={!ws.canWrite || !planRows.length} onClick={saveAsPlan} title={`Group by component + plant + country into plan "${wipPlanName(ws.plan)}", then check and save in the upload wizard`}>
              <Save size={14} /> Save as WIP plan ({planRows.length} rows)
            </Button>
          </>
        }
        bodyClass="p-0"
      >
        <div className="px-3 pt-2"><ErrorNote error={error} /></div>
        {!data && loading ? <Skeleton rows={6} /> : !data ? null : !data.rows.length ? <Empty title="No WIP in this plan" /> : (
          <div className="scroll-thin max-h-[65vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel">
                <tr>
                  <th className={thCls}>FG</th><th className={thCls}>Plant</th><th className={thCls}>Country</th><th className={thNum}>Net wt</th><th className={thCls}>WIP component</th>
                  {FISCAL_MONTHS.map((m) => <th key={m} className={thNum}>{m}</th>)}
                  <th className={thNum}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((w, i) => (
                  <tr key={i} className="border-t border-line/50">
                    <td className={tdCls}><span className="font-mono font-semibold">{w.Matnr}</span> <span className="text-muted">{w.FgTxt}</span></td>
                    <td className={cx(tdCls, 'font-mono')}>{w.Werks}</td>
                    <td className={tdCls}>{w.Land1}</td>
                    <td className={tdNum}>{fmtNum(w.Ntgew, 3, 'X')} {w.Gewei}</td>
                    <td className={tdCls}><span className="font-mono">{w.Comp}</span> <span className="text-muted">{w.CompTxt}</span></td>
                    {QM.map((k) => <td key={k} className={tdNum}>{fmtNum((w as unknown as Record<string, string>)[k], 0, 'X')}</td>)}
                    <td className={cx(tdNum, 'font-semibold')}>{fmtNum(w.Qtot, 3, 'X')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
