'use client';
import type { Message } from '@/lib/types';

export function MessagePanel({ messages, onPick }: { messages: Message[]; onPick: (m: Message) => void }) {
  if (!messages.length) return null;
  return (
    <aside className="card messages" aria-live="polite">
      <h2>{messages.filter((m) => m.severity === 'E').length} error(s), {messages.filter((m) => m.severity === 'W').length} warning(s)</h2>
      <ul>
        {messages.map((m, i) => (
          <li key={i} className={m.severity === 'W' ? 'w' : ''} onClick={() => onPick(m)}>
            {m.message}
            <small>{m.code}{m.target ? ` · ${m.target}` : ''}</small>
          </li>
        ))}
      </ul>
    </aside>
  );
}
