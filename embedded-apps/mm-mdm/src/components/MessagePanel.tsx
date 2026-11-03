'use client';
import { useT, type T } from '@/i18n';
import type { Message } from '@/lib/types';
import { countOf, type TabGroup } from '@/lib/messages';

const label = (t: T, s: Message['severity']) => t(`sev.${s}` as 'sev.E');

function Item({ m, onPick }: { m: Message; onPick: (m: Message) => void }) {
  const t = useT();
  return (
    <li className={m.severity === 'W' ? 'w' : m.severity === 'E' ? '' : 'i'}>
      <button type="button" className="linkbtn" onClick={() => onPick(m)}>
        <span className="sr-only">{label(t, m.severity)}: </span>{m.message}
        <small>{m.code}{m.target ? ` · ${m.target}` : ''}{m.target ? ` · ${t('messages.goto')}` : ''}</small>
      </button>
    </li>
  );
}

/** All messages of the last action together, grouped by tab; every message is a button that goes to its field. */
export function MessagePanel({ groups, general, onPick }: { groups: TabGroup[]; general: Message[]; onPick: (m: Message) => void }) {
  const t = useT();
  const all = [...groups.flatMap((g) => g.messages), ...general];
  if (!all.length) return null;
  const { errors, warnings } = countOf(all);
  return (
    <aside className="card messages" role="alert" aria-label={t('messages.aria')}>
      <h2>{t('messages.title', { errors, warnings })}</h2>
      {groups.map((g) => (
        <section key={g.tab.id} aria-label={t('messages.groupAria', { tab: g.tab.title, errors: g.errors, warnings: g.warnings })}>
          <h3>{g.tab.title} <span className="muted">({g.messages.length})</span></h3>
          <ul>{g.messages.map((m, i) => <Item key={i} m={m} onPick={onPick} />)}</ul>
        </section>
      ))}
      {general.length > 0 && (
        <section aria-label={t('messages.generalAria')}>
          <h3>{t('messages.general')} <span className="muted">({general.length})</span></h3>
          <ul>{general.map((m, i) => <Item key={i} m={m} onPick={onPick} />)}</ul>
        </section>
      )}
    </aside>
  );
}
