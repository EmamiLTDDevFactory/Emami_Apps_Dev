'use client';
/** Exclusion rules: list with what each removes in the selected period, add / edit (picker over the CDS results), on / off, Excel round-trip. */
import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { api, type ApiError } from '@/lib/api';
import { useApp } from '@/lib/context';
import { fyLabel, pctPlain, periodLabel, share, short } from '@/lib/format';
import { mapColumns, readSheet, writeBook, type Cell } from '@/lib/excel';
import type { Rule, RuleWithImpact } from '@/lib/types';
import RuleEditor from './RuleEditor';
import { Button, Card, Empty, Modal, Notice, Pill, Skeleton, cx } from '../ui';

type Data = Awaited<ReturnType<typeof api.rules>>;
const RULE_COLUMNS: Record<string, string[]> = {
  dimension: ['Dimension'], values: ['Values', 'Value'], pattern: ['Pattern'], fromFy: ['From FY'], fromPeriod: ['From period'],
  toFy: ['To FY'], toPeriod: ['To period'], reason: ['Reason'], active: ['Active'],
};

export const effective = (r: Pick<Rule, 'fromFy' | 'fromPeriod' | 'toFy' | 'toPeriod'>) =>
  `${fyLabel(r.fromFy)} P${String(r.fromPeriod).padStart(2, '0')} (${periodLabel(r.fromFy, r.fromPeriod)}) → ${r.toFy ? `${fyLabel(r.toFy)} P${String(r.toPeriod).padStart(2, '0')}` : 'no end'}`;

export default function Exclusions() {
  const { q, config, refreshAll } = useApp();
  const [data, setData] = useState<Data | { error: string } | null>(null);
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [upload, setUpload] = useState(false);
  const dims = new Map(config.dimensions.map((d) => [d.id, d.label]));

  const load = useCallback(() => {
    setData(null);
    api.rules(q).then(setData).catch((e: ApiError) => setData({ error: e.message }));
  }, [q]);
  useEffect(load, [load]);

  const changed = (text: string) => { setMsg({ tone: 'good', text }); load(); refreshAll(); };
  async function toggle(r: RuleWithImpact) {
    setBusy(r.id);
    try { await api.updateRule(r.id, { ...r, active: !r.active }); changed(`Rule #${r.id} ${r.active ? 'switched off' : 'switched on'}.`); }
    catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } finally { setBusy(null); }
  }
  async function remove(r: RuleWithImpact) {
    if (!window.confirm(`Delete rule #${r.id} (${r.reason})? It stays in the audit log.`)) return;
    setBusy(r.id);
    try { await api.deleteRule(r.id); changed(`Rule #${r.id} deleted.`); } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } finally { setBusy(null); }
  }
  const sheetRows = (rules: Rule[]): Cell[][] => [
    ['Dimension', 'Values', 'Pattern', 'From FY', 'From period', 'To FY', 'To period', 'Reason', 'Active'],
    ...rules.map((r) => [r.dimension, r.values.join(', '), r.pattern, r.fromFy, r.fromPeriod, r.toFy, r.toPeriod, r.reason, r.active ? 'Y' : 'N']),
  ];
  const readMe: Cell[][] = [
    ['Exclusion rules - one rule per row'],
    [],
    ['Dimension', 'One of the codes below'],
    ...config.dimensions.map((d) => [d.id, d.label]),
    [],
    ['Values', 'Exact codes, separated by commas (as in SAP; leading zeros optional for numbers)'],
    ['Pattern', 'Optional, for codes that may come later: range 508000-508099, wildcard EH19* or 5080??, several separated by commas'],
    ['From FY / From period', 'The rule applies to reports from this fiscal year (e.g. 2026 = FY\'27) and period (1 = April)'],
    ['To FY / To period', 'Optional end; blank = no end'],
    ['Reason', 'Required - shown in the report and the audit log'],
    ['Active', 'Y or N'],
  ];
  const template = () => writeBook('publicity-expenses-exclusions-template.xlsx', [
    { name: 'Exclusions', rows: [...sheetRows([]), ['GL', '0000508042, 0000508033', '', Number(q.fy), 1, '', '', 'Corporate brand promotion - not product A&P', 'Y'], ['COST_CENTER', '', 'EH19*', Number(q.fy), 4, Number(q.fy), 12, 'Example: cost centres moved to another report', 'N']], widths: [16, 40, 24, 9, 11, 9, 10, 50, 7] },
    { name: 'Read me', rows: readMe, widths: [22, 110] },
  ]);
  const exportRules = () => data && 'rules' in data && writeBook('publicity-expenses-exclusions.xlsx', [{ name: 'Exclusions', rows: sheetRows(data.rules), widths: [16, 60, 24, 9, 11, 9, 10, 50, 7] }, { name: 'Read me', rows: readMe, widths: [22, 110] }]);

  if (!data) return <Card><Skeleton rows={8} /></Card>;
  if ('error' in data) return <Notice>{data.error}</Notice>;
  const inForce = data.rules.filter((r) => r.inForce);
  return (
    <div className="space-y-3">
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <Card
        title={`Exclusion rules · ${data.rules.length}`}
        sub={inForce.length ? `${inForce.length} in force for the selected period remove ${short(data.total.cy)} CY (${pctPlain(share(data.total.cy, data.reportTotal))} of the G/L) and ${short(data.total.py)} PY` : 'No rule is in force for the selected period'}
        actions={<>
          <Button size="sm" onClick={template} title="Excel template with instructions"><FileSpreadsheet size={14} /> <span className="hidden sm:inline">Template</span></Button>
          <Button size="sm" onClick={() => setUpload(true)}><Upload size={14} /> <span className="hidden sm:inline">Upload</span></Button>
          <Button size="sm" onClick={exportRules} disabled={!data.rules.length}><Download size={14} /> <span className="hidden sm:inline">Export</span></Button>
          <Button size="sm" variant="primary" onClick={() => setEditing('new')}><Plus size={14} /> Add rule</Button>
        </>}
        bodyClass="p-0"
      >
        {data.rules.length === 0 ? (
          <Empty title="No exclusion rules yet">
            Take G/L accounts, cost centres, profit centres, cost-centre types, company codes, product groups or mapping rules out of the report.
            Pick the values from the SAP data of the selected period, see what they remove, give a reason and an effective period.
          </Empty>
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-muted">
                  {['#', 'Excludes', 'Effective', 'Reason', 'In force', 'Removes (CY / PY)', 'On', ''].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rules.map((r) => (
                  <tr key={r.id} className={cx('align-top', !r.active && 'text-muted')}>
                    <td className="px-3 py-2 font-bold">{r.id}</td>
                    <td className="max-w-[22rem] px-3 py-2">
                      <div className="font-semibold">{dims.get(r.dimension) ?? r.dimension}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {r.values.slice(0, 5).map((v) => <Pill key={v}>{v.replace(/^0+(?=\d)/, '')}</Pill>)}
                        {r.values.length > 5 && <Pill tone="accent">+{r.values.length - 5}</Pill>}
                        {r.pattern && <Pill tone="warn" title="Pattern">{r.pattern}</Pill>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-2xs">{effective(r)}</td>
                    <td className="max-w-[16rem] px-3 py-2"><div className="line-clamp-2" title={r.reason}>{r.reason}</div><div className="text-2xs text-faint">{r.updatedBy ?? r.createdBy}</div></td>
                    <td className="px-3 py-2">{r.inForce ? <Pill tone="good">In force</Pill> : <Pill>{r.active ? 'Not this period' : 'Off'}</Pill>}</td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right">
                      <div className="font-bold">{short(r.impact.cy)}</div>
                      <div className="text-2xs text-muted">{short(r.impact.py)} PY · {r.impact.lines} lines{r.inForce ? '' : ' (if on)'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" role="switch" aria-checked={r.active} aria-label={`Rule ${r.id} on`} disabled={busy === r.id} onClick={() => toggle(r)}
                        className={cx('relative h-5 w-9 rounded-full transition', r.active ? 'bg-accent' : 'bg-line')}>
                        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', r.active ? 'left-[18px]' : 'left-0.5')} />
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit rule ${r.id}`}><Pencil size={13} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(r)} disabled={busy === r.id} aria-label={`Delete rule ${r.id}`}><Trash2 size={13} className="text-bad" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <RuleEditor rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(r, isNew) => { setEditing(null); changed(`Rule #${r.id} ${isNew ? 'added' : 'saved'}.`); }} />}
      <BulkUpload open={upload} onClose={() => setUpload(false)} onDone={(n) => { setUpload(false); changed(`${n} rule${n === 1 ? '' : 's'} added from Excel.`); }} />
    </div>
  );
}

function BulkUpload({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (n: number) => void }) {
  const [state, setState] = useState<{ file: string; rows: Record<string, unknown>[]; errors: { row: number; message: string }[]; valid: number } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setState(null); setErr(''); } }, [open]);
  async function pickFile(f: File | undefined) {
    if (!f) return;
    setErr(''); setState(null); setBusy(true);
    try {
      const { rows } = await readSheet(f, 'Exclusions');
      const { headerRow, col } = mapColumns(rows, RULE_COLUMNS, ['dimension', 'reason', 'fromFy']);
      const out = rows.slice(headerRow + 1).map((r, i) => {
        const g = (k: string) => (col[k] === undefined ? null : r[col[k]]);
        return {
          row: headerRow + i + 2, dimension: String(g('dimension') ?? '').trim(), values: String(g('values') ?? ''), pattern: String(g('pattern') ?? ''),
          fromFy: g('fromFy'), fromPeriod: g('fromPeriod') ?? 1, toFy: g('toFy') ?? null, toPeriod: g('toPeriod') ?? null, reason: String(g('reason') ?? ''),
          active: !/^(n|no|false|0)$/i.test(String(g('active') ?? 'Y').trim()),
        };
      }).filter((r) => r.dimension || r.values || r.pattern);
      const res = await api.bulkRules(out, true, f.name);
      setState({ file: f.name, rows: out, errors: res.errors, valid: res.valid });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function confirm() {
    if (!state) return;
    setBusy(true);
    try { const res = await api.bulkRules(state.rows, false, state.file); if (res.errors.length) setState({ ...state, errors: res.errors }); else onDone(res.created.length); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Upload exclusion rules from Excel" width={640}>
      <div className="space-y-3 text-sm">
        <p className="text-muted">Use the template (sheet &quot;Exclusions&quot;, one rule per row). The file is checked first; nothing is saved until you confirm. New rules are added - existing rules stay as they are.</p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => pickFile(e.target.files?.[0])} className="block w-full text-xs" aria-label="Exclusion rules file" />
        {busy && <Skeleton rows={2} />}
        {err && <Notice>{err}</Notice>}
        {state && (
          <>
            <Notice tone={state.errors.length ? 'bad' : 'good'}>{state.file}: {state.valid} valid rule{state.valid === 1 ? '' : 's'}{state.errors.length ? `, ${state.errors.length} with errors - fix them and upload again` : ' - ready to add'}.</Notice>
            {state.errors.length > 0 && (
              <ul className="max-h-48 overflow-auto rounded-xl border border-line text-xs">
                {state.errors.map((e, i) => <li key={i} className="border-b border-line px-3 py-1.5 last:border-0"><b>Row {e.row}:</b> {e.message}</li>)}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={confirm} disabled={busy || state.errors.length > 0 || !state.valid}>Add {state.valid} rule{state.valid === 1 ? '' : 's'}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
