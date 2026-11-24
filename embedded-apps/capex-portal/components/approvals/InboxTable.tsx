'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { list, odataKey } from '@/lib/api';
import { fmtDate, inLakhs, priorityTone, slaLabel, slaState, slaTone } from '@/lib/format';
import type { ApprovalInbox, BudgetItem } from '@/lib/entities';
import { Button, Card, Chip, Empty, Modal, Spinner, useToast } from '@/components/ui';
import { docIdOf, isBudgetRow } from './logic';

export interface InboxTableProps {
  budget: boolean; title: string; idHeader: string; titleHeader: string; amountHeader: string; emptyText: string;
  rows: ApprovalInbox[]; loading: boolean;
  /** ids whose live record is no longer actionable by this person (log #114) */
  stale: Set<string>;
  selected: Set<string>;
  onSelect: (next: Set<string>, blocked: string[]) => void;
  myRole: string; warn: number; breach: number; busy: boolean;
  onBulk: () => void; onRefresh: () => void;
}

const PAGE = 20; // Fiori growingThreshold

export default function InboxTable(p: InboxTableProps) {
  const router = useRouter();
  const toast = useToast();
  const [shown, setShown] = useState(PAGE);
  const [itemsFor, setItemsFor] = useState<{ id: string; title: string } | null>(null);
  const [items, setItems] = useState<BudgetItem[] | null>(null);
  const visible = p.rows.slice(0, shown);
  const selectable = p.rows.map(docIdOf).filter((id) => !p.stale.has(id));

  const open = (r: ApprovalInbox) => router.push(`/approvals/detail/?type=${r.Doctype === 'BUD' ? 'BUD' : 'CPE'}&id=${encodeURIComponent(docIdOf(r))}`);

  // log #114: a stale row can never end up selected, whether by its own checkbox or by "select all"
  const toggle = (id: string) => {
    const next = new Set(p.selected);
    if (next.has(id)) { next.delete(id); p.onSelect(next, []); return; }
    if (p.stale.has(id)) { p.onSelect(next, [id]); return; }
    next.add(id); p.onSelect(next, []);
  };
  const toggleAll = (on: boolean) => {
    if (!on) { p.onSelect(new Set(), []); return; }
    p.onSelect(new Set(selectable), p.rows.map(docIdOf).filter((id) => p.stale.has(id)));
  };
  const allOn = selectable.length > 0 && selectable.every((id) => p.selected.has(id));

  const showItems = async (r: ApprovalInbox) => {
    const id = docIdOf(r);
    setItemsFor({ id, title: r.Title }); setItems(null);
    try { setItems((await list<BudgetItem>(`BudgetSet${odataKey(id)}/BudgetToItems`)).rows); }
    catch (e) { setItemsFor(null); toast(e instanceof Error ? e.message : 'Could not load the line items.', 'error'); }
  };

  const th = 'px-3 py-2 text-[11px] font-bold';
  const td = 'border-b border-sap-line px-3 py-2 align-middle';
  return (
    <Card className="mb-4" title={<>{p.title} <span className="ml-1 text-[11px] font-semibold text-sap-muted">({p.rows.length})</span></>}
      actions={<><Button variant="primary" disabled={p.busy} onClick={p.onBulk}>Approve Selected{p.selected.size ? ` (${p.selected.size})` : ''}</Button><Button aria-label="Refresh" disabled={p.busy} onClick={p.onRefresh}>Refresh</Button></>}>
      {p.loading && !p.rows.length ? <Spinner /> : (
        <div className="scroll-glass -m-4 overflow-x-auto">
          <table className="glass-table w-full min-w-[720px] border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr>
                <th className={`${th} w-8`}><input type="checkbox" aria-label="Select all" checked={allOn} onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th className={`${th} text-left`}>{p.idHeader}</th>
                <th className={`${th} text-left`}>{p.titleHeader}</th>
                <th className={`${th} hidden text-left md:table-cell`}>Plant</th>
                <th className={`${th} text-right`}>{p.amountHeader}</th>
                <th className={`${th} hidden text-left lg:table-cell`}>Submitted By</th>
                <th className={`${th} hidden text-left md:table-cell`}>Currently With</th>
                <th className={`${th} text-right`}>SLA</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {p.rows.length === 0 && <tr><td colSpan={9}><Empty>{p.emptyText}</Empty></td></tr>}
              {visible.map((r) => {
                const id = docIdOf(r);
                const st = slaState(r.DaysPending, p.warn, p.breach);
                return (
                  <tr key={`${r.Doctype}-${id}`} className="cursor-pointer" onClick={() => open(r)}>
                    <td className={td} onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${id}`} checked={p.selected.has(id)} onChange={() => toggle(id)} /></td>
                    <td className={td}>
                      <div className="font-bold text-sap-ink">{id}</div>
                      <div className="text-[11px] text-sap-muted">{fmtDate(r.SubmittedOn)}</div>
                      {p.stale.has(id) && <Chip tone="error">Already Actioned</Chip>}
                    </td>
                    <td className={td}>
                      <div>{r.Title}</div>
                      <Chip tone={priorityTone(r.Priority)}>{r.Priority ? `${r.Priority} priority` : 'No priority'}</Chip>
                    </td>
                    <td className={`${td} hidden md:table-cell`}>{r.PlantName}</td>
                    <td className={`${td} text-right font-bold`}>{inLakhs(r.Amount)}</td>
                    <td className={`${td} hidden lg:table-cell`}>{r.SubmittedByName || r.SubmittedBy}</td>
                    <td className={`${td} hidden md:table-cell`}><Chip tone={r.CurrLevel && r.CurrLevel === p.myRole ? 'success' : 'neutral'}>{r.CurrLevel || '-'}</Chip></td>
                    <td className={`${td} text-right`}><Chip tone={slaTone(st)}>{slaLabel(r.DaysPending, p.warn, p.breach)}</Chip></td>
                    <td className={`${td} whitespace-nowrap text-right`} onClick={(e) => e.stopPropagation()}>
                      {p.budget && isBudgetRow(r) && <Button className="mr-1" aria-label={`Line items of ${id}`} onClick={() => showItems(r)}>Items</Button>}
                      <Button variant="primary" onClick={() => open(r)}>Review</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {p.rows.length > shown && <div className="p-3 text-center"><Button onClick={() => setShown((n) => n + PAGE)}>Show more ({p.rows.length - shown} left)</Button></div>}
        </div>
      )}
      <Modal open={!!itemsFor} title={itemsFor ? `${itemsFor.id} · ${itemsFor.title}` : ''} onClose={() => setItemsFor(null)} wide>
        {items === null ? <Spinner /> : items.length === 0 ? <Empty>No line items.</Empty> : (
          <table className="glass-table w-full border-separate border-spacing-0 text-[12px]">
            <thead><tr><th className={`${th} text-left`}>Item</th><th className={`${th} text-left`}>Title</th><th className={`${th} text-right`}>Amount</th></tr></thead>
            <tbody>{items.map((i) => <tr key={i.Itemno}><td className={td}>{i.Itemno}</td><td className={td}>{i.ItemTitle}</td><td className={`${td} text-right`}>{inLakhs(i.Amount)}</td></tr>)}</tbody>
          </table>
        )}
      </Modal>
    </Card>
  );
}
