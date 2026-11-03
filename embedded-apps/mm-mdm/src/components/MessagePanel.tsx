'use client';
import type { Message } from '@/lib/types';
import { countOf, type TabGroup } from '@/lib/messages';

const label = (s: Message['severity']) => (s === 'E' ? 'Error' : s === 'W' ? 'Warning' : s === 'S' ? 'Success' : 'Information');

function Item({ m, onPick }: { m: Message; onPick: (m: Message) => void }) {
  return (
    <li className={m.severity === 'W' ? 'w' : m.severity === 'E' ? '' : 'i'}>
      <button type="button" className="linkbtn" onClick={() => onPick(m)}>
        <span className="sr-only">{label(m.severity)}: </span>{m.message}
        <small>{m.code}{m.target ? ` · ${m.target}` : ''}{m.target ? ' · go to field' : ''}</small>
      </button>
    </li>
  );
}

/** All messages of the last action together, grouped by tab; every message is a button that goes to its field. */
export function MessagePanel({ groups, general, onPick }: { groups: TabGroup[]; general: Message[]; onPick: (m: Message) => void }) {
  const all = [...groups.flatMap((g) => g.messages), ...general];
  if (!all.length) return null;
  const { errors, warnings } = countOf(all);
  return (
    <aside className="card messages" role="alert" aria-label="Messages">
      <h2>{errors} error(s), {warnings} warning(s)</h2>
      {groups.map((g) => (
        <section key={g.tab.id} aria-label={`${g.tab.title}: ${g.errors} errors, ${g.warnings} warnings`}>
          <h3>{g.tab.title} <span className="muted">({g.messages.length})</span></h3>
          <ul>{g.messages.map((m, i) => <Item key={i} m={m} onPick={onPick} />)}</ul>
        </section>
      ))}
      {general.length > 0 && (
        <section aria-label="General messages">
          <h3>General <span className="muted">({general.length})</span></h3>
          <ul>{general.map((m, i) => <Item key={i} m={m} onPick={onPick} />)}</ul>
        </section>
      )}
    </aside>
  );
}
