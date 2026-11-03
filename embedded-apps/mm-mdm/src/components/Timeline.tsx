import { ITEM_STATUS_TEXT, type HistoryItem } from '@/lib/types';

export function Timeline({ items }: { items: HistoryItem[] }) {
  if (!items.length) return <p className="muted">No history yet.</p>;
  return (
    <ol className="timeline">
      {items.map((h) => (
        <li key={h.serialNo}>
          <b>{ITEM_STATUS_TEXT[h.status]}</b> · level {h.level} ({h.typeLevel === 'I' ? 'initiator' : h.typeLevel === 'A' ? 'approver' : 'reviewer'})
          <div className="muted">{h.user} · {h.date}</div>
          {h.comment && <div>{h.comment}</div>}
        </li>
      ))}
    </ol>
  );
}
