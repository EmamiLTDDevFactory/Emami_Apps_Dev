'use client';
import { useT } from '@/i18n';
import type { HistoryItem } from '@/lib/types';

export function Timeline({ items }: { items: HistoryItem[] }) {
  const t = useT();
  if (!items.length) return <p className="muted">{t('history.empty')}</p>;
  return (
    <ol className="timeline">
      {items.map((h) => (
        <li key={h.serialNo}>
          <b>{t(`history.${h.status}` as 'history.I')}</b> · {t('history.level', { level: h.level })} ({t(`history.type${h.typeLevel}` as 'history.typeI')})
          <div className="muted">{h.user} · {h.date}</div>
          {h.comment && <div>{h.comment}</div>}
        </li>
      ))}
    </ol>
  );
}
