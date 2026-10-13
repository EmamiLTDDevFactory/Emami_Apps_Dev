'use client';
/** Checks tab: PlanCheckSet - SAP's FG and item messages grouped by plant and material, counts per message. */
import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { ErrorNote, tdCls, tdNum, thCls, thNum } from './common';
import { Button, Card, Empty, Pill, Skeleton, Toggle, cx } from '../ui';
import { fetchPlanChecks } from '@/lib/plan/client';
import { checkCols, planParams } from '@/lib/plan/export';
import { exportTable } from '@/lib/client/export';
import type { PlanCheck } from '@/lib/plan/fields';
import type { PlanWorkspace } from '@/lib/plan/workspace';

export default function ChecksTab({ ws }: { ws: PlanWorkspace }) {
  const [itemCheck, setItemCheck] = useState(ws.loaded.checks?.itemCheck ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const data = ws.loaded.checks;

  async function load(item: boolean) {
    setLoading(true);
    setError('');
    try {
      ws.setLoaded({ checks: { ...(await fetchPlanChecks(ws.plan, item, ws.plants)), itemCheck: item } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!data || data.itemCheck !== itemCheck) void load(itemCheck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCheck, ws.plan, data === null]);

  const { groups, byMsg } = useMemo(() => {
    const g = new Map<string, { werks: string; matnr: string; fg: PlanCheck[]; items: PlanCheck[] }>();
    const m = new Map<string, number>();
    for (const c of data?.rows ?? []) {
      const k = `${c.Werks}|${c.Matnr}`;
      const e = g.get(k) ?? { werks: c.Werks, matnr: c.Matnr, fg: [], items: [] };
      (c.Kind === 'FG' ? e.fg : e.items).push(c);
      g.set(k, e);
      const msg = c.Msg.replace(/\b[A-Z0-9]{6,}\b/g, '…');
      m.set(msg, (m.get(msg) ?? 0) + 1);
    }
    return { groups: [...g.values()].sort((a, b) => a.werks.localeCompare(b.werks) || a.matnr.localeCompare(b.matnr)), byMsg: [...m].sort((a, b) => b[1] - a[1]) };
  }, [data]);

  const doExport = () => data && void exportTable({ fmt: 'xlsx', name: 'Checks', cols: checkCols(data.rows), count: data.rows.length, extraParams: [...planParams(ws.query), ['Item check', itemCheck ? 'Yes' : 'No'], ['Plants', ws.plants.join(', ') || 'all']] });

  return (
    <div className="flex flex-col gap-3">
      <Card
        title="Plan checks"
        actions={
          <>
            <Toggle label="Check components too" checked={itemCheck} onChange={setItemCheck} />
            <Button size="sm" variant="ghost" onClick={() => void load(itemCheck)} disabled={loading}><RefreshCw size={14} className={cx(loading && 'animate-spin')} /></Button>
            <Button size="sm" onClick={doExport} disabled={!data?.rows.length}><FileSpreadsheet size={14} /> Excel</Button>
          </>
        }
      >
        <ErrorNote error={error} />
        {!data && loading ? <Skeleton rows={6} /> : !data ? null : !data.rows.length ? (
          <Empty title="No findings" icon="✓">SAP found nothing to report for this plan.</Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="scroll-thin max-h-[65vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-panel"><tr><th className={thCls}>Plant</th><th className={thCls}>Material</th><th className={thCls}>Kind</th><th className={thCls}>Component</th><th className={thCls}>Message</th></tr></thead>
                <tbody>
                  {groups.map((g) => [...g.fg, ...g.items].map((c, i) => (
                    <tr key={`${g.werks}|${g.matnr}|${i}`} className={cx('border-t', i === 0 ? 'border-line' : 'border-line/30')}>
                      <td className={cx(tdCls, 'font-mono')}>{i === 0 ? g.werks : ''}</td>
                      <td className={cx(tdCls, 'font-mono font-semibold')}>{i === 0 ? g.matnr : ''}</td>
                      <td className={tdCls}><Pill tone={c.Kind === 'FG' ? 'bad' : 'warn'}>{c.Kind}</Pill></td>
                      <td className={cx(tdCls, 'font-mono')}>{c.Comp}</td>
                      <td className="px-2 py-1">{c.Msg}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
            <div>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Messages</h4>
              <table className="w-full text-xs">
                <tbody>{byMsg.map(([m, n]) => <tr key={m} className="border-t border-line/50"><td className="px-2 py-1">{m}</td><td className={tdNum}>{n}</td></tr>)}</tbody>
                <tfoot><tr className="border-t-2 border-line font-bold"><td className="px-2 py-1">{groups.length} plant/material groups</td><td className={thNum}>{data.rows.length}</td></tr></tfoot>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
